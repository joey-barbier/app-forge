# CloudKit Guide — Private Sync + CKShare Groups (no server)

Battle-tested patterns from two production apps. CloudKit IS the backend: private DB for the user's
own data, shared DB for groups via `CKShare`. Read the Gotchas section before touching any of this.

## 1. Architecture

```
Private DB (per user)                 Shared DB (per user)
├── ItemsZone (custom zone)           └── GroupZone-<UUID>  ← zones OTHER owners shared with me
│     ├── Item records                      (zoneID.ownerName = the REAL owner id)
│     └── Profile record (singleton)
└── GroupZone-<UUID> (one per group I own)
      ├── Group root record ──── CKShare
      └── SharedItem records (parent → Group root)
```

- **Repository protocol lives in the pure Core package** (no CloudKit import) → services/ViewModels
  testable with `swift test`. `CloudKitRepository` / `CloudKitGroupRepository` (actors) live in
  DataLayer. An `InMemory*Repository` backs tests, previews, and the simulator.
- **Custom zones are mandatory** — change tokens (`recordZoneChanges`) and `CKShare` don't work in
  the default zone. One zone per shared group (`GroupZone-<UUID>`), found later by name prefix.
- **One container constant, used everywhere** (both repositories AND share acceptance), identical to
  the entitlement: `iCloud.com.example.{{PROJECT_NAME}}`. A second hardcoded id = silent data split.
- Centralize every record type / field / subscription id in one `CloudKitConfig` enum. No string
  literals at call sites.

## 2. Record Mapping

Two-way mapping as extensions on the domain model. `init?(record:)` validates required fields
(guard-let, return nil on malformed); optional fields get defaults on read.

```swift
extension Item {
    init?(record: CKRecord) {
        guard record.recordType == CloudKitConfig.RecordType.item,
              let id = UUID(uuidString: record.recordID.recordName),
              let createdAt = record[Field.createdAt] as? Date else { return nil }
        self.init(id: id, title: (record[Field.title] as? String) ?? "", createdAt: createdAt)
    }
    /// New records only — recordName IS the model's UUID (deterministic IDs, no lookup table).
    func makeRecord(in zoneID: CKRecordZone.ID) -> CKRecord { ... }
    /// Updates — write fields into the FETCHED record to preserve its server change tag.
    func apply(to record: CKRecord) { ... }
}
```

Rules:
- **Never build a fresh `CKRecord` to update an existing one** — you lose the change tag and get
  `serverRecordChanged`. Fetch, `apply(to:)`, save.
- Loading: prefer `database.recordZoneChanges(inZoneWith:since:)` loops (handles `moreComing`,
  surfaces deletions) over `CKQuery`. Persist tokens per (scope, zoneID) via a small
  `ChangeTokenStore` actor (NSKeyedArchiver → UserDefaults). On a cold launch with an empty
  in-memory cache, ignore the persisted token once and do a full scan — a stale token + empty cache
  returns an incomplete list.
- Conflict handling (`serverRecordChanged`, also nested inside `partialFailure`): take
  `error.serverRecord`, merge local state into it, re-save **once**. Never retry in a loop.

## 3. CKShare Lifecycle

**Create** — zone first, then root record + share **in the same atomic write**:

```swift
let zone = CKRecordZone(zoneName: "GroupZone-\(group.id.uuidString)")
_ = try await privateDB.modifyRecordZones(saving: [zone], deleting: [])

let rootRecord = group.makeRecord(in: zone.zoneID)
let share = CKShare(rootRecord: rootRecord)
share[CKShare.SystemFieldKey.title] = group.name as CKRecordValue
share.publicPermission = .readWrite   // link sharing: anyone with the URL joins & can write
_ = try await privateDB.modifyRecords(saving: [rootRecord, share], deleting: [],
                                      savePolicy: .ifServerRecordUnchanged, atomically: true)
return share.url   // hand to ShareLink / UIActivityViewController
```

Permission matrix: `.readOnly` participants can read but **cannot create even with a correct
parent**; creating requires `.readWrite`. For invite-only apps use `publicPermission = .none` +
explicit participants at `.readWrite` (via `UICloudSharingController`, or
`CKFetchShareParticipantsOperation` + `CKShare.addParticipant(_:)`) — a leaked link then grants nothing.

**Child records** — every record a participant must be able to create needs the hierarchy parent:

```swift
record.parent = CKRecord.Reference(recordID: rootRecordID, action: .none)  // system sharing prop
```

