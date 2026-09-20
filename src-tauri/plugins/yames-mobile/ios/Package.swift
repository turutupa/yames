// swift-tools-version:5.5
// 5.5 rather than the 5.3 Tauri's own plugins use: `.iOS(.v15)` — the floor
// the mobile plan sets for Yames — did not exist in PackageDescription until
// 5.5, and declaring it under 5.3 fails to compile the manifest at all.
// The iPhone half of the `yames-mobile` plugin.
//
// Built and linked by `swift_rs::SwiftLinker` from the crate's build script
// (`tauri_plugin::Builder::ios_path("ios")`), so the product name has to be
// the cargo package name exactly — `tauri-plugin-yames-mobile`. The `Tauri`
// dependency is copied into `../.tauri/tauri-api` by that same build script
// before the package is built; it is not in the repository.

import PackageDescription

let package = Package(
  name: "tauri-plugin-yames-mobile",
  platforms: [
    .iOS(.v15)
  ],
  products: [
    .library(
      name: "tauri-plugin-yames-mobile",
      type: .static,
      targets: ["tauri-plugin-yames-mobile"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-yames-mobile",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
