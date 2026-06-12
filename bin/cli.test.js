// Regression tests for the security-sensitive CLI surface. Zero deps — node:test (Node 18+).
//   node --test
const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.join(__dirname, "cli.js");

function run(args, cwd) {
  try {
    const out = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: "" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "appforge-test-"));
}

// --- Injection guard: identifiers that break out of JSON/YAML must be rejected, no dir left ---
for (const bad of ['evil","x":"y', "a\nKEY: v", "has space", "{brace}", "col:on", "back\\slash"]) {
  test(`rejects injection id: ${JSON.stringify(bad)}`, () => {
    const dir = tmp();
    const r = run(["init", "Inj", "--platform", "swift-ios", "--id", bad, "--yes"], dir);
    assert.strictEqual(r.code, 1, "must exit 1");
    assert.ok(!fs.existsSync(path.join(dir, "Inj")), "no partial project dir");
  });
}

// --- Valid identifiers (reverse-DNS + npm scoped) are accepted ---
for (const good of ["com.me.app", "@org/my-sdk", "io.example.thing_2"]) {
  test(`accepts valid id: ${good}`, () => {
    const dir = tmp();
    const r = run(["init", "Ok", "--platform", "ts-sdk", "--id", good, "--yes"], dir);
    assert.strictEqual(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(dir, "Ok", ".appforge.json")));
  });
}

// --- Non-interactive: --yes with no --id must scaffold, not hang ---
test("--yes scaffolds without --id (non-interactive)", () => {
  const dir = tmp();
  const r = run(["init", "Auto", "--platform", "swift-ios", "--yes"], dir);
  assert.strictEqual(r.code, 0, r.out);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "Auto", ".appforge.json"), "utf8"));
  assert.strictEqual(manifest.bundleId, "com.example.auto");
});

// --- Positional name by index: a name equal to a flag value is NOT dropped ---
test("name equal to platform value is kept", () => {
  const dir = tmp();
  // 'Swiftios' is a valid UpperCamelCase name; ensure index-based parse keeps it
  const r = run(["init", "Swiftios", "--platform", "swift-ios", "--yes"], dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(dir, "Swiftios")));
});

// --- update: memory is never touched, and a symlink at an owned path is refused ---
test("update --apply never writes through a symlink / outside the tree", () => {
  const dir = tmp();
  assert.strictEqual(run(["init", "Proj", "--platform", "swift-ios", "--yes"], dir).code, 0);
  const proj = path.join(dir, "Proj");

  // memory sentinel
  const mem = path.join(proj, ".claude/memory/PROJECT_STATE.md");
  fs.appendFileSync(mem, "\nSENTINEL_DO_NOT_LOSE\n");
  const memBefore = fs.readFileSync(mem, "utf8");

  // plant a symlink at an OWNED path pointing OUTSIDE the project
  const outside = path.join(dir, "OUTSIDE.txt");
  fs.writeFileSync(outside, "PRECIOUS");
  const owned = path.join(proj, "CLAUDE.md");
  fs.rmSync(owned);
  fs.symlinkSync(outside, owned);

  // tamper an owned regular file so update has something to restore
  const doc = path.join(proj, "docs-architecture/DELIVERY.md");
  fs.appendFileSync(doc, "\n<!-- local tamper -->\n");

  const r = run(["update", "--apply"], proj);
  assert.strictEqual(r.code, 0, r.out);

  assert.strictEqual(fs.readFileSync(outside, "utf8"), "PRECIOUS", "out-of-tree file must be untouched");
  assert.strictEqual(fs.readFileSync(mem, "utf8"), memBefore, "memory must be byte-identical");
  assert.ok(!fs.readFileSync(doc, "utf8").includes("local tamper"), "owned doc restored");
});
