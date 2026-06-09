import Vapor

/// Logs every HTTP request with its duration, skipping configured paths.
/// Replaces Vapor's default RouteLoggingMiddleware to:
/// - keep noisy probe paths (/metrics, /health) out of the logs
/// - include response duration in the log metadata
public struct HTTPLoggingMiddleware: AsyncMiddleware {
    private let excludedPaths: Set<String>

    public init(excludedPaths: [String] = ["/metrics", "/health"]) {
        self.excludedPaths = Set(excludedPaths)
    }

    public func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let path = request.url.path

        guard !excludedPaths.contains(path) else {
            return try await next.respond(to: request)
        }

        // DispatchTime, not Date: monotonic — wall-clock jumps (NTP) can't produce
        // negative or absurd durations.
        let start = DispatchTime.now()

        do {
            let response = try await next.respond(to: request)
            let durationMs = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000

            request.logger.info("\(request.method) \(path) \(response.status.code)", metadata: [
                "method": "\(request.method)",
                "path": "\(path)",
                "status": "\(response.status.code)",
                "duration_ms": "\(String(format: "%.1f", durationMs))",
            ])

            return response
        } catch {
            let durationMs = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000

            request.logger.error("\(request.method) \(path) ERROR", metadata: [
                "method": "\(request.method)",
                "path": "\(path)",
                "duration_ms": "\(String(format: "%.1f", durationMs))",
                "error": "\(error)",
            ])

            throw error
        }
    }
}
