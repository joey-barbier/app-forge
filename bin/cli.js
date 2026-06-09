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

const TEMPLATES = path.join(__dirname, "..", "templates");
const CORE = path.join(TEMPLATES, "core");
const PACKS_DIR = path.join(TEMPLATES, "packs");

// Entries renamed on copy (npm strips dotfiles from packages, so templates store them un-dotted).
const RENAMES = { claude: ".claude", "mcp.json": ".mcp.json", gitignore: ".gitignore" };
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
      const content = substitute(fs.readFileSync(path.join(src, entry.name), "utf8"), vars);
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
        fs.writeFileSync(target, content);
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

  // 1. Project name
  let name = args.find((a) => !a.startsWith("-") && a !== flag("--platform") && a !== flag("--id"));
  if (!name) name = await ask("Project name (UpperCamelCase, e.g. MyApp)");
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    console.error(`✗ "${name}" must be UpperCamelCase (it becomes module/type names).`);
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

  // 3. Identifier
  const bundleId =
    flag("--id") ?? flag("--bundle") ??
    (await ask(pack?.idPrompt ?? "App identifier (reverse-DNS)", `com.example.${name.toLowerCase()}`));

  const dest = path.resolve(process.cwd(), name);
  if (fs.existsSync(dest)) {
    console.error(`✗ ${dest} already exists.`);
    process.exit(1);
  }

  const vars = { name, bundleId, packLabel: pack ? pack.label : "none (universal core only)" };

  console.log(`\n⚒️  Forging ${name}${pack ? ` [${pack.id}]` : " [core only]"}…`);
  fs.mkdirSync(dest, { recursive: true });
  copyTree(CORE, dest, vars); // universal bricks
  if (pack) copyTree(pack.dir, dest, vars); // platform bricks (override core, merge mcp/gitignore)

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
  .mcp.json                        MCP servers (context7 docs${pack ? " + platform tooling" : ""})
${pack?.requirements?.length ? "\nRequirements: " + pack.requirements.join(" · ") : ""}${pack?.notes ? "\n" + pack.notes.replaceAll("{{PROJECT_NAME}}", name) : ""}
`);
}

const [, , command, ...rest] = process.argv;
if (command === "init") {
  init(rest);
} else if (command === "packs") {
  const packs = loadPacks();
  console.log("Available platform packs:");
  packs.forEach((p) => console.log(`  ${p.id.padEnd(14)} ${p.label}`));
} else {
  console.log(`app-forge — Claude-Code-first project factory (any platform)

Usage:
  npx app-forge init <ProjectName> [--platform swift-ios] [--id com.me.app] [--yes]
  npx app-forge packs
`);
  if (command) process.exit(1);
}
