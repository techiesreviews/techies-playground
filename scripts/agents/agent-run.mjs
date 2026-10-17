#!/usr/bin/env node
// Adapters accept {kind, worktree, model, effort}, git common dir and output path.
// Return {command, args, env, capture, finish(stdout, runLog)}. Commands read the brief
// on stdin with cwd=worktree; finish verifies the actual model and returns final
// text (Claude), or null when the CLI already wrote out.md (Codex). The shared
// runner owns logs, the build contract, deadlines, process groups and Git status.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { durationMilliseconds, supervise } from "./sol-run.mjs";
import { reviewComplete, reviewFormat, reviewScope } from "./review-brief.mjs";

const adapters = { codex: codexAdapter, claude: claudeAdapter };

export function inferCli(model) {
  return /^(claude-|(?:opus|sonnet|haiku|fable)$)/i.test(claudeModelName(model)) ? "claude" : "codex";
}

function claudeModelName(model) {
  return model.replace(/\[1m\]$/i, "");
}

export function reviewBase(brief, explicit, worktree = process.cwd()) {
  return reviewScope(brief, { base: explicit }, worktree).base;
}

export function parseAgentArgs(args, env = {}) {
  if (args[0] === "--resume" && args.length === 2 && args[1] && !args[1].startsWith("--")) return { resume: resolve(args[1]) };
  const [kind, worktree, brief, ...flags] = args;
  if (!["build", "review"].includes(kind) || !worktree || !brief) {
    throw new Error("Usage: agent.sh build|review <worktree> <brief> [--model M] [--cli codex|claude] [--effort E] [--base REF | --commit SHA] [--out DIR]; agent.sh --resume <out-dir>");
  }
  const options = { kind, worktree, brief, model: env[kind === "build" ? "ASE_BUILD_MODEL" : "ASE_REVIEW_MODEL"] || "gpt-6.1-sol", effort: "medium" };
  let cli = env.ASE_AGENT_CLI || "";
  const seen = new Set();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i], value = flags[i + 1];
    if (!["--model", "--cli", "--effort", "--base", "--commit", "--out"].includes(flag) || !value || (value.startsWith("--") && !["--base", "--commit"].includes(flag)) || seen.has(flag)) {
      throw new Error(`Invalid option: ${flag}`);
    }
    seen.add(flag);
    if (flag === "--cli") cli = value;
    else options[flag.slice(2)] = value;
  }
  options.cli = cli || inferCli(options.model);
  if (!Object.hasOwn(adapters, options.cli)) throw new Error(`Unknown CLI: ${options.cli}; add an adapter first`);
  if (!options.model.trim() || options.model.startsWith("-") || /[\r\n]/.test(options.model)) throw new Error("Invalid model");
  // Effort levels belong to each CLI/model; pass new levels through unchanged.
  if (!/^[a-z][a-z0-9_-]*$/.test(options.effort)) throw new Error(`Invalid effort: ${options.effort}`);
  if (options.base !== undefined && options.commit !== undefined) throw new Error("--base and --commit are mutually exclusive");
  return options;
}

// Review sessions disable personal skills, plugins, apps, memories and MCP
// configuration. Builds retain the user's usual Codex home and permissions.
export const codexReviewConfig = `[skills]
include_instructions = false

[skills.bundled]
enabled = false

[features]
plugins = false
apps = false
memories = false
`;

export function makeCodexReviewHome(sourceHome = process.env.CODEX_HOME || join(homedir(), ".codex")) {
  const sourceAuth = resolve(sourceHome, "auth.json");
  if (!existsSync(sourceAuth)) throw new Error(`no Codex auth at ${sourceAuth}`);
  const home = mkdtempSync(join(tmpdir(), "ase-codex-home-"));
  try {
    symlinkSync(sourceAuth, join(home, "auth.json"));
    writeFileSync(join(home, "config.toml"), codexReviewConfig);
    return { home, sourceAuth };
  } catch (error) {
    rmSync(home, { recursive: true, force: true });
    throw error;
  }
}

