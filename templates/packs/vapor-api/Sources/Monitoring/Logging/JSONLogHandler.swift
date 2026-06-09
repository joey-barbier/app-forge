import Foundation
import Logging

/// A LogHandler that writes one JSON object per line to stdout — directly parseable by
/// Loki/Grafana/CloudWatch. Bootstrapped in `entrypoint.swift` for release builds only;
/// development keeps Vapor's human-readable text handler.
public struct JSONLogHandler: LogHandler {
    public var logLevel: Logger.Level
    public var metadata: Logger.Metadata = [:]

    private let label: String

    public subscript(metadataKey key: String) -> Logger.Metadata.Value? {
        get { metadata[key] }
        set { metadata[key] = newValue }
    }

    public init(label: String, level: Logger.Level = .info) {
        self.label = label
        self.logLevel = level
    }

    public func log(
        level: Logger.Level,
        message: Logger.Message,
        metadata: Logger.Metadata?,
        source: String,
        file: String,
        function: String,
        line: UInt
    ) {
        var merged = self.metadata
        if let extra = metadata {
            merged.merge(extra) { _, new in new }
        }

        let timestamp = Date().formatted(
            .iso8601.year().month().day().time(includingFractionalSeconds: true)
        )

        var dict: [String: String] = [
            "timestamp": timestamp,
            "level": level.rawValue,
            "message": "\(message)",
            "source": label,
        ]

        // Metadata becomes flat top-level keys — queryable without JSON-path gymnastics.
        for (key, value) in merged {
            dict[key] = "\(value)"
        }

        if let jsonData = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            // Single fputs call per line: lines never interleave across threads.
            fputs(jsonString + "\n", stdout)
        }
    }
}
