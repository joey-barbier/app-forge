#!/usr/bin/env node
/**
 * app-forge — scaffold a Claude-Code-first project, any platform.
 *
 *   npx app-forge init MyApp [--platform swift-ios] [--id com.me.myapp] [--yes]
 *
 * Zero dependencies. Assembles the UNIVERSAL CORE (architecture principles, delivery
 * method, memory system, kickoff/product-owner skills, context7 MCP) + a PLATFORM PACK
 * (language conventions, platform gotchas, buildable skeleton, platform MCPs).
 * Unsupported platform → core only, after explicit confirmation.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const pkg = require("../package.json");

const TEMPLATES = path.join(__dirname, "..", "templates");
const CORE = path.join(TEMPLATES, "core");
const PACKS_DIR = path.join(TEMPLATES, "packs");
const MANIFEST = ".appforge.json";

// Entries renamed on copy (npm strips dotfiles from packages, so templates store them un-dotted).
const RENAMES = { claude: ".claude", "mcp.json": ".mcp.json", gitignore: ".gitignore", github: ".github" };
// Files merged (not overwritten) when both core and pack provide them.
const MERGED = new Set(["mcp.json", "gitignore"]);

function ask(question, fallback) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(`${question}${fallback ? ` (${fallback})` : ""}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback || "");
    })
  );
}

// The identifier is substituted RAW into JSON (package.json "name") and YAML
// (project.yml bundleIdPrefix). Without validation, `--id 'evil","x":"y'` injects
// JSON keys and `--id $'a\nKEY: v'` injects YAML keys. Allow only characters that
// cover both reverse-DNS (com.me.app) and npm scoped names (@org/pkg): letters,
// digits, dot, underscore, at, slash, hyphen. Everything else — quotes, braces,
// colons, whitespace, newlines, backslashes — is rejected.
function validateId(id) {
  if (typeof id !== "string" || id.length === 0 || id.length > 100 || !/^[A-Za-z0-9._@/-]+$/.test(id)) {
    console.error(`✗ "${id}" is not a valid identifier. Use only letters, digits and . _ @ / - (covers reverse-DNS like com.me.app and npm names like @org/pkg), max 100 chars. No quotes, braces, colons, spaces or newlines.`);
    process.exit(1);
  }
  return id;
}

function loadPacks() {
  if (!fs.existsSync(PACKS_DIR)) return [];
  return fs
    .readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PACKS_DIR, e.name, "pack.json")))
    .map((e) => ({ dir: path.join(PACKS_DIR, e.name), ...JSON.parse(fs.readFileSync(path.join(PACKS_DIR, e.name, "pack.json"), "utf8")) }));
}

function substitute(text, vars) {
  return text
    .replaceAll("{{PROJECT_NAME}}", vars.name)
    .replaceAll("{{BUNDLE_ID}}", vars.bundleId)
    .replaceAll("{{PACK_LABEL}}", vars.packLabel);
}

function copyTree(src, dest, vars) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "pack.json") continue; // manifest, not project content
    const renamed = RENAMES[entry.name] ?? entry.name;
    const target = path.join(dest, substitute(renamed, vars));
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTree(path.join(src, entry.name), target, vars);
    } else {
      const srcPath = path.join(src, entry.name);
      const content = substitute(fs.readFileSync(srcPath, "utf8"), vars);
      if (MERGED.has(entry.name) && fs.existsSync(target)) {
        if (entry.name === "mcp.json") {
          const base = JSON.parse(fs.readFileSync(target, "utf8"));
          const extra = JSON.parse(content);
          base.mcpServers = { ...base.mcpServers, ...extra.mcpServers };
          fs.writeFileSync(target, JSON.stringify(base, null, 2) + "\n");
        } else {
          fs.appendFileSync(target, content.endsWith("\n") ? content : content + "\n");
        }
      } else {
        // Preserve the source mode so executable templates (e.g. vapor-api
        // scripts/*.sh shipped 755) keep their exec bit instead of landing 644.
        const mode = fs.statSync(srcPath).mode;
        fs.writeFileSync(target, content, { mode });
        if (mode & 0o111) fs.chmodSync(target, mode); // re-assert exec bit (mode on write only applies on create / is umask-masked)
      }
    }
  }
}

async function init(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const assumeYes = args.includes("--yes") || args.includes("-y");
  const packs = loadPacks();

  // 1. Project name — first POSITIONAL token, by index (skip value-taking flags' values).
  // (Value-string exclusion would wrongly drop a name that equals the --platform/--id value,
  // e.g. `init swift-ios --platform swift-ios`, then hang at a non-TTY prompt.)
  const valueFlags = new Set(["--platform", "--id", "--bundle"]);
  let name;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("-")) { if (valueFlags.has(args[i])) i++; continue; }
    name = args[i];
    break;
  }
  if (!name) name = await ask("Project name (UpperCamelCase, e.g. MyApp)");
  if (!/^[A-Z][A-Za-z0-9]{0,63}$/.test(name)) {
    console.error(`✗ "${name}" must be UpperCamelCase, max 64 chars (it becomes module/type names).`);
    process.exit(1);
  }

  // 2. Platform
  let pack = null;
  const wanted = flag("--platform");
  if (wanted) {
    pack = packs.find((p) => p.id === wanted) ?? null;
    if (!pack && !assumeYes) {
      const go = await ask(`No best-practices pack for "${wanted}" yet. Continue with the universal core only? [y/N]`, "N");
      if (!/^y(es)?$/i.test(go)) process.exit(1);
    }
  } else {
    console.log("\nWhich platform?");
    packs.forEach((p, i) => console.log(`  ${i + 1}. ${p.label}`));
    console.log(`  ${packs.length + 1}. Other (universal core only — no platform best practices yet)`);
    const choice = parseInt(await ask("Choice", "1"), 10);
    if (choice >= 1 && choice <= packs.length) {
      pack = packs[choice - 1];
    } else {
      const stack = await ask("Which stack? (informational — written into the project memory)");
      const go = assumeYes ? "y" : await ask(`No best-practices pack for "${stack || "that stack"}" yet. Continue with the universal core only? [y/N]`, "N");
      if (!/^y(es)?$/i.test(go)) process.exit(1);
    }
  }

  // Collision guard — check BEFORE prompting for the identifier, so an existing
  // directory fails fast instead of after a needless prompt.
  const dest = path.resolve(process.cwd(), name);
  if (fs.existsSync(dest)) {
    console.error(`✗ ${dest} already exists.`);
    process.exit(1);
  }

  // 3. Identifier
  // Pack-appropriate default: a pack may carry an explicit `idDefault`; otherwise
  // packs whose prompt is about an npm/package name get an npm-style default, and
  // everything else gets the reverse-DNS default.
  const idPrompt = pack?.idPrompt ?? "App identifier (reverse-DNS)";
  const idDefault =
    pack?.idDefault ??
    (/npm|package/i.test(idPrompt) ? name.toLowerCase() : `com.example.${name.toLowerCase()}`);
  // --yes (or a non-TTY stdin, where ask() would hang at EOF and scaffold nothing)
  // makes init non-interactive: use the default identifier instead of prompting.
  let bundleId = flag("--id") ?? flag("--bundle");
  if (bundleId === undefined) {
    bundleId = (assumeYes || !process.stdin.isTTY) ? idDefault : await ask(idPrompt, idDefault);
  }
  validateId(bundleId);

  const vars = { name, bundleId, packLabel: pack ? pack.label : "none (universal core only)" };

  // Honest mcp.json summary: context7 always ships (core); a platform MCP only
  // appears when the chosen pack actually adds an mcp.json beyond core.
  const packHasMcp = !!(pack && fs.existsSync(path.join(pack.dir, "mcp.json")));

  console.log(`\n⚒️  Forging ${name}${pack ? ` [${pack.id}]` : " [core only]"}…`);
  // Wrap the whole scaffold: a partial directory from EACCES/ENOSPC would otherwise
  // be left behind and the collision guard would then block any retry. On failure,
  // remove the partial dir and exit with a clear message.
  try {
    fs.mkdirSync(dest, { recursive: true });
    copyTree(CORE, dest, vars); // universal bricks
    if (pack) copyTree(pack.dir, dest, vars); // platform bricks (override core, merge mcp/gitignore)
    fs.writeFileSync(
      path.join(dest, MANIFEST),
      JSON.stringify({ version: pkg.version, pack: pack ? pack.id : null, projectName: name, bundleId }, null, 2) + "\n"
    ); // update manifest — lets `app-forge update` re-render knowledge files later
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    console.error(`✗ Failed to scaffold ${name}: ${err.message}\n   Removed the partial directory — fix the cause (permissions / disk space) and retry.`);
    process.exit(1);
  }

  try {
    execSync("git init -q", { cwd: dest });
  } catch {
    console.log("   (git not found — skipped git init)");
  }

  console.log(`
✅ ${name} is ready.

  cd ${name}
  claude        # open Claude Code
  /kickoff      # describe your idea — Claude builds it

Installed bricks:
  CLAUDE.md + docs-architecture/   Operating manual + knowledge base${pack ? " (core + " + pack.id + ")" : " (universal core)"}
  .claude/skills/                  /kickoff, /product-owner, /restore-context, /save-context
  .claude/memory/                  Persistent project memory (anti-hallucination)
  .mcp.json                        MCP servers (context7 docs${packHasMcp ? " + platform tooling" : ""})
  .appforge.json                   Update manifest — \`npx app-forge update\` refreshes docs/skills later
${pack?.requirements?.length ? "\nRequirements: " + pack.requirements.join(" · ") : ""}${pack?.notes ? "\n" + pack.notes.replaceAll("{{PROJECT_NAME}}", name) : ""}
`);
}

// --- update -----------------------------------------------------------------
// Knowledge evolves (new gotchas, fixed docs, improved skills); `app-forge update`
// re-renders the boilerplate-OWNED files from the current templates without ever
// touching what the user owns after init (.claude/memory/**, source code, config).
const OWNED = (rel) => rel === "CLAUDE.md" || rel.startsWith("docs-architecture/") || rel.startsWith(".claude/skills/");

function collectOwned(src, rel, vars, out) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "pack.json") continue; // manifest, not project content
    const renamed = RENAMES[entry.name] ?? entry.name;
    const target = rel ? `${rel}/${substitute(renamed, vars)}` : substitute(renamed, vars);
    if (entry.isDirectory()) collectOwned(path.join(src, entry.name), target, vars, out);
    else if (OWNED(target)) out.set(target, substitute(fs.readFileSync(path.join(src, entry.name), "utf8"), vars));
  }
  return out;
}

function listFiles(dir, rel, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) listFiles(path.join(dir, entry.name), `${rel}/${entry.name}`, out);
    else out.push(`${rel}/${entry.name}`);
  }
  return out;
}

async function update(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const root = process.cwd();
  const manifestPath = path.join(root, MANIFEST);
  const packs = loadPacks();

  // 1. Manifest — written at init; rebuildable from flags for older projects.
  let manifest;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      console.error(`✗ ${MANIFEST} is not valid JSON — fix or delete it, then re-run with --pack.`);
      process.exit(1);
    }
  } else if (flag("--pack")) {
    const wanted = flag("--pack");
    if (wanted !== "none" && !packs.some((p) => p.id === wanted)) {
      console.error(`✗ Unknown pack "${wanted}". Available: ${packs.map((p) => p.id).join(", ")} (or "none" for core only).`);
      process.exit(1);
    }
    const name = flag("--name") ?? path.basename(root);
    const id = flag("--id") ?? `com.example.${name.toLowerCase()}`;
    validateId(id); // same raw-substitution sink as init — keep the identifier injection-safe here too
    manifest = { version: "pre-manifest", pack: wanted === "none" ? null : wanted, projectName: name, bundleId: id };
    console.log(`   (no ${MANIFEST} — rebuilt from flags as ${manifest.projectName} / ${manifest.bundleId}; written on apply)`);
  } else {
    console.error(`✗ No ${MANIFEST} here — this project predates update support (or wasn't made by app-forge).
  Re-run with --pack <id> ("none" for core only; see \`app-forge packs\`), plus optional
  --name <ProjectName> --id <bundle.id>, and the manifest will be created on apply.`);
    process.exit(1);
  }

  // 2. Pack — may have been renamed/removed since init; fall back to core only.
  let pack = null;
  if (manifest.pack) {
    pack = packs.find((p) => p.id === manifest.pack) ?? null;
    if (!pack) console.log(`⚠️  Pack "${manifest.pack}" no longer ships with app-forge ${pkg.version} — updating universal core files only; pack-owned docs stay as they are.`);
  }

  // 3. Re-render owned files from current templates (same substitutions as init).
  const vars = { name: manifest.projectName, bundleId: manifest.bundleId, packLabel: pack ? pack.label : "none (universal core only)" };
  const desired = collectOwned(CORE, "", vars, new Map());
  if (pack) collectOwned(pack.dir, "", vars, desired); // pack overrides core, like init

  // 4. Diff by content against the project.
  const added = [], changed = [], unchanged = [];
  for (const rel of [...desired.keys()].sort()) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) added.push(rel);
    else if (fs.readFileSync(file, "utf8") !== desired.get(rel)) changed.push(rel);
    else unchanged.push(rel);
  }
  const kept = [...listFiles(path.join(root, "docs-architecture"), "docs-architecture", []), ...listFiles(path.join(root, ".claude", "skills"), ".claude/skills", [])]
    .filter((rel) => !desired.has(rel))
    .sort();

  console.log(`\n🔄 ${manifest.projectName}${pack ? ` [${pack.id}]` : " [core only]"} — manifest ${manifest.version}, templates ${pkg.version}\n`);
  added.forEach((rel) => console.log(`  + added      ${rel}`));
  changed.forEach((rel) => console.log(`  ~ changed    ${rel}`));
  unchanged.forEach((rel) => console.log(`  = unchanged  ${rel}`));
  kept.forEach((rel) => console.log(`  · kept       ${rel} (not template-owned — left intact)`));

  const pending = [...added, ...changed];
  if (!pending.length) {
    console.log(`\n✅ Knowledge files already match templates ${pkg.version}. Nothing to do.`);
    return;
  }

  // 5. Dry run by default; --apply (or interactive y) writes.
  let apply = args.includes("--apply");
  if (!apply && process.stdin.isTTY) {
    apply = /^y(es)?$/i.test(await ask(`\nApply ${pending.length} file(s)? Memory, source code and config are never touched. [y/N]`, "N"));
  }
  if (!apply) {
    console.log(`\n   Dry run — nothing written. Re-run with --apply to update the ${pending.length} file(s) above.`);
    return;
  }
  const rootReal = fs.realpathSync(root);
  let written = 0;
  for (const rel of pending) {
    const file = path.join(root, rel);
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    // Never write through a symlink that escapes the project tree (a hostile clone could
    // plant one at an owned path). Guard BOTH the file itself and its (real) parent dir.
    try {
      if (fs.lstatSync(file).isSymbolicLink()) {
        console.log(`  ⚠ skipped     ${rel} (is a symlink — refusing to write through it)`);
        continue;
      }
    } catch { /* ENOENT: brand-new file, fine */ }
    const dirReal = fs.realpathSync(dir);
    if (dirReal !== rootReal && !dirReal.startsWith(rootReal + path.sep)) {
      console.log(`  ⚠ skipped     ${rel} (path escapes the project tree — refusing)`);
      continue;
    }
    fs.writeFileSync(file, desired.get(rel));
    written++;
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: pkg.version }, null, 2) + "\n");
  const skipped = pending.length - written;
  console.log(`\n✅ Updated ${written} file(s) to templates ${pkg.version} (${MANIFEST} bumped).${skipped ? ` ${skipped} skipped (symlink/escape guard).` : ""}`);
  console.log(`   Note: your own incidents/notes belong in .claude/memory/ (never touched); docs-architecture/ is curated and refreshed here.`);
}

const [, , command, ...rest] = process.argv;
if (command === "init") {
  init(rest);
} else if (command === "update") {
  update(rest);
} else if (command === "packs") {
  const packs = loadPacks();
  console.log("Available platform packs:");
  packs.forEach((p) => console.log(`  ${p.id.padEnd(14)} ${p.label}`));
} else {
  console.log(`app-forge — Claude-Code-first project factory (any platform)

Usage:
  npx app-forge init <ProjectName> [--platform swift-ios] [--id com.me.app] [--yes]
  npx app-forge update [--apply]      (inside a generated project — refresh docs/skills, never your code or memory)
  npx app-forge packs
`);
  if (command) process.exit(1);
}