function closeCodexReviewHome({ home, sourceAuth }) {
  try {
    const auth = join(home, "auth.json");
    if (existsSync(auth) && !lstatSync(auth).isSymbolicLink()) {
      // Codex may replace the symlink when rotating a refresh token. Preserve
      // that token atomically before deleting the isolated session directory.
      const temporary = `${sourceAuth}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, readFileSync(auth), { mode: 0o600, flag: "wx" });
        renameSync(temporary, sourceAuth);
      } finally { rmSync(temporary, { force: true }); }
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
}

// Codex prints a header block ("OpenAI Codex v…", "--------", settings, "--------") at the
// start of each run and each resume. Only those blocks name the model: file contents the
// agent reads later can contain lines such as "  model: monaco.editor.ITextModel;".
function codexHeaders(log) {
  const lines = log.split(/\r?\n/), headers = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^OpenAI Codex v/.test(lines[i]) || lines[i + 1]?.trim() !== "--------") continue;
    for (let j = i + 2; j < lines.length && lines[j].trim() !== "--------"; j++) headers.push(lines[j]);
  }
  return headers.length ? headers.join("\n") : log;
}

export function codexModelMatches(log, requested) {
  const models = [...codexHeaders(log).matchAll(/^[\t ]*model:[\t ]*(\S+)[\t ]*\r?$/gm)].map(match => match[1]);
  return models.length > 0 && models.every(model => model === requested);
}

export function claudeModelMatches(actual, requested) {
  actual = claudeModelName(actual);
  requested = claudeModelName(requested);
  if (actual === requested) return true;
  // Aliases intentionally select the current member of a family. Full model
  // names allow only the provider's dated snapshot suffix, never another family.
  if (/^(opus|sonnet|haiku|fable)$/.test(requested)) return actual.startsWith(`claude-${requested}-`);
  return actual.startsWith(`${requested}-`) && /^\d{8}$/.test(actual.slice(requested.length + 1));
}

export function claudeResult(stdout, requested, allowEmpty = false) {
  const result = JSON.parse(stdout);
  if (result.is_error || (result.subtype && result.subtype !== "success")) throw new Error("Claude reported an unsuccessful result");
  const models = [...Object.keys(result.modelUsage ?? {}), ...(typeof result.model === "string" ? [result.model] : [])];
  if (!models.length || !models.every(model => claudeModelMatches(model, requested))) {
    throw new Error(`Claude result does not name requested model ${requested} (actual: ${models.join(", ") || "missing"})`);
  }
  if (allowEmpty && result.result == null) return "";
  if (typeof result.result !== "string" || (!allowEmpty && !result.result.trim())) throw new Error("Claude returned no final report");
  return result.result;
}

export function codexAdapter(options, common, output) {
  const { kind, worktree, model, effort } = options;
  return {
    command: "codex", capture: false,
    env: options.codexHome ? { CODEX_HOME: options.codexHome } : {},
    args: ["exec", "-m", model, "-c", `model_reasoning_effort=${effort}`, "-s", kind === "build" ? "workspace-write" : "read-only",
      ...(kind === "build" ? ["-c", "sandbox_workspace_write.network_access=true", "--add-dir", common] : []),
      "--dangerously-bypass-hook-trust", "-C", worktree, "-o", output, "-"],
    resume: session => ["exec", "resume", "-m", model, "-c", `model_reasoning_effort=${effort}`, "-c", `sandbox_mode="${kind === "build" ? "workspace-write" : "read-only"}"`,
      ...(kind === "build" ? ["-c", "sandbox_workspace_write.network_access=true", "-c", `sandbox_workspace_write.writable_roots=[${JSON.stringify(common)}]`] : []),
      "--dangerously-bypass-hook-trust", "-o", output, session, "-"],
    session: (_stdout, log) => [...log.matchAll(/^session id: (\S+)\s*$/gm)].at(-1)?.[1],
    finish: (_stdout, log) => {
      if (!codexModelMatches(log, model)) throw new Error(`run.log does not name requested model ${model}`);
      return null;
    },
  };
}

export function claudeAdapter(options, common) {
  const { kind, model, effort } = options;
  return {
    command: "claude", capture: true,
    args: ["-p", "--model", model, "--effort", effort, "--permission-mode", kind === "build" ? "acceptEdits" : "plan",
      ...(kind === "build" ? ["--add-dir", common] : ["--tools", "Read,Grep,Glob", "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']),
      "--output-format", "json", ...(options.sessionId ? ["--session-id", options.sessionId] : [])],
    // A resumed session keeps its id; --session-id would demand --fork-session.
    resume: session => [...claudeAdapter({ ...options, sessionId: undefined }, common).args, "--resume", session],
    session: stdout => JSON.parse(stdout).session_id,
    finish: stdout => claudeResult(stdout, model, kind === "review"),
  };
}

export function agentInvocation(options, common, output) {
  return adapters[options.cli](options, common, output);
}

export const buildContract = `
## Build contract
Leave changes unstaged. Do not commit, push, deploy, spawn agents or use git stash.
Run npm run check, npm test and npm run lint, plus the ticket's touched specs.
Final report: at most 15 lines; changed files, behavior, validation and unresolved risks.
`;

function writeStatus(path, status, changes = {}) {
  Object.assign(status, changes, { updated: new Date().toISOString() });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(status, null, 2) + "\n", { flag: "wx" });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

function finalState(code) {
  if (code === 0) return "done";
  if (code === 124) return "timeout";
  if ([129, 130, 143].includes(code)) return "interrupted";
  return "failed";
}

function disconnected(error) {
  return error.code === "EPIPE" || error.code === "EIO";
}

function print(stream, text) {
  try { stream.write(text); } catch (error) { if (!disconnected(error)) throw error; }
}

function printReport(out) {
  const output = join(out, "out.md");
  if (existsSync(output)) print(process.stdout, readFileSync(output, "utf8"));
}

function liveRunner(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    const command = process.platform === "linux" ? readFileSync(`/proc/${pid}/cmdline`, "utf8")
      : execFileSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" });
    return command.includes("agent-run.mjs");
  } catch { return false; }
}

function readStatus(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Claims are resume-claim-<generation>.<attempt>, linked into place complete, so
// exactly one caller restarts a dead run and none is ever half-written. A claim
// whose holder died before publishing its status is superseded by the next attempt.
function tryClaim(claim) {
  const temporary = `${claim}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${process.pid}\n`, { flag: "wx" });
    linkSync(temporary, claim);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally { rmSync(temporary, { force: true }); }
}

function claimResume(out, path, generation) {
  for (let attempt = 0; ; attempt++) {
    const claim = join(out, `resume-claim-${generation}.${attempt}`);
    if (tryClaim(claim)) return { won: true };
    const holder = Number(readFileSync(claim, "utf8"));
    if (liveRunner(holder) || readStatus(path).resumes >= generation) return { won: false, holder };
  }
}

// Follow the claimed generation to its end; null means its runner died first.
async function followGeneration(out, path, generation, holder, interval) {
  for (;;) {
    const current = readStatus(path);
    if (current.resumes > generation) return null;
    if (current.resumes === generation) {
      if (current.state !== "running") {
        printReport(out);
        return { code: current.exitCode ?? 1 };
      }
      if (!liveRunner(current.pid)) return null;
    } else if (!liveRunner(holder)) return null;
    await pause(interval);
  }
}

async function resumeRun(out) {
  const path = join(out, "status.json");
  const interval = Number(process.env.ASE_RESUME_POLL_MS || 2000);
  if (!Number.isSafeInteger(interval) || interval <= 0) throw new Error("ASE_RESUME_POLL_MS must be a positive integer");
  for (;;) {
    let previous = readStatus(path);
    if (liveRunner(previous.pid)) {
      const pid = previous.pid;
      print(process.stdout, `waiting: pid ${pid}\n`);
      while (liveRunner(pid)) await pause(interval);
      previous = readStatus(path);
      if (previous.pid !== pid) continue;
      if (previous.state !== "running") {
        printReport(out);
        return previous.exitCode ?? 1;
      }
    }
    if (previous.state === "done") { printReport(out); return 0; }
    if (!previous.session) {
      print(process.stderr, `problem: no session id recorded in ${path}; rerun instead\n`);
      return 1;
    }
    if (previous.cli === "codex" && previous.kind === "review") {
      print(process.stderr, "problem: cannot resume a Codex review; its temporary CODEX_HOME was removed; rerun instead\n");
      return 1;
    }
    const generation = previous.resumes + 1;
    const claim = claimResume(out, path, generation);
    if (!claim.won) {
      const followed = await followGeneration(out, path, generation, claim.holder, interval);
      if (followed) return followed.code;
      continue;
    }
    const options = parseAgentArgs([previous.kind, previous.worktree, previous.brief,
      "--model", previous.model, "--cli", previous.cli, "--effort", previous.effort,
      ...(previous.base === undefined ? [] : ["--base", previous.base]),
      ...(previous.commit === undefined ? [] : ["--commit", previous.commit]), "--out", out]);
    return startRun(options, previous);
  }
}

function preparePrompt(options, brief, out) {
  let prompt = brief;
  if (options.kind === "review") {
    const scope = reviewScope(brief, options, options.worktree);
    const { base, head, label, commit } = scope;
    const diff = join(out, "diff.patch"), commits = join(out, "commits.log"), refs = join(out, "refs.txt");
    const patch = execFileSync("git", ["-C", options.worktree, "diff", ...(commit ? [base, head] : [`${base}...${head}`])], { maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(diff, patch);
    writeFileSync(commits, execFileSync("git", ["-C", options.worktree, "log", "--oneline", `${base}..${head}`]));
    writeFileSync(refs, `${head}\n${base}\n`);
    if (!patch.length) return { problem: `problem: empty diff for ${label}` };
    prompt = prompt.replaceAll(reviewFormat, "");
    prompt += `\nReview scope: ${label}. Read ${JSON.stringify(diff)} for the diff, ${JSON.stringify(commits)} for git log --oneline ${base}..${head}, and ${JSON.stringify(refs)} for ${commit ? "commit and parent" : "HEAD and base"} SHAs (in that order). These prepared files define the scope; do not run git.\n${reviewFormat}`;
  }
  return { prompt };
}

function recordedSession(adapter, stdout, log) {
  try { return adapter.session(stdout, log); } catch { return null; }
}

function sessionObserver(adapter, update) {
  const pending = ["", ""];
  let stdout = "";
  return (chunk, isStdout) => {
    if (adapter.capture) {
      if (!isStdout) return;
      stdout += chunk;
      // Claude emits one JSON result. It may span multiple pipe chunks.
      const session = recordedSession(adapter, stdout, "");
      if (session) update(session);
      return;
    }
    const index = isStdout ? 0 : 1;
    pending[index] += chunk;
    const end = pending[index].lastIndexOf("\n");
    if (end < 0) return;
    const session = adapter.session("", pending[index].slice(0, end + 1));
    pending[index] = pending[index].slice(end + 1);
    if (session) update(session);
  };
}

async function invokeAgent(adapter, args, descriptor, context) {
  const { options, limit, logPath, log, output, messages, update } = context;
  const previous = Object.fromEntries(Object.keys(adapter.env ?? {}).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, adapter.env);
    const previousLog = readFileSync(logPath, "utf8").length;
    const result = await supervise(limit, adapter.command, args, {
      cwd: options.worktree, input: descriptor, log, capture: adapter.capture,
      onSpawn: pgid => update({ pgid }),
      onOutput: sessionObserver(adapter, session => update({ session })),
    });
    let status = result.status;
    const slice = readFileSync(logPath, "utf8").slice(previousLog);
    const session = recordedSession(adapter, result.stdout, slice);
    if (session) update({ session });
    if (status === 124) messages.push(`problem: agent exceeded timeout=${limit}; process group killed; see ${logPath}`);
    else if (status) messages.push(`problem: ${adapter.command} failed (${status}); see ${logPath}`);
    try {
      const report = adapter.finish(result.stdout, slice);
      if (report !== null) writeFileSync(output, report + "\n");
    } catch (error) {
      messages.push(`problem: ${error.message}; see ${logPath}`);
      status ||= 1;
    }
    return { ...result, status };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function executeRun(options, out, previous, update) {
  const messages = [];
  const limit = process.env.ASE_AGENT_TIMEOUT || process.env.SOL_TIMEOUT || "90m";
  durationMilliseconds(limit);
  const common = execFileSync("git", ["-C", options.worktree, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  const prepared = previous ? { prompt: "Continue where you stopped; the brief is unchanged." }
    : preparePrompt(options, readFileSync(options.brief, "utf8"), out);
  if (prepared.problem) return { status: 1, messages: [prepared.problem] };
  const reportPath = join(out, "out.md"), logPath = join(out, "run.log"), inputPath = join(out, `brief-${process.pid}.md`);
  // A resumed Codex report must not truncate the earlier final report.
  const output = previous ? join(out, `resume-${process.pid}-${randomUUID()}.md`) : reportPath;
  let input, log, reviewHome;
  try {
    writeFileSync(inputPath, prepared.prompt + (!previous && options.kind === "build" ? buildContract : ""));
    rmSync(output, { force: true });
    input = openSync(inputPath, "r");
    log = openSync(logPath, previous ? "a" : "w");
    if (previous) appendFileSync(log, `\n--- resume ${new Date().toISOString()} ---\n`);
    if (options.kind === "review" && options.cli === "codex") {
      reviewHome = makeCodexReviewHome();
      options.codexHome = reviewHome.home;
    }
    const adapter = agentInvocation(options, common, output);
    const context = { options, limit, logPath, log, output, messages, update };
    const invoke = (args, descriptor) => invokeAgent(adapter, args, descriptor, context);
    const complete = () => existsSync(output) && reviewComplete(readFileSync(output, "utf8"));
    const result = await invoke(previous ? adapter.resume(previous.session) : adapter.args, input);
    let status = result.status;
    if (!status && options.kind === "review" && !complete()) {
      const session = adapter.session(result.stdout, readFileSync(logPath, "utf8"));
      if (session) {
        writeFileSync(inputPath, "Your reply must start with the line REVIEW_STATUS: complete. Send the full review again in the required format.\n");
        const retryInput = openSync(inputPath, "r");
        try {
          rmSync(output, { force: true });
          status = (await invoke(adapter.resume(session), retryInput)).status;
        } finally { closeSync(retryInput); }
      }
      if (!complete()) {
        messages.push("problem: result lacks REVIEW_STATUS: complete");
        status ||= 1;
      }
    }
    let report;
    try {
      report = readFileSync(output, "utf8");
      if (!report.trim()) throw new Error("empty report");
      if (previous) appendFileSync(reportPath, report);
    } catch {
      messages.push(`problem: no final report; see ${logPath}`);
      status ||= 1;
    }
    const gitStatus = execFileSync("git", ["-C", options.worktree, "status", "--short"], { encoding: "utf8" });
    return { status, messages, report, gitStatus };
  } finally {
    if (input !== undefined) closeSync(input);
    if (log !== undefined) closeSync(log);
    rmSync(inputPath, { force: true });
    if (previous) rmSync(output, { force: true });
    if (reviewHome) closeCodexReviewHome(reviewHome);
  }
}

async function startRun(options, previous) {
  options.worktree = resolve(options.worktree);
  options.brief = resolve(options.brief);
  const artifacts = join(options.worktree, ".scratch/agent");
  mkdirSync(artifacts, { recursive: true });
  const out = options.out ? resolve(options.out) : mkdtempSync(join(artifacts, `${options.kind}-${Date.now()}-${process.pid}-`));
  mkdirSync(out, { recursive: true });
  // Claude reports its session id only in the final JSON; assign it up front so
  // a run killed mid-way can still be resumed.
  if (!previous && options.cli === "claude") options.sessionId = randomUUID();
  const status = {
    pid: process.pid, pgid: null, kind: options.kind, model: options.model, cli: options.cli, effort: options.effort,
    worktree: options.worktree, brief: options.brief, out,
    ...(options.base === undefined ? {} : { base: options.base }),
    ...(options.commit === undefined ? {} : { commit: options.commit }),
    started: previous?.started || new Date().toISOString(), state: "running", exitCode: null,
    session: previous?.session ?? options.sessionId ?? null, resumes: previous ? previous.resumes + 1 : 0,
  };
  const update = changes => writeStatus(join(out, "status.json"), status, changes);
  update();
  print(process.stdout, `artifacts: ${out}\n`);
  let code = 2, result;
  try {
    result = await executeRun(options, out, previous, update);
    code = result.status;
  } finally {
    // Persist the result before touching stdout/stderr: the app may be gone.
    update({ state: finalState(code), exitCode: code });
  }
  for (const message of result.messages) print(process.stderr, message + "\n");
  if (result.report) print(process.stdout, result.report);
  if (result.gitStatus) print(process.stdout, result.gitStatus);
  return code;
}

async function run(args) {
  const options = parseAgentArgs(args, process.env);
  return options.resume ? resumeRun(options.resume) : startRun(options);
}

if (import.meta.main) {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", error => { if (!disconnected(error)) throw error; });
  }
  try { process.exitCode = await run(process.argv.slice(2)); }
  catch (error) { print(process.stderr, `problem: ${error.message}\n`); process.exitCode = 2; }
}
