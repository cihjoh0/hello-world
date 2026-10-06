// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "F1Core",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "F1Core", targets: ["F1Core"]),
    ],
    targets: [
        .target(name: "F1Core"),
        .testTarget(name: "F1CoreTests", dependencies: ["F1Core"]),
    ]
)
