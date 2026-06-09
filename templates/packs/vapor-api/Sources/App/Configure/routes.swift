import Fluent
import Vapor
import Monitoring

func routes(_ app: Application) throws {
    // Feature modules — exactly ONE register line per module (auto-registration:
    // the module's Controllers enum conforms to ControllersRegister).
    try App.Item.Controllers.register(app: app)

    // Liveness probe for load balancers / uptime monitors.
    // Unauthenticated by design; excluded from request logs (HTTPLoggingMiddleware).
    app.get("health") { _ in
        ["status": "ok"]
    }

    // Prometheus scrape endpoint — bearer-token gated with a constant-time compare.
    // Handler lives in the Monitoring target (L1); see docs-architecture/OPS.md.
    app.get("metrics") { req in
        try handleMetricsRequest(req)
    }
}
