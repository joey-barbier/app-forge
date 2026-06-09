// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "{{PROJECT_NAME}}DS",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "{{PROJECT_NAME}}DS", targets: ["{{PROJECT_NAME}}DS"])],
    targets: [
        .target(
            name: "{{PROJECT_NAME}}DS",
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .defaultIsolation(MainActor.self),
            ]
        ),
    ]
)