**Accept** — fires in the app/scene delegate (see Gotcha 2). `CKShare.Metadata` is NOT `Sendable`:
consume it synchronously on `@MainActor`, extract the Sendable group UUID from
`metadata.hierarchicalRootRecordID.recordName` *before* any `await`, then run
`CKAcceptSharesOperation`. Only the UUID escapes. After accept, the zone appears in the
participant's `sharedCloudDatabase` (with delay — Gotcha 4).

**Locate** — load groups from BOTH databases by listing `allRecordZones()` and filtering by zone
name prefix; cache the **exact** `(scope, zoneID)` per group. All later operations route through
that cache (owner → private DB, participant → shared DB).

**Members** — do NOT persist a member-list field; it drifts. The authoritative list is
`share.participants` (fetch root record → `record.share` reference → fetch the `CKShare`). Map to a
Sendable struct inside the actor; never let `CKShare` escape it.

**Remove a participant** (owner): find the non-owner participant by
`userIdentity.userRecordID?.recordName`, `share.removeParticipant(...)`, save the share with
`savePolicy: .changedKeys`. With a public link this is best-effort — they can re-accept the
still-valid URL until you rotate it.

**Rotate the invite link**: delete the old `CKShare` record, re-fetch the root record (its `share`
reference is now cleared), create a new `CKShare(rootRecord:)`, save root + share atomically →
brand-new URL, old one dead.

**Delete / leave**: owner deletes the zone in the private DB (removes the group for everyone);
participant deletes the zone from their shared DB (= leave). Clear cached change tokens.

## 4. Push, Refresh, Notifications

