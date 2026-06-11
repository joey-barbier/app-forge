// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "DataLayer",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "DataLayer", targets: ["DataLayer"])],
    dependencies: [
        .package(path: "../{{PROJECT_NAME}}Core"),
    ],
    targets: [
        // REAL repository implementations only (CloudKit, URLSession, …). Protocols AND their
        // InMemory variant (tests/previews/offline) live in Core — DataLayer ships IO-backed
        // impls of those contracts. See docs-architecture/ARCHITECTURE.md §2.
        .target(
            name: "DataLayer",
            dependencies: [.product(name: "{{PROJECT_NAME}}Core", package: "{{PROJECT_NAME}}Core")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
