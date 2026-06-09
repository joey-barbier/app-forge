// swift-tools-version:6.0
import PackageDescription

let swiftSettings: [SwiftSetting] = [
    .enableUpcomingFeature("ExistentialAny"),
]

let package = Package(
    name: "{{PROJECT_NAME}}",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        // 💧 Server-side Swift web framework.
        .package(url: "https://github.com/vapor/vapor.git", from: "4.115.0"),
        // 🗄 ORM.
        .package(url: "https://github.com/vapor/fluent.git", from: "4.12.0"),
        // 🐘 PostgreSQL driver (production database).
        .package(url: "https://github.com/vapor/fluent-postgres-driver.git", from: "2.10.0"),
        // 🧪 SQLite driver (in-memory database for the test environment ONLY).
        .package(url: "https://github.com/vapor/fluent-sqlite-driver.git", from: "4.8.0"),
        // 📈 Prometheus metrics backend for swift-metrics.
        .package(url: "https://github.com/swift-server/swift-prometheus.git", from: "2.0.0"),
    ],
    targets: [
        // L0 FOUNDATION — pure Swift primitives. Zero dependencies; builds & tests standalone.
        .target(
            name: "{{PROJECT_NAME}}Foundation",
            swiftSettings: swiftSettings
        ),

        // L1 OPS — operational plumbing: structured JSON logs, HTTP timing, metrics registry.
        // Imports the web framework as infrastructure, but NEVER any app code.
        .target(
            name: "Monitoring",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "Prometheus", package: "swift-prometheus"),
            ],
            swiftSettings: swiftSettings
        ),

        // L2–L5 — feature modules (Entities/Migrations/Repositories/Services/DTO/Controllers),
        // error contract, configuration and bootstrap. Layering inside this target is
        // folder-enforced — see docs-architecture/ARCHITECTURE.md.
        .executableTarget(
            name: "App",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "Fluent", package: "fluent"),
                .product(name: "FluentPostgresDriver", package: "fluent-postgres-driver"),
                .product(name: "FluentSQLiteDriver", package: "fluent-sqlite-driver"),
                .target(name: "{{PROJECT_NAME}}Foundation"),
                .target(name: "Monitoring"),
            ],
            swiftSettings: swiftSettings
        ),

        .testTarget(
            name: "AppTests",
            dependencies: [
                .target(name: "App"),
                .product(name: "VaporTesting", package: "vapor"),
            ],
            swiftSettings: swiftSettings
        ),
    ]
)
