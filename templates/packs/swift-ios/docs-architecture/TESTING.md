# TESTING — Strategy & Patterns

Swift Testing (`@Test` / `#expect`), not XCTest — the only exception is XCUITest UI automation, which the framework forces onto `XCTestCase`. All domain tests live in the Core package and run with plain `swift test` — no simulator, no Xcode project, < 10 s.

## 1. Test Pyramid

| Layer | Coverage | How |
|---|---|---|
| **Core package** (engines, services, models) | Exhaustive unit tests | `swift test --package-path Packages/{{PROJECT_NAME}}Core`. Pure logic, fast, deterministic. This is where ~95% of tests live. |
| **DataLayer** (CloudKit repositories) | Mapping & persistence-format tests, offline | Gate `swift build --package-path Packages/DataLayer` today (the skeleton ships no test target — `swift test` would exit 1, "no tests found"). Add a `DataLayerTests` target and switch to `swift test` once you have `CKRecord`↔domain round-trips, change-token store, merge policy — all in memory, no iCloud account. Real cloud IO (push, share accept) is validated manually on device. `InMemory*Repository` actors in Core keep every Store/Service testable without a database. |
| **UI** (SwiftUI views) | Thin XCUITest smoke/flow tests + simulator-MCP validation | XCUITests launch the app on the in-memory backend (`-uitest-mock` launch arg) so flows are deterministic and instant. Keep them few — views stay dumb; logic worth testing belongs in Core. |

What makes this work: engines are `public enum` with only `static` pure functions, `nonisolated` by nature, with `Calendar` (and `now: Date`) injected. No singletons, no system-clock reads, no I/O. Testable by construction.

```swift
public enum AchievementEngine {
    public static func satisfiedIDs(
        profile: Profile,
        items: [Item],
        calendar: Calendar = .current   // injected — tests pass a fixed UTC calendar
    ) -> Set<String> { ... }
}
```

## 2. Swift Testing Patterns

One `@Suite struct` per engine/service; `@Test` functions; `#expect` for assertions; `await #expect(throws: SomeError.x)` for async error paths.

### Fixture helpers (`TestSupport.swift`)

A single `Fixture` enum provides builder functions with defaults, so each test only spells out what matters:

```swift
extension Calendar {
    /// Deterministic calendar for tests (Gregorian, UTC) so day/hour boundaries are stable.
    static var utcTest: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }
}

enum Fixture {
    static let calendar = Calendar.utcTest

    static func date(_ year: Int, _ month: Int, _ day: Int,
                     _ hour: Int = 12, _ minute: Int = 0) -> Date {
        var c = DateComponents()
        (c.year, c.month, c.day, c.hour, c.minute) = (year, month, day, hour, minute)
        return calendar.date(from: c)!
    }

    static func item(lat: Double = 48.85, lon: Double = 2.35,
                     country: String? = "FR", rating: Int = 3,
                     at occurredAt: Date) -> Item {
        Item(coordinate: Coordinate(latitude: lat, longitude: lon),
             countryCode: country, rating: rating,
             occurredAt: occurredAt, createdAt: occurredAt)
    }
}
```

Rules:
- **Explicit dates always.** Every test passes `Fixture.date(2026, 6, 1)` — never `Date()`, never `.now`. Domain logic that reads the system clock is untestable; pass `now: Date` as a parameter instead.
- **Vary coordinates to isolate rules.** When a test needs N distinct places, use `lat: Double(index)` so place-dedup rules don't interfere with the rule under test.
- **Test both sides of every boundary.** A rule "hour in 5..<8" gets one test at 6 (unlocks) and one at 8 (must NOT unlock — exclusive bound).

## 3. Catalog-Consistency Tests

Whenever content lives in a catalog (achievements, ranks, themes) AND in engine rules, add one test that locks them together:

```swift
@Test func catalogIsConsistent() {
    let ids = AchievementCatalog.all.map(\.id)
    #expect(Set(ids).count == ids.count)                          // no duplicate ids
    #expect(ids.allSatisfy { AchievementID(rawValue: $0) != nil }) // no orphan slug / typo
    #expect(AchievementCatalog.all.count == AchievementID.allCases.count) // full coverage
}
```

Pair it with a typed-ID enum inside the engine: rules insert `AchievementID` cases (typo = compile error) and convert to `String` slugs only at the return boundary.

> ⚠️ **Gotcha:** A new catalog entry shipped with no engine rule — visible in the UI, permanently locked, zero test failures. Cause: catalog and engine were two unlinked lists. Fix: the consistency test above. **Never hardcode counts** (`#expect(ids.count == 37)`); derive from `CaseIterable.allCases.count` so adding content can't silently desync, and the test never needs editing.

## 4. Service Tests via InMemory Repositories

Every repository protocol gets a thread-safe `actor InMemory*Repository` in the Core package itself (also reused by SwiftUI previews). Services are then tested end-to-end without persistence:

```swift
@Suite struct ItemServiceTests {
    let calendar = Fixture.calendar

    private func makeService(profile: Profile = Profile(id: "u"), items: [Item] = []) -> ItemService {
        ItemService(repository: InMemoryItemRepository(profile: profile, items: items),
                    calendar: calendar)
    }

    @Test func addFirstItemAwardsXPAndFirstBadge() async throws {
        let service = makeService()
        let result = try await service.addItem(
            ItemDraft(coordinate: .init(latitude: 48, longitude: 2),
                      occurredAt: Fixture.date(2026, 6, 1)),
            now: Fixture.date(2026, 6, 1))   // `now` injected, never read inside
        #expect(result.xpGained == 25)
        #expect(result.newAchievements.contains { $0.id == "first_item" })
    }
}
```

