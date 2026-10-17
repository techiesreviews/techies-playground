#!/usr/bin/env node
// Project adapters: Node tests only; browser evidence remains a separate check.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { kitResult, kitRoot } from "./kit-lib.mjs";

const root = realpathSync(kitRoot());
const [command, ...args] = process.argv.slice(2);
const usage = {
  doctor: "Usage: kit doctor [--quiet]\nCheck project root, Node >=22.12, manifest/lock consistency, installed direct dependency versions, origin/main, tracked source conflict markers and command help.\n",
  specs: "Usage: kit specs [PATH.test.js | PATH.test.mjs ...] [--list]\nRun the project's Node tests (all by default); paths are relative to the project root.\nBrowser specs and --affected are not integrated. Obtain real Playground browser evidence separately.\nLogs: .scratch/kit-specs/run-<UTC>-<pid>/\n",
};

function git(...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout;
}

function json(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function testFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.isFile() && /\.test\.(?:js|mjs)$/.test(entry.name) ? [path] : [];
  }).sort();
}

function doctor() {
  if (args.some(arg => arg !== "--quiet") || args.length > 1) throw new Error("Usage: kit doctor [--quiet]");
  const quiet = args.includes("--quiet");
  let failures = 0;
  const check = (label, action) => {
    try {
      const detail = action();
      if (!quiet) console.log(`ok ${label}${detail ? `: ${detail}` : ""}`);
    } catch (error) {
      failures++;
      console.error(`fail ${label}: ${error.message}`);
    }
  };
  check("project root", () => {
    if (realpathSync(git("rev-parse", "--show-toplevel").trim()) !== root) throw new Error("run in the project worktree");
    if (json("package.json").name !== "techies-playground") throw new Error("expected techies-playground package.json");
    return root;
  });
  check("Node", () => {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 12)) throw new Error("use Node >=22.12 for this project");
    return process.version;
  });
  check("manifest and lock", () => {
    const manifest = json("package.json"), lock = json("package-lock.json"), lockedRoot = lock.packages?.[""];
    if (lock.lockfileVersion !== 3 || !lockedRoot) throw new Error("expected package-lock.json v3");
    if (manifest.name !== lock.name || manifest.version !== lock.version || manifest.version !== lockedRoot.version) throw new Error("align package.json and package-lock.json names/versions");
    for (const kind of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const actual = manifest[kind] ?? {}, expected = lockedRoot[kind] ?? {};
      if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(actual).some(([name, value]) => expected[name] !== value)) throw new Error(`align ${kind} in package.json and lockfile root`);
    }
    return `version ${manifest.version}; direct declarations agree`;
  });
  check("installed direct dependencies", () => {
    const manifest = json("package.json"), lock = json("package-lock.json");
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    for (const name of names) {
      const path = `node_modules/${name}`;
      const expected = lock.packages?.[path]?.version;
      if (!expected || json(`${path}/package.json`).version !== expected) throw new Error(`${name} missing or differs from package-lock.json; reconcile the installed dependencies`);
    }
    return `${names.length} match lockfile (not a transitive integrity audit)`;
  });
  check("origin/main", () => git("rev-parse", "--verify", "origin/main^{commit}").trim());
  check("tracked source conflict markers", () => {
    const paths = git("ls-files", "-z").split("\0").filter(path => /^(?:src\/|scripts\/|worker\.js$|vite\.config\.)/.test(path));
    const conflicts = paths.filter(path => existsSync(join(root, path)) && /^(?:<{7} |={7}$|>{7} )/m.test(readFileSync(join(root, path), "utf8")));
    if (conflicts.length) throw new Error(`resolve conflict markers: ${conflicts.join(", ")}`);
    return `${paths.length} files; documentation examples excluded`;
  });
  check("advertised command help", () => {
    const commands = readdirSync(join(root, "scripts/agents/kit.d")).filter(name => !name.startsWith("."));
    for (const name of commands) {
      const result = spawnSync(join(root, "scripts/agents/kit"), [name, "--help"], { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(`${name} --help failed: ${result.stderr.trim()}`);
    }
    return commands.join(", ");
  });
  kitResult(failures ? "fail" : "ok", `doctor ${failures} failed checks`);
  return failures ? 1 : 0;
}

function specs() {
  const list = args.includes("--list");
  const selected = args.filter(arg => arg !== "--list");
  if (selected.some(arg => arg.startsWith("-"))) throw new Error("unsupported specs option; browser specs and --affected are not integrated");
  const files = selected.length ? [...new Set(selected.map(path => {
    const absolute = realpathSync(resolve(root, path));
    const local = relative(root, absolute);
    if (local.startsWith(`..${sep}`) || local === ".." || !/\.test\.(?:js|mjs)$/.test(local) || !statSync(absolute).isFile()) throw new Error(`expected project-local Node test file: ${path}`);
    return local;
  }))] : [...testFiles("src"), ...testFiles("scripts")];
  if (!files.length) throw new Error("no Node tests selected");
  if (list) {
    console.log(files.join("\n"));
    kitResult("ok", `specs list ${files.length} Node test files; no tests run`);
    return 0;
  }
  const directory = join(root, ".scratch/kit-specs", `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`);
  mkdirSync(directory, { recursive: true });
  console.log(`Node tests only: ${files.length} files; log ${directory}/run.log`);
  const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `${result.error.message}\n` : ""}`;
  writeFileSync(join(directory, "run.log"), log);
  process.stdout.write(log);
  const passed = result.status === 0;
  kitResult(passed ? "ok" : "fail", `specs ${files.length} Node test files; browser behavior not tested; log ${directory}/run.log`);
  return passed ? 0 : 1;
}

try {
  if (!Object.hasOwn(usage, command)) throw new Error("expected doctor or specs");
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) process.stdout.write(usage[command]);
  else process.exitCode = command === "doctor" ? doctor() : specs();
} catch (error) {
  console.error(`problem: ${error.message}`);
  kitResult("fail", `${command}: ${error.message}`);
  process.exitCode = 2;
}
