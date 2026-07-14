#!/usr/bin/env node

import { constants, accessSync, chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const TASK_LIMIT = 256 * 1024;
const OUTPUT_LIMIT = 1024 * 1024;
const TIMEOUT_LIMIT = 3600;
const HELP = `Usage: lazycodex-gjc [options] < task.txt

Options:
  --cwd PATH                         worker directory (default: current directory)
  --sandbox read-only|workspace-write  worker filesystem access (default: read-only)
  --model MODEL                      Codex model selector
  --timeout-seconds N                timeout from 1 to 3600 (default: 1800)
  --help                             show this help
`;

class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--cwd", "--sandbox", "--model", "--timeout-seconds"].includes(name)) throw new CliError(`unknown argument: ${name ?? ""}`);
    if (value === undefined || value.startsWith("--")) throw new CliError(`missing value for ${name}`);
    if (values.has(name)) throw new CliError(`duplicate argument: ${name}`);
    values.set(name, value);
  }

  const cwdInput = values.get("--cwd") ?? process.cwd();
  if (values.has("--cwd") && !isAbsolute(cwdInput)) throw new CliError("--cwd must be absolute");
  const cwd = resolve(cwdInput);
  try {
    if (!statSync(cwd).isDirectory()) throw new CliError("--cwd is not a directory");
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("--cwd must be an existing directory");
  }

  const sandbox = values.get("--sandbox") ?? "read-only";
  if (sandbox !== "read-only" && sandbox !== "workspace-write") throw new CliError("invalid --sandbox");
  const model = values.get("--model");
  if (model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(model)) throw new CliError("invalid --model");
  const timeoutInput = values.get("--timeout-seconds") ?? "1800";
  if (!/^[1-9][0-9]*$/.test(timeoutInput)) throw new CliError("invalid --timeout-seconds");
  const timeoutSeconds = Number.parseInt(timeoutInput, 10);
  if (timeoutSeconds > TIMEOUT_LIMIT) throw new CliError("invalid --timeout-seconds");
  return { help: false, cwd, sandbox, model, timeoutSeconds };
}

function readTask() {
  const bytes = readFileSync(0);
  if (bytes.length > TASK_LIMIT) throw new CliError(`task exceeds ${TASK_LIMIT} bytes`);
  if (bytes.includes(0)) throw new CliError("task contains NUL");
  let task;
  try {
    task = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) throw new CliError("task is not valid UTF-8");
    throw error;
  }
  if (task.trim().length === 0) throw new CliError("task is empty");
  return task;
}

function resolveCodex(pathValue) {
  for (const directory of (pathValue ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const candidate = resolve(directory, "codex");
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
  }
  throw new CliError("codex executable not found", 127);
}

function childEnvironment() {
  const allowed = ["HOME", "CODEX_HOME", "PATH", "SHELL", "USER", "LOGNAME", "LANG", "TERM", "TMPDIR"];
  const env = {};
  for (const name of allowed) if (process.env[name] !== undefined) env[name] = process.env[name];
  for (const [name, value] of Object.entries(process.env)) if (name.startsWith("LC_") && value !== undefined) env[name] = value;
  return {
    ...env,
    GJC_NOTIFICATIONS: "0",
    LAZYCODEX_AUTO_UPDATE_DISABLED: "1",
    OMO_CODEX_AUTO_UPDATE_DISABLED: "1",
    LAZYCODEX_CONFIG_MIGRATION_DISABLED: "1",
    OMO_CODEX_CONFIG_MIGRATION_DISABLED: "1",
    OMO_CODEX_DISABLE_POSTHOG: "1",
    OMO_CODEX_SEND_ANONYMOUS_TELEMETRY: "0",
    OMO_DISABLE_POSTHOG: "1",
    OMO_SEND_ANONYMOUS_TELEMETRY: "0",
    OMO_CODEGRAPH_AUTO_PROVISION: "0",
    CODEX_CODEGRAPH_AUTO_PROVISION: "0",
    OMO_CODEGRAPH_ENABLED: "0",
    CODEX_CODEGRAPH_ENABLED: "0",
    OMO_CODEGRAPH_TELEMETRY: "0",
    CODEX_CODEGRAPH_TELEMETRY: "0",
  };
}

function workerPrompt(task) {
  return `$omo:ultrawork
Run the raw task below as the sole goal. This is an isolated Codex/LazyCodex worker: do not invoke, configure, or mutate GJC tasks, sessions, plugins, credentials, or files. Do not run LazyCodex install, update, migration, doctor, or setup commands. Do not commit or push unless the raw task explicitly requests it. Obey the process sandbox and return a final answer only after the goal is verified.
<lazycodex-gjc-task>
${task}
</lazycodex-gjc-task>
`;
}

function runChild(binary, args, prompt, env, timeoutSeconds) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { detached: process.platform !== "win32", env, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const stderr = [];
    let stderrBytes = 0;
    let stdoutBytes = 0;
    let overflow = false;
    let timedOut = false;
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > OUTPUT_LIMIT) overflow = true;
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= OUTPUT_LIMIT) stderr.push(chunk);
      else overflow = true;
    });
    child.once("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      const pid = child.pid;
      if (pid === undefined) return;
      try {
        process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
      } catch (error) {
        if (!(error instanceof Error)) reject(error);
      }
    }, timeoutSeconds * 1000);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({ code, signal, timedOut, overflow, stderr: Buffer.concat(stderr).toString("utf8") });
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(prompt);
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(HELP);
    return;
  }
  const task = readTask();
  const binary = resolveCodex(process.env.PATH);
  const temp = mkdtempSync(join(tmpdir(), "lazycodex-gjc-"));
  chmodSync(temp, 0o700);
  const output = join(temp, "final.txt");
  writeFileSync(output, "", { mode: 0o600 });
  try {
    const args = ["exec", "--ephemeral", "--color", "never", "--sandbox", config.sandbox, "-C", config.cwd, "-c", 'approval_policy="never"', "-c", 'network_access="disabled"', "-o", output];
    if (config.model !== undefined) args.push("--model", config.model);
    args.push("-");
    const result = await runChild(binary, args, workerPrompt(task), childEnvironment(), config.timeoutSeconds);
    if (result.timedOut) throw new CliError("worker timed out", 124);
    if (result.overflow) throw new CliError("worker output exceeded limit", 1);
    if (result.code !== 0) {
      if (result.stderr.length > 0) process.stderr.write(result.stderr);
      throw new CliError(`worker exited ${result.code ?? result.signal ?? "unknown"}`, result.code ?? 1);
    }
    if (statSync(output).size > OUTPUT_LIMIT) throw new CliError("final output exceeded limit", 1);
    const bytes = readFileSync(output);
    let finalOutput;
    try {
      finalOutput = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      if (error instanceof TypeError) throw new CliError("final output is not valid UTF-8", 1);
      throw error;
    }
    if (finalOutput.trim().length === 0) throw new CliError("final output is empty", 1);
    process.stdout.write(finalOutput);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { // no-excuse-ok: catch
  if (error instanceof CliError) {
    process.stderr.write(`lazycodex-gjc: ${error.message}\n`);
    process.exitCode = error.exitCode;
    return;
  }
  process.stderr.write(`lazycodex-gjc: ${error instanceof Error ? error.message : "unexpected failure"}\n`);
  process.exitCode = 1;
});
