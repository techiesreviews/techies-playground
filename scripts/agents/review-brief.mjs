#!/usr/bin/env node
// Usage: review-brief.mjs <ticket-file> [base | --commit SHA]; print a slice review brief.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

export const reviewFormat = `Required format:
REVIEW_STATUS: complete
Defects: commit:path:line, severity, evidence, and fix; use separate Spec and Standards groups.
Validation gaps: concrete missing coverage, or none.
Optional nits: separate from defects, or none.
The very first line must be REVIEW_STATUS: complete. No preamble or markdown fence.
`;

export function resolveCommit(ref, worktree = process.cwd()) {
  try {
    return execFileSync("git", ["-C", worktree, "rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { throw new Error(`cannot resolve commit ref ${ref}`); }
}

export function reviewScope(brief, { base, commit } = {}, worktree = process.cwd()) {
  if (base !== undefined && commit !== undefined) throw new Error("--base and --commit are mutually exclusive");
  if (base === undefined && commit === undefined) {
    const single = /\bgit diff (\S+)\^\.\.\1(?=[\s).,;]|$)/.exec(brief);
    if (single) commit = single[1];
    else base = /\bgit diff (\S+)\.\.\.HEAD\b/.exec(brief)?.[1];
  }
  if (base === undefined && commit === undefined) throw new Error("brief has no review scope; pass --base REF or --commit SHA");
  if (commit !== undefined) {
    const head = resolveCommit(commit, worktree);
    const parent = resolveCommit(`${head}^`, worktree);
    return { head, base: parent, commit: head, label: `git diff ${head}^..${head}` };
  }
  const resolved = resolveCommit(base, worktree);
  return { head: resolveCommit("HEAD", worktree), base: resolved, label: `git diff ${resolved}...HEAD` };
}

export function reviewComplete(result) {
  const lines = result.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim());
  while (lines[0] === "") lines.shift();
  if (/^(`{3,}[^`]*|~{3,}.*)$/.test(lines[0] ?? "")) {
    lines.shift();
    while (lines[0] === "") lines.shift();
  }
  return lines[0] === "REVIEW_STATUS: complete";
}

export function reviewBrief(ticketPath, ticket, scope = "origin/main", worktree = process.cwd()) {
  const { label } = reviewScope("", typeof scope === "string" ? { base: scope } : scope, worktree);
  // Markdown links are relative to the ticket; repo paths in backticks are
  // rooted at the worktree. The parent map's spec is included when present.
  const links = [...ticket.matchAll(/\[[^\]]*\]\(([^\s)]+\.md)(?:#[^\s)]*)?\)/g)]
    .map(match => match[1]).filter(path => !/^[a-z]+:/i.test(path))
    .map(path => path.startsWith("docs/") ? path : posix.normalize(posix.join(posix.dirname(ticketPath), path)));
  const refs = [...ticket.matchAll(/`([^`\n]*\bspec\.md)(?:#[^`\n]*)?`/g)].map(match => match[1]);
  const sources = [...new Set([ticketPath, ...links, ...refs].filter(Boolean))];
  return `Review this build slice in read-only mode. Make no changes.
Scope: ${label}.
${sources.length ? `Spec axis: read ${sources.join(", ")}, including the linked spec and deciding tickets.` : "Spec axis: no ticket supplied; assess the change against the stated intent and repo documentation."}
Standards axis: apply AGENTS.md and docs/agents/agent-scripts.md; cite the applicable rule with each defect.
Read the supplied validation evidence. Do not assume checks ran: this project has npm test and npm run build, but no check or lint scripts.
Report validation gaps only for missing coverage or evidence in the change, with a concrete check to add. Node tests do not establish real Playground browser behavior.
`;
}

export function ticketReviewBrief(path, scope = "origin/main", worktree = process.cwd()) {
  const absolute = resolve(worktree, path);
  let ticket = readFileSync(absolute, "utf8");
  // Build-map tickets often omit a link to their sibling ../spec.md.
  const spec = resolve(dirname(absolute), "../spec.md");
  try { readFileSync(spec); ticket += "\n[Map spec](../spec.md)\n"; } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return reviewBrief(path, ticket, scope, worktree);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (!(args.length === 1 || (args.length === 2 && !args[1].startsWith("--")) || (args.length === 3 && args[1] === "--commit"))) {
    console.error("Usage: review-brief.mjs <ticket-file> [base=origin/main | --commit SHA]");
    process.exit(2);
  }
  try {
    process.stdout.write(ticketReviewBrief(args[0], args[1] === "--commit" ? { commit: args[2] } : args[1]));
  } catch (error) {
    console.error(`problem: ${error.message}`);
    process.exitCode = 2;
  }
}
