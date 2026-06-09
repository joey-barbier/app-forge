import {{PROJECT_NAME}}Core

/// PERMANENT file — do not delete (an SPM target with zero sources does not build).
/// DataLayer hosts the REAL repository implementations (CloudKit, URLSession, database…),
/// each conforming to a contract declared in {{PROJECT_NAME}}Core (ports & adapters).
/// Real implementations are added by slices that need them; until then this marker keeps
/// the target alive. See docs-architecture/CLOUDKIT_GUIDE.md before writing a CloudKit impl.
public enum DataLayer {
    /// Bump when a real implementation lands, so the placeholder's job is visible in reviews.
    public static let implementations: [String] = []
}
