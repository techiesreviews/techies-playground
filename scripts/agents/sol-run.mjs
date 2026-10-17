#!/usr/bin/env node
// Usage: sol-run.mjs <duration> <command...>; wait for one job, kill its process group on expiry.
import { spawn } from "node:child_process";
import { writeSync } from "node:fs";

export function durationMilliseconds(duration) {
  const match = /^([1-9][0-9]*)([smhd]?)$/.exec(duration ?? "");
  const milliseconds = match ? Number(match[1]) * ({ "": 1, s: 1, m: 60, h: 3600, d: 86400 }[match[2]]) * 1000 : NaN;
  if (!Number.isSafeInteger(milliseconds) || milliseconds > 2_147_483_647) {
    throw new Error("agent timeout must be positive and at most 2147483 seconds");
  }
  return milliseconds;
}

export function supervise(duration, command, args, { cwd, input = 0, log, capture = false, onSpawn, onOutput } = {}) {
  const milliseconds = durationMilliseconds(duration);
  return new Promise(resolve => {
    // detached makes the child's PID its process-group ID on Linux. Unlike some
    // timeout implementations, expiry signals all descendants, whichever CLI runs.
    const child = spawn(command, args, { cwd, detached: true, stdio: log === undefined ? "inherit" : [input, "pipe", "pipe"] });
    let stdout = "";
    let result;
    function stop(code) {
      result ??= code;
      if (!child.pid) return;
      try { process.kill(-child.pid, "SIGKILL"); } catch (error) {
        if (error.code !== "ESRCH") console.error(`problem: cannot kill agent process group: ${error.message}`);
      }
    }
    function fail(error) {
      console.error(`problem: ${error.message}`);
      stop(1);
      // Closing both pipes also bounds close when a descendant holds them open.
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
    function record(chunk, isStdout) {
      try {
        writeSync(log, chunk);
        if (capture && isStdout) stdout += chunk;
        onOutput?.(chunk.toString(), isStdout);
      } catch (error) { fail(error); }
    }
    const recordStdout = chunk => record(chunk, true);
    const recordStderr = chunk => record(chunk, false);
    if (log !== undefined) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", recordStdout);
      child.stderr.on("data", recordStderr);
      child.stdout.on("error", fail);
      child.stderr.on("error", fail);
    }
    const timer = setTimeout(() => stop(124), milliseconds);
    const interrupt = () => stop(130);
    const terminate = () => stop(143);
    const hangup = () => stop(129);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    process.once("SIGHUP", hangup);
    child.once("error", fail);
    child.once("spawn", () => {
      try { onSpawn?.(child.pid); } catch (error) { fail(error); }
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
      process.removeListener("SIGHUP", hangup);
      child.removeListener("error", fail);
      child.stdout?.removeListener("data", recordStdout);
      child.stderr?.removeListener("data", recordStderr);
      child.stdout?.removeListener("error", fail);
      child.stderr?.removeListener("error", fail);
      resolve({ status: result ?? code ?? ({ SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[signal] ?? 1), stdout });
    });
  });
}

if (import.meta.main) {
  const [duration, command, ...args] = process.argv.slice(2);
  try {
    if (!command) throw new Error("need a command");
    process.exitCode = (await supervise(duration, command, args)).status;
  } catch (error) {
    console.error(`problem: ${error.message}`);
    process.exitCode = 2;
  }
}
