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
        // Repository implementations (CloudKit, URLSession, …). Protocols may live in Core;
        // concrete impls + an InMemory variant (tests/previews) live here.
        .target(
            name: "DataLayer",
            dependencies: [.product(name: "{{PROJECT_NAME}}Core", package: "{{PROJECT_NAME}}Core")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
