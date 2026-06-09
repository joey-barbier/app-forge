# {{PROJECT_NAME}} — Commands

> Only commands proven to work in THIS project, with exact flags.

## Packages (fast loop — always first)
swift build --package-path Packages/{{PROJECT_NAME}}Core
swift test  --package-path Packages/{{PROJECT_NAME}}Core
swift build --package-path Packages/DataLayer
swift build --package-path Packages/{{PROJECT_NAME}}DS

## App target
xcodegen generate   # regenerate .xcodeproj after adding files (run at project root)
xcodebuild -project {{PROJECT_NAME}}.xcodeproj -scheme {{PROJECT_NAME}} \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/{{PROJECT_NAME}}_dd build 2>&1 | grep -E "error:|BUILD"

## Simulator (via ios-simulator MCP)
# install_app → launch_app({{BUNDLE_ID}}) → screenshot → inspect
