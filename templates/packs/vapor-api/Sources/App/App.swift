import Foundation

/// Root namespace. Every feature module extends it: `extension App { enum Item { … } }`.
/// Call sites read as domain language: `App.Item.Service`, `App.Failed.BadRequest`.
enum App {}
