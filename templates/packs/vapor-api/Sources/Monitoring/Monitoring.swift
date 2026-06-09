import Vapor
import Prometheus
import Metrics

/// Process-global Prometheus registry.
///
/// `MetricsSystem.bootstrap` may only run ONCE per process, while tests boot many
/// `Application`s — so both the registry and the bootstrap are anchored to the process
/// (thread-safe lazy `static let`), never to an `Application`.
public enum MetricsRegistry {
    public static let shared: PrometheusCollectorRegistry = {
        let registry = PrometheusCollectorRegistry()
        MetricsSystem.bootstrap(PrometheusMetricsFactory(registry: registry))
        return registry
    }()
}

extension Application {
    /// Storage key for the Prometheus registry (set when monitoring is enabled).
    public struct PrometheusRegistryKey: StorageKey {
        public typealias Value = PrometheusCollectorRegistry
    }

    /// Storage key for the /metrics bearer token.
    public struct MetricsTokenKey: StorageKey {
        public typealias Value = String
    }
}

/// Wire monitoring into the app. Disabled → no registry in storage → /metrics returns 503.
public func configureMonitoring(app: Application, enabled: Bool, metricsToken: String) {
    guard enabled else {
        app.logger.info("[MONITORING] disabled")
        return
    }

    app.storage[Application.PrometheusRegistryKey.self] = MetricsRegistry.shared
    app.storage[Application.MetricsTokenKey.self] = metricsToken

    app.logger.info("[MONITORING] enabled — backend: swift-prometheus")
}

/// The /metrics route handler: bearer-token gated (constant-time compare), emits the
/// Prometheus text format. Lives here so the App target never imports Prometheus directly.
public func handleMetricsRequest(_ req: Request) throws -> Response {
    guard let registry = req.application.storage[Application.PrometheusRegistryKey.self],
          let token = req.application.storage[Application.MetricsTokenKey.self] else {
        throw Abort(.serviceUnavailable, reason: "Monitoring not configured")
    }

    guard let bearer = req.headers.bearerAuthorization else {
        throw Abort(.unauthorized, reason: "Missing authentication token")
    }

    guard constantTimeCompare(bearer.token, token) else {
        throw Abort(.unauthorized, reason: "Invalid authentication token")
    }

    var buffer: [UInt8] = []
    registry.emit(into: &buffer)

    var headers = HTTPHeaders()
    headers.add(name: .contentType, value: "text/plain; version=0.0.4; charset=utf-8")
    return Response(status: .ok, headers: headers, body: .init(string: String(decoding: buffer, as: UTF8.self)))
}

/// Increment the HTTP error counter (called by the typed-error middleware). Counter
/// emission is an L1 concern — feature code never touches the metrics API directly.
public func recordHTTPError(status: UInt, errorName: String) {
    Counter(label: "http_errors_total",
            dimensions: [("status", "\(status)"), ("error", errorName)]).increment()
}

/// Constant-time comparison to prevent timing attacks on the bearer token.
/// Always iterates over the max length of both inputs to avoid leaking length information.
public func constantTimeCompare(_ lhs: String, _ rhs: String) -> Bool {
    let lhsData = Array(lhs.utf8)
    let rhsData = Array(rhs.utf8)
    let maxLen = max(lhsData.count, rhsData.count)

    // Length mismatch must still fail, but without an early return.
    var accumulator: UInt8 = lhsData.count == rhsData.count ? 0 : 1

    for i in 0..<maxLen {
        let lhsByte: UInt8 = i < lhsData.count ? lhsData[i] : 0
        let rhsByte: UInt8 = i < rhsData.count ? rhsData[i] : 0
        accumulator |= lhsByte ^ rhsByte
    }
    return accumulator == 0
}
