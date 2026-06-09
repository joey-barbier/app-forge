import Vapor
import Logging
import Monitoring

@main
enum Entrypoint {
    static func main() async throws {
        var env = try Environment.detect()

        // JSON structured logs in release (one object per line — Loki/Grafana-ready),
        // human-readable text locally. Level comes from --log / LOG_LEVEL: NEVER hardcoded.
        if env.isRelease {
            let level = try Logger.Level.detect(from: &env)
            LoggingSystem.bootstrap { label in
                JSONLogHandler(label: label, level: level)
            }
        } else {
            try LoggingSystem.bootstrap(from: &env)
        }

        let app = try await Application.make(env)

        do {
            try await configure(app)
        } catch {
            app.logger.report(error: error)
            try? await app.asyncShutdown()
            throw error
        }
        try await app.execute()
        try await app.asyncShutdown()
    }
}

private extension Logger.Level {
    /// Precedence: --log CLI flag > LOG_LEVEL env var > environment default.
    static func detect(from environment: inout Environment) throws -> Logger.Level {
        struct LogSignature: CommandSignature {
            @Option(name: "log", help: "Change log level")
            var level: Logger.Level?
            init() { }
        }
        return try LogSignature(from: &environment.commandInput).level
            ?? Environment.process.LOG_LEVEL
            ?? (environment == .production ? .notice : .info)
    }
}
