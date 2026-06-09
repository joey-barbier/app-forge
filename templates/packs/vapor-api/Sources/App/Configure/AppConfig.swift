import Vapor

/// Typed, fail-fast runtime configuration.
///
/// THE rule: every value the app reads from the environment goes through `Key` — never
/// call `Environment.get` anywhere else. A missing variable kills the boot with a named
/// error instead of surfacing as a nil three requests later.
///
/// Cross-check discipline: each `Key` case must exist in `env_dist` AND in every deploy
/// manifest (compose files, CI workflows). `scripts/validate-env-vars.sh` enforces it.
struct AppConfig: Sendable {
    let databaseHost: String
    let databasePort: Int
    let databaseUsername: String
    let databasePassword: String
    let databaseName: String
    let allowedOrigin: String
    let monitoringEnabled: Bool
    let metricsToken: String

    static func load(for environment: Environment) -> AppConfig {
        // `.testing` is EXPLICIT — tests pass it to `Application.make(.testing)`.
        // Never sniff the test runner from process arguments or env leftovers.
        guard environment != .testing else { return .testing }

        return AppConfig(
            databaseHost: Key.DATABASE_HOST.get,
            databasePort: Key.DATABASE_PORT.getInt,
            databaseUsername: Key.DATABASE_USERNAME.get,
            databasePassword: Key.DATABASE_PASSWORD.get,
            databaseName: Key.DATABASE_NAME.get,
            allowedOrigin: Key.ALLOWED_ORIGIN.get,
            monitoringEnabled: Key.MONITORING_ENABLED.getBool,
            metricsToken: Key.METRICS_TOKEN.get
        )
    }

    /// Test fixture — the database values are unused (testing runs on in-memory SQLite),
    /// monitoring is on so the /metrics contract stays under test.
    static let testing = AppConfig(
        databaseHost: "unused-in-testing",
        databasePort: 0,
        databaseUsername: "unused-in-testing",
        databasePassword: "unused-in-testing",
        databaseName: "unused-in-testing",
        allowedOrigin: "http://localhost:3000",
        monitoringEnabled: true,
        metricsToken: "test-metrics-token"
    )
}

extension AppConfig {
    /// One case per environment variable — `CaseIterable` so the validation script can
    /// grep this enum and cross-check `env_dist` + deploy manifests.
    enum Key: String, CaseIterable {
        case DATABASE_HOST
        case DATABASE_PORT
        case DATABASE_USERNAME
        case DATABASE_PASSWORD
        case DATABASE_NAME
        case ALLOWED_ORIGIN
        case MONITORING_ENABLED
        case METRICS_TOKEN

        /// Fail fast at boot — a missing variable must kill the process by name.
        var get: String {
            guard let value = Environment.get(rawValue) else {
                fatalError("""
                Missing environment variable \(rawValue) — add it to .env AND env_dist \
                AND every deploy manifest, then run scripts/validate-env-vars.sh.
                """)
            }
            return value
        }

        var getInt: Int {
            guard let value = Int(get) else {
                fatalError("Environment variable \(rawValue) must be an integer (got '\(get)')")
            }
            return value
        }

        var getBool: Bool {
            ["true", "1", "yes"].contains(get.lowercased())
        }
    }
}

// MARK: - Dependency injection via Application.storage

extension AppConfig {
    struct StorageKey: Vapor.StorageKey {
        typealias Value = AppConfig
    }
}

extension Application {
    var config: AppConfig {
        guard let config = storage[AppConfig.StorageKey.self] else {
            fatalError("AppConfig not loaded — configure(_:) must store it before first use")
        }
        return config
    }
}

extension Request {
    var config: AppConfig { application.config }
}
