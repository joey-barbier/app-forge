import Fluent
import FluentPostgresDriver
import FluentSQLiteDriver
import Vapor
import Monitoring

/// Composition root. Order matters: config → database → migrations → middlewares →
/// monitoring → routes → migrate.
public func configure(_ app: Application) async throws {
    let config = AppConfig.load(for: app.environment)
    app.storage[AppConfig.StorageKey.self] = config

    try databasesInit(app, config: config)
    migrationsInit(app)
    middlewaresInit(app, config: config)

    try configureMonitoring(
        app: app,
        enabled: config.monitoringEnabled,
        metricsToken: config.metricsToken
    )

    try routes(app)

    try await app.autoMigrate()
}

private func databasesInit(_ app: Application, config: AppConfig) throws {
    if app.environment == .testing {
        // In-memory SQLite: tests boot the FULL stack (migrations included) with zero
        // external services. PostgreSQL-specific behavior still needs a CI job against
        // a real PostgreSQL before release.
        app.databases.use(.sqlite(.memory), as: .sqlite)
    } else {
        app.databases.use(DatabaseConfigurationFactory.postgres(configuration: .init(
            hostname: config.databaseHost,
            port: config.databasePort,
            username: config.databaseUsername,
            password: config.databasePassword,
            database: config.databaseName,
            tls: .prefer(try .init(configuration: .clientDefault))
        ), maxConnectionsPerEventLoop: 2, connectionPoolTimeout: .seconds(60)), as: .psql)
    }
}

private func migrationsInit(_ app: Application) {
    // ⚠️ ORDER IS LOAD-BEARING. Fluent runs migrations in registration order; a schema
    // that references another table (foreign key) must be registered AFTER that table.
    // New feature → append its register() call here, positioned by its foreign keys,
    // and verify on a SCRATCH database (docs-architecture/GOTCHAS_LINUX_SWIFT.md).
    App.Item.Migrations.register(app: app)
}

private func middlewaresInit(_ app: Application, config: AppConfig) {
    // Rebuild the stack from scratch: drops Vapor's default RouteLoggingMiddleware,
    // replaced by HTTPLoggingMiddleware (duration + probe-path exclusion).
    app.middleware = .init()

    app.middleware.use(CORSMiddleware(configuration: .init(
        allowedOrigin: .custom(config.allowedOrigin),
        allowedMethods: [.GET, .POST, .PUT, .PATCH, .DELETE, .OPTIONS],
        allowedHeaders: [.authorization, .contentType, .accept, .origin, .xRequestedWith],
        allowCredentials: true,
        exposedHeaders: [.authorization, .contentType]
    )))

    app.middleware.use(HTTPLoggingMiddleware())

    // Outer catch-all (Abort + anything untyped)…
    app.middleware.use(ErrorMiddleware.default(environment: app.environment))
    // …then the typed-error contract closest to the routes:
    // CustomError → {code, name, description} JSON (see CONVENTIONS.md).
    App.Failed.Middlewares.register(app: app)
}
