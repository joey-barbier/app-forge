// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "{{PROJECT_NAME}}Core",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "{{PROJECT_NAME}}Core", targets: ["{{PROJECT_NAME}}Core"])],
    targets: [
        // Pure domain logic. NEVER imports SwiftUI/UIKit. Fully testable with `swift test`.
        .target(
            name: "{{PROJECT_NAME}}Core",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "{{PROJECT_NAME}}CoreTests",
            dependencies: ["{{PROJECT_NAME}}Core"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
