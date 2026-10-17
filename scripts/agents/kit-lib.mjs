import { execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const nodeError = "kit: no Node >=24 found (system, npx cache or nvm)";
const oneLine = (text) => String(text).replace(/[\n\r]/g, " ");

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n+$/, ""); }
  catch { return ""; }
}

/** Return the current worktree root, with KIT_ROOT taking precedence. */
export function kitRoot() {
  return process.env.KIT_ROOT || (git(["rev-parse", "--show-toplevel"]) || resolve(import.meta.dirname, "../.."));
}

/** Return the persistent main checkout root. */
export function kitMainRoot() {
  return process.env.KIT_MAIN_ROOT || "/home/ubulex/Projects/techies-playground";
}

/** Return the explicit owner, worktree owner, branch, or unknown. */
export function kitOwner() {
  if (process.env.ASE_OWNER) return oneLine(process.env.ASE_OWNER);
  const root = kitRoot();
  let owner = "";
  try { owner = readFileSync(join(root, ".scratch/owner"), "utf8").split(/\r?\n/, 1)[0].trim().split(/\s+/)[1] ?? ""; }
  catch { /* No owner file: use the branch. */ }
  return oneLine((owner && owner !== "unknown" ? owner : git(["-C", root, "branch", "--show-current"])) || "unknown");
}

function version(candidate) {
  try {
    if (!statSync(candidate).isFile()) return null;
    accessSync(candidate, constants.X_OK);
    const output = execFileSync(candidate, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n+$/, "");
    return /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(output)?.slice(1).map(Number) ?? null;
  } catch { return null; }
}

function children(directory) {
  try { return readdirSync(directory).filter((name) => !name.startsWith(".")).sort(); }
  catch { return []; }
}

function absoluteNode(candidate) {
  return join(realpathSync(dirname(candidate)), "node");
}

/** Find system Node >=24 first, then the highest installed npx/nvm version. */
export function findNode({ path = process.env.PATH, searchRoot } = {}) {
  for (const directory of (path ?? "").split(":")) {
    const candidate = resolve(directory, "node");
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
    } catch { continue; }
    const found = version(candidate);
    if (found?.[0] >= 24) return absoluteNode(candidate);
    break; // Only the first executable node is the system node on PATH.
  }
  const root = searchRoot ?? (process.env.CLAUDE_NODE_SEARCH_ROOT || process.env.HOME);
  if (!root) return null;
  const npm = join(root, ".npm/_npx");
  const nvm = join(root, ".nvm/versions/node");
  const candidates = [
    ...children(npm).map((name) => join(npm, name, "node_modules/node/bin/node")),
    ...children(nvm).map((name) => join(nvm, name, "bin/node")),
  ];
  let best = null;
  let highest = [0, 0, 0];
  for (const candidate of candidates) {
    const found = version(candidate);
    if (!found || found[0] < 24) continue;
    const difference = found.map((part, index) => part - highest[index]).find((part) => part !== 0) ?? 0;
    if (difference > 0) { best = candidate; highest = found; }
  }
  return best ? absoluteNode(best) : null;
}

/** Copy env with a supported Node first on PATH, or throw when unavailable. */
export function nodeEnv(env = process.env) {
  const node = findNode({ path: env.PATH ?? "", searchRoot: env.CLAUDE_NODE_SEARCH_ROOT || env.HOME || "" });
  if (!node) throw new Error(nodeError);
  const directory = dirname(node);
  const path = env.PATH ?? "";
  return { ...env, PATH: path.split(":")[0] === directory ? path : `${directory}${path ? `:${path}` : ""}`, KIT_NODE: node };
}

/** Print a single RESULT line; invalid statuses set exitCode to 2. */
export function kitResult(status = "", text = "") {
  if (status !== "ok" && status !== "fail") {
    console.log(`RESULT: fail kit_result: bad status ${oneLine(status)}`);
    process.exitCode = 2;
    return;
  }
  console.log(`RESULT: ${status} ${oneLine(text)}`);
}