Test the *invariants*, not just happy paths: delete reverses item XP but keeps earned achievements; recompute is idempotent (`second.newAchievements.isEmpty`); best-streak is monotonic across deletions; validation errors throw (`await #expect(throws: GroupValidationError.emptyName) { ... }`).

## 5. Concurrency Tests (actor reentrancy)

> ⚠️ **Gotcha:** Concurrent `addItem` calls lost writes despite the service being an `actor`. Cause: actors are **reentrant across `await`** — two read-modify-write sequences interleaved at the repository `await` and the second save clobbered the first. Fix: a `serialized()` operation queue inside the service; proven by tests, not by reading the code:

```swift
@Test func concurrentAddsLoseNoWrites() async throws {
    let service = makeService()
    await withTaskGroup(of: Void.self) { group in
        for i in 0..<25 {
            group.addTask { _ = try? await service.addItem(draft(index: i), now: day) }
        }
    }
    let snapshot = try await service.snapshot()
    #expect(snapshot.items.count == 25)   // no lost updates
    // persisted XP == one deterministic from-scratch recompute over the final item set
    #expect(snapshot.profile.xp == ProgressEngine.recompute(
        identity: Profile(id: "u"), items: snapshot.items, calendar: calendar).profile.xp)
}
```

The "converges to a deterministic recompute" assertion catches both double-counting and lost increments — stronger than counting alone.

## 6. Merge / Sync Logic Tests

For local↔server merge (`Profile.merged(with:)`), test the field-by-field policy explicitly:
- Monotonic fields (`xp`, `streakBest`, unlocked-achievement set): max / union — **never regress**, and merge must be **symmetric** (`a.merged(b) == b.merged(a)` on those fields — test it).
- Non-monotonic fields (`streakCurrent`, `lastActiveDay`): follow the more recent day, **even if the value shrinks** — write a test documenting that shrinking is intentional, or someone will "fix" it.

## 7. Determinism Gotchas

> ⚠️ **Gotcha:** Time-window rules (e.g. "22:00–05:00") passed locally, failed on CI. Cause: `Calendar.current` uses the machine's timezone; an hour-boundary test is a different wall-clock hour elsewhere. Fix: inject `Calendar` into every engine function; tests always pass `Calendar.utcTest` (Gregorian + UTC).

> ⚠️ **Gotcha:** "Most visited place" flickered between app launches. Cause: tie between two equally-visited places resolved by `Dictionary` iteration order, which is nondeterministic. Fix: stable tie-break (smaller key wins) + a test computing stats on `items` and `items.reversed()` and asserting equal output.

> ⚠️ **Gotcha:** Two coordinates centimeters apart counted as two distinct places. Cause: place keys built by stringifying rounded doubles — `-0.0` and `0.0` stringify differently around the equator/meridian. Fix: integer quantization before keying; regression test asserts `placeKey` of `+0.00001` and `-0.00001` are both `"0,0"` and contain no `"-0"`.

> ⚠️ **Gotcha:** UI showed a "7-day streak" days after it died. Cause: `currentStreak` is frozen at the last activity day; nothing recomputes it until the next write. Fix: a separate `liveStreak` derived with an explicit `now:` parameter (0 if last activity > 1 day ago); tested at now = same day, next day (still alive — user can still extend), and +2 days (dead).

General rules:
- `sorted()` before comparing collections or picking "first" from grouped data — `Set`/`Dictionary` order is never stable.
- Engines never call `Date()`, `Calendar.current`, `TimeZone.current`, or `Locale.current` internally. All injected.
- Weekday/weekend logic must be locale-independent: match `calendar.component(.weekday, ...)` values (1 = Sunday, 7 = Saturday), never rely on `firstWeekday`.

## 8. How AI Agents Must Use Tests

1. **Run `swift test --package-path Packages/{{PROJECT_NAME}}Core` after EVERY engine/domain change.** It's seconds. No "I'll run it at the end".
2. **Every new rule ships with its tests** in the same change: the unlock case, the just-below-threshold case, and the boundary case. A rule without a test does not exist.
3. **New catalog entry?** The consistency test fails until you add the matching enum case + engine rule. That failure is the workflow — don't weaken the test.
4. **Tests are the spec.** When behavior is ambiguous, the test file is the authority (e.g. "merge can shrink current streak" is documented intent, not a bug). Read the relevant suite before changing an engine.
5. **Never edit an existing assertion to make your change pass** without understanding why it was written — most encode a fixed production bug. If a behavior change is intentional, update the test *and* its doc comment.

## UI / snapshot tests — when to add them (V2, deliberately not V1)
MVP skips UI tests on purpose: layouts churn too fast and brittle tests slow every slice. Add them
when (a) a screen has survived 3+ slices unchanged, or (b) a visual regression actually bit you.
Then prefer snapshot tests of MODULE bricks (L4 — stable contracts, no navigation) over full-screen
flows, and keep them in the app target, not the packages. Until then: the simulator screenshot at
every slice gate IS the UI regression net — actually look at it.

## Concurrency testing (Swift)
- The Thread Sanitizer is the truth serum: `swift test --sanitize=thread` on packages periodically
  (it's slow — not every run; before each release at minimum).
- A concurrency bug fixed = a regression test that reproduces the race (e.g. N concurrent calls via
  `TaskGroup` asserting a single side effect) — same discipline as any other gotcha.
- Swift 6 strict concurrency catches data races at compile time; never silence it with
  `@unchecked Sendable` to make a test pass — fix the isolation instead.