- Register `CKDatabaseSubscription` with `notificationInfo.shouldSendContentAvailable = true`
  (silent push) on **both** the private DB (owner sees participants' writes) and the shared DB
  (participants see everyone else's writes). Idempotent, best-effort (`try?`). A
  `CKRecordZoneSubscription` on the private items zone keeps the user's own devices in sync.
- AppDelegate: `application.registerForRemoteNotifications()` at launch (no user permission needed
  for silent push), Info.plist `UIBackgroundModes: [remote-notification]`.
- `didReceiveRemoteNotification` → `CKNotification(fromRemoteNotificationDictionary:)` → route:
  `.database` → refresh groups; `.recordZone` → refresh items; unknown → refresh both. Return
  `.newData`. CloudKit pushes carry no payload beyond "something changed" — always re-fetch.
- Visible alerts: silent push + local notification on diff (you computed what changed during the
  refresh), or implement `userNotificationCenter(_:willPresent:) async -> [.banner, .sound]` to show
  banners in the foreground.
- Cold-launch race: a push/share-accept can arrive before SwiftUI wires your store. Use a small
  `@MainActor PushRouter` holding `weak var store`; if nil, set a `pending` flag and flush it in
  `store`'s `didSet`.

## 5. Gotchas (production bugs — each cost hours/days)

> ⚠️ **Gotcha 1 — Empty array on a List field.** Symptom: first save fails with
> `cannot use an empty list to initialize a new field`. Cause: CloudKit infers a List field's
> element type from the first non-empty save and rejects `[]` on a not-yet-existing field. Fix:
> when the collection is empty, set the field to `nil` (omit it); read side defaults to `[]`. The
> schema field is created the first time a non-empty value is saved.

> ⚠️ **Gotcha 2 — Share acceptance never fires.** Symptom: tapping an invite link opens the app,
> nothing happens; `userDidAcceptCloudKitShareWith` on the AppDelegate is never called. Cause: in a
> SwiftUI-lifecycle app the callback is delivered to the **scene** delegate. Fix: implement
> `application(_:configurationForConnecting:options:)` returning a config with
> `delegateClass = SceneDelegate.self`, and implement
> `windowScene(_:userDidAcceptCloudKitShareWith:)` there. Keep the AppDelegate variant too as
> belt-and-braces. Don't implement `scene(_:willConnectTo:)` — SwiftUI still owns the window.

> ⚠️ **Gotcha 3 — Invite link says "you need a newer version of the app".** Cause: missing
> `CKSharingSupported = true` (Boolean) in Info.plist. Fix: add it. No code change.

> ⚠️ **Gotcha 4 — "Record not found" right after accepting a share.** Cause: server-side
> propagation delay — the shared zone isn't visible in the participant's shared DB immediately
> after `CKAcceptSharesOperation` succeeds. Fix: refresh immediately, then refresh again after
> ~2 s (`try? await Task.sleep(for: .seconds(2))`). Never treat the first miss as an error.

> ⚠️ **Gotcha 5 — Works in Debug/Dev, broken on TestFlight.** Symptom: TestFlight build sees zero
> data or errors on every record type. Cause: the schema only exists in the **Development**
> environment; TestFlight/App Store use **Production**. Fix: exercise every record type AND field
> in code against Dev (fields are created lazily on first save — including `parent`! see Gotcha 1),
> then CloudKit Dashboard → "Deploy Schema Changes" to Production **before** the TestFlight build.

> ⚠️ **Gotcha 6 — Silent pushes never arrive in production.** Cause: `aps-environment` entitlement
> is `development` for Xcode builds; TestFlight/App Store need `production`. Xcode rewrites it at
> archive time for App Store distribution — but verify in the built `.ipa` if pushes are dead, and
> never test push on a device while the entitlement/profile mismatch.

> ⚠️ **Gotcha 7 — Participant gets "CREATE operation not permitted".** Cause: hierarchical sharing
> only lets participants create records whose `record.parent` chain reaches the shared root.
> Orphan records save fine for the owner and fail for everyone else. Fix: always set
> `record.parent` → root record on shared child records (keep a separate custom Reference field if
> you also need queries — `parent` is invisible in the Dashboard).

> ⚠️ **Gotcha 8 — Wrong zone owner (`__defaultOwner__`).** Symptom: participant operations hit
> `zoneNotFound` though the zone exists. Cause: `CKCurrentUserDefaultName` resolves to the current
> user — reconstructing a shared zoneID with it points at the participant's own (nonexistent) zone.
> Fix: never reconstruct zone IDs. Keep the exact `CKRecordZone.ID` from `allRecordZones()` /
> `record.recordID.zoneID`; resolve the real owner via `metadata.ownerIdentity.userRecordID`.

> ⚠️ **Gotcha 9 — Share created but URL is nil / root not shared.** Cause: root record and its
> `CKShare` were saved in separate operations. Fix: first save must include **both** in one
> `modifyRecords(atomically: true)`.

> ⚠️ **Gotcha 10 — `CKShare.Metadata` across actors.** Symptom: Swift 6 sendability errors, or
> crashes when stashing metadata for later. Fix: consume it synchronously on `@MainActor`, extract
> Sendable values (root record UUID) before the first `await`, never store it.

> ⚠️ **Gotcha 11 — `CKQuery` fails in custom zones.** Symptom: "recordName is not marked
> queryable". Fix: don't query; iterate `recordZoneChanges(inZoneWith:since:)` until
> `!moreComing` — it's also the only way to observe deletions.

> ⚠️ **Gotcha 12 — Participants show as "Anonymous"/stale members.** Cause: member list persisted
> as a record field drifts from reality. Fix: derive members exclusively from
> `share.participants` (name via `PersonNameComponentsFormatter` on `userIdentity.nameComponents`,
> fallback `lookupInfo?.emailAddress`).

Minor but real: treat `CKError.unknownItem` on delete as success (idempotent); coalesce concurrent
bootstrap (zone + subscription creation) onto a single in-flight `Task` inside the actor.

## 6. Dev / Test Workflow

- **Simulator**: CRUD against the private DB works (signed-in iCloud account required). Share
  acceptance and push do NOT work → fall back to `InMemoryGroupRepository` on simulator.
- **Device required** for: silent push, share accept, multi-account flows. Full validation needs
  **two real iCloud accounts**: A creates + invites → B accepts → B writes → A receives push.
- Debugging on device: `os.Logger(subsystem:category:)` with `privacy: .public` on interpolations
  (otherwise values show as `<private>` in Console.app). Log every share-accept and push entry
  point — these paths are unreproducible in a debugger session that started after the tap.
- CloudKit Dashboard: inspect records per zone (Dev env), check "Deploy Schema Changes" diff, and
  use Logs to confirm pushes were emitted.

## 7. Checklist — adding a shared record type

1. Add type + fields to `CloudKitConfig`. 2. Mapping extension (`init?(record:)` /
`makeRecord(in:parent:)` with `record.parent` → root). 3. Route through the `(scope, zoneID)` cache
— never hardcode a DB. 4. Exercise every field in Dev (non-empty lists!), then deploy schema to
Production. 5. Two-account device test before shipping.


## Atomic multi-record persistence — encode it in the CONTRACT
> ⚠️ **Gotcha:** Symptom — a pin saves but the player profile write fails (or vice-versa):
> XP/achievements drift from the pin set forever. Cause — two separate `save` calls where the
> domain requires all-or-nothing. Fix — the repository CONTRACT exposes the atomic operation
> (`savePinAndPlayer(_:_:)` — one method, one `modifyRecords(atomically: true)` underneath),
> so no caller CAN write them separately. If two records must stay consistent, their atomicity
> belongs in the protocol, not in caller discipline.
