#!/usr/bin/env node

import { chmodSync, closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { createHash } from "node:crypto";

const TASK_LIMIT = 256 * 1024;
const OUTPUT_LIMIT = 1024 * 1024;
const OUTPUT_HARD_LIMIT = 8 * OUTPUT_LIMIT;
const TIMEOUT_LIMIT = 3600;
const CONTAINMENT_GRACE_SECONDS = 5;
const UNIT_CONFIRM_ATTEMPTS = 20;
const WORKSPACE_DIRECTORY_LIMIT = 100000;
const WORKSPACE_GJC_LIMIT = 256;
const WORKSPACE_DENY_BYTES_LIMIT = 64 * 1024;
const OMO_MIN = Object.freeze([4, 18, 0]);
const OBSERVE_LOG_LIMIT = 8 * 1024 * 1024;
const OBSERVE_FLUSH_BYTES = 64 * 1024;
// Observation redaction is deliberately over-broad (fail-closed): opaque token shapes,
// credential assignments, and long blobs are masked before any byte reaches the log.
const OBSERVE_REDACTIONS = Object.freeze([
  [/(authorization\s*[:=]\s*).+/gi, "$1[redacted]"],
  [/\b(bearer\s+)\S+/gi, "$1[redacted]"],
  [/\b((?:api[_-]?key|access[_-]?key|client[_-]?secret|token|secret|password|passwd|credential)s?["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[redacted]"],
  [/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]"],
  [/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{8,}\b/g, "[redacted]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, "[redacted]"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, "[redacted]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?/g, "[redacted]"],
  [/\b[A-Za-z0-9+/_-]{64,}={0,2}\b/g, "[redacted]"],
]);
const OVERSIZED_OUTPUT_SUMMARY = "Worker completed and verified its goal, but the final summary exceeded the 1 MiB relay limit and was withheld. The worker ran read-only, so no workspace changes exist. Re-dispatch a smaller piece or request a shorter summary for details.\n";
const HELP = `Usage: lazycodex-gjc [options] < task.txt

Options:
  --cwd PATH                           worker directory (default: current directory)
  --sandbox read-only                 worker filesystem access (write mode disabled)
  --model MODEL                        Codex model selector
  --timeout-seconds N                  timeout from 1 to 3600 (default: 1800)
  --binding PATH                       private install-time runtime binding
  --observe-log PATH                   tee a redacted worker event stream to a new log file
  --help                               show this help
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
    if (!["--cwd", "--sandbox", "--model", "--timeout-seconds", "--binding", "--observe-log"].includes(name)) throw new CliError(`unknown argument: ${name ?? ""}`);
    if (value === undefined || value.startsWith("--")) throw new CliError(`missing value for ${name}`);
    if (values.has(name)) throw new CliError(`duplicate argument: ${name}`);
    values.set(name, value);
  }
  const cwdInput = values.get("--cwd") ?? process.cwd();
  if (values.has("--cwd") && !isAbsolute(cwdInput)) throw new CliError("--cwd must be absolute");
  let cwd;
  try { cwd = realpathSync(cwdInput); } catch { throw new CliError("--cwd must be an existing directory"); } // no-excuse-ok: catch
  if (!statSync(cwd).isDirectory()) throw new CliError("--cwd is not a directory");
  const sandbox = values.get("--sandbox") ?? "read-only";
  if (sandbox !== "read-only") throw new CliError("invalid --sandbox");
  const model = values.get("--model");
  if (model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(model)) throw new CliError("invalid --model");
  const timeoutInput = values.get("--timeout-seconds") ?? "1800";
  if (!/^[1-9][0-9]*$/.test(timeoutInput)) throw new CliError("invalid --timeout-seconds");
  const timeoutSeconds = Number.parseInt(timeoutInput, 10);
  if (timeoutSeconds > TIMEOUT_LIMIT) throw new CliError("invalid --timeout-seconds");
  const binding = values.get("--binding");
  if (binding === undefined || !isAbsolute(binding)) throw new CliError("--binding must be an absolute path");
  const observeLog = values.get("--observe-log");
  if (observeLog !== undefined && !isAbsolute(observeLog)) throw new CliError("--observe-log must be an absolute path");
  return { help: false, cwd, sandbox, model, timeoutSeconds, binding, observeLog };
}

function readTask() {
  const bytes = readFileSync(0);
  if (bytes.length > TASK_LIMIT) throw new CliError(`task exceeds ${TASK_LIMIT} bytes`);
  if (bytes.includes(0)) throw new CliError("task contains NUL");
  let task;
  try { task = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CliError("task is not valid UTF-8"); } // no-excuse-ok: catch
  if (task.trim().length === 0) throw new CliError("task is empty");
  return task;
}

function within(path, parent) {
  return path === parent || path.startsWith(`${parent}${sep}`);
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function trustedFile(path, expectedDigest) {
  const entry = lstatSync(path);
  const canonical = realpathSync(path);
  const stats = statSync(canonical);
  const uid = process.getuid?.();
  if (entry.isSymbolicLink() || canonical !== resolve(path) || !stats.isFile() || (stats.mode & 0o022) !== 0 || (uid !== undefined && stats.uid !== uid && stats.uid !== 0)) return false;
  if (expectedDigest !== undefined && digestFile(canonical) !== expectedDigest) return false;
  let current = dirname(canonical);
  while (current !== dirname(current)) {
    const directory = lstatSync(current);
    if (directory.isSymbolicLink() || !directory.isDirectory() || (uid !== undefined && directory.uid !== uid && directory.uid !== 0)) return false;
    if ((directory.mode & 0o022) !== 0) return false;
    if (uid !== undefined && directory.uid === uid && (directory.mode & 0o077) === 0) return true;
    current = dirname(current);
  }
  const root = statSync(current);
  return root.isDirectory() && root.uid === 0 && (root.mode & 0o022) === 0;
}

function trustedDirectory(path) {
  const entry = lstatSync(path);
  const canonical = realpathSync(path);
  const stats = statSync(canonical);
  const uid = process.getuid?.();
  if (entry.isSymbolicLink() || canonical !== resolve(path) || !stats.isDirectory() || (stats.mode & 0o022) !== 0 || (uid !== undefined && stats.uid !== uid && stats.uid !== 0)) return false;
  let current = canonical;
  while (current !== dirname(current)) {
    const directory = lstatSync(current);
    if (directory.isSymbolicLink() || !directory.isDirectory() || (directory.mode & 0o022) !== 0 || (uid !== undefined && directory.uid !== uid && directory.uid !== 0)) return false;
    if (uid !== undefined && directory.uid === uid && (directory.mode & 0o077) === 0) return true;
    current = dirname(current);
  }
  const root = statSync(current);
  return root.isDirectory() && root.uid === 0 && (root.mode & 0o022) === 0;
}

function readBinding(path) {
  let lines;
  try {
    if (!trustedFile(path) || (statSync(path).mode & 0o077) !== 0) throw new Error("untrusted binding");
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    throw new CliError("trusted runtime binding not found", 78);
  } // no-excuse-ok: catch
  try {
    if (lines.at(-1) === "") lines.pop();
    if (lines.length !== 16 || lines[0] !== "lazycodex-gjc-binding-v1") throw new CliError("trusted runtime binding not found", 78);
    const [accountHome, runnerDigest, _runnerPath, nodeDigest, _nodePath, coreDigest, corePath, codexPath, codexHome, systemdRunDigest, systemdRunPath, systemctlDigest, systemctlPath, envDigest, envPath] = lines.slice(1);
    if (![accountHome, runnerDigest, coreDigest, corePath, codexPath, codexHome, systemdRunDigest, systemdRunPath, systemctlDigest, systemctlPath, envDigest, envPath].every((value) => value !== undefined && value.length > 0)) throw new CliError("trusted runtime binding not found", 78);
    if (digestFile(realpathSync(process.argv[1])) !== runnerDigest || !trustedFile(corePath, coreDigest) || !trustedDirectory(codexPath) || !trustedFile(systemdRunPath, systemdRunDigest) || !trustedFile(systemctlPath, systemctlDigest) || !trustedFile(envPath, envDigest)) throw new CliError("trusted runtime binding mismatch", 78);
    if (!isAbsolute(accountHome) || !isAbsolute(codexHome)) throw new CliError("trusted runtime binding mismatch", 78);
    return { accountHome: realpathSync(accountHome), codexHome: realpathSync(codexHome), core: realpathSync(corePath), codexPath: realpathSync(codexPath), systemdRun: realpathSync(systemdRunPath), systemctl: realpathSync(systemctlPath), env: realpathSync(envPath), nodeDigest };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("trusted runtime binding mismatch", 78);
  } // no-excuse-ok: catch
}

function protectedStatePaths(cwd, homeInput, codexHomeInput) {
  if (!homeInput || !isAbsolute(homeInput) || !codexHomeInput || !isAbsolute(codexHomeInput)) {
    throw new CliError("protected GJC or Codex state roots unavailable", 78);
  }
  let home;
  let codexHome;
  try {
    home = realpathSync(homeInput);
    codexHome = realpathSync(codexHomeInput);
  } catch {
    throw new CliError("protected GJC or Codex state roots unavailable", 78);
  } // no-excuse-ok: catch
  const canonical = (path) => {
    try { return realpathSync(path); } catch { return resolve(path); } // no-excuse-ok: catch
  };
  const hostRoots = [join(home, ".gjc"), join(home, ".codex"), codexHome].map(canonical);
  if (hostRoots.some((root) => within(cwd, root))) throw new CliError("--cwd cannot be inside protected GJC or Codex state");
  return [...new Set([canonical(join(cwd, ".gjc")), ...hostRoots])];
}

function addWorkspaceDeny(state, path) {
  if (state.denyPaths.has(path)) return;
  state.denyBytes += Buffer.byteLength(JSON.stringify(path), "utf8") + 7;
  if (state.denyBytes > WORKSPACE_DENY_BYTES_LIMIT) throw new CliError("workspace .gjc protection exceeds safe profile size", 78);
  state.denyPaths.add(path);
}

function workspaceDirectory(cwd, input, visited) {
  const directory = realpathSync(input);
  if (!within(directory, cwd)) throw new CliError("workspace traversal escaped target cwd", 78);
  if (visited.has(directory)) return undefined;
  visited.add(directory);
  if (visited.size > WORKSPACE_DIRECTORY_LIMIT) throw new CliError("workspace .gjc protection exceeds directory limit", 78);
  return directory;
}

function workspaceStateDenyPaths(cwd) {
  const pending = [cwd];
  const visited = new Set();
  const state = { denyPaths: new Set(), lexicalGjcPaths: new Set(), denyBytes: 0, gjcRoots: 0 };
  try {
    while (pending.length > 0) {
      const input = pending.pop();
      if (input === undefined) continue;
      const directory = workspaceDirectory(cwd, input, visited);
      if (directory === undefined) continue;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name);
        if (entry.name === ".gjc") {
          state.gjcRoots += 1;
          if (state.gjcRoots > WORKSPACE_GJC_LIMIT) throw new CliError("workspace .gjc protection exceeds state-root limit", 78);
          const lexicalPath = resolve(entryPath);
          addWorkspaceDeny(state, lexicalPath);
          state.lexicalGjcPaths.add(lexicalPath);
          try { addWorkspaceDeny(state, realpathSync(entryPath)); } catch { /* lexical deny still protects dangling state links */ } // no-excuse-ok: catch
          continue;
        }
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }
        if (entry.isSymbolicLink()) {
          try {
            const canonical = realpathSync(entryPath);
            if (statSync(canonical).isDirectory() && within(canonical, cwd)) pending.push(canonical);
          } catch { /* dangling non-state links are outside the traversal */ } // no-excuse-ok: catch
        }
      }
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("workspace .gjc protection could not be established", 78);
  } // no-excuse-ok: catch
  return { denyPaths: [...state.denyPaths], lexicalGjcPaths: [...state.lexicalGjcPaths] };
}


function ownedContainedFile(path, root) {
  const entry = lstatSync(path);
  const canonical = realpathSync(path);
  const stats = statSync(canonical);
  const uid = process.getuid?.();
  if (!trustedDirectory(root) || entry.isSymbolicLink() || !stats.isFile() || !within(canonical, root) || (stats.mode & 0o022) !== 0 || (uid !== undefined && stats.uid !== uid && stats.uid !== 0)) return false;
  let current = dirname(canonical);
  while (within(current, root)) {
    const directory = lstatSync(current);
    if (directory.isSymbolicLink() || !directory.isDirectory() || (directory.mode & 0o022) !== 0 || (uid !== undefined && directory.uid !== uid && directory.uid !== 0)) return false;
    if (current === root) break;
    current = dirname(current);
  }
  return current === root;
}

function prepareChildCodexHome(homeInput, hostCodexHomeInput) {
  let home;
  let hostCodexHome;
  try {
    home = realpathSync(homeInput);
    hostCodexHome = realpathSync(hostCodexHomeInput);
  } catch {
    throw new CliError("private Codex runtime state could not be established", 78);
  } // no-excuse-ok: catch
  const auth = join(hostCodexHome, "auth.json");
  try {
    const authStats = statSync(auth);
    const uid = process.getuid?.();
    if (!ownedContainedFile(auth, hostCodexHome) || (uid !== undefined && authStats.uid !== uid) || (authStats.mode & 0o077) !== 0) {
      throw new CliError("trusted Codex file credentials not found", 78);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("trusted Codex file credentials not found", 78);
  } // no-excuse-ok: catch

  const baseInput = join(home, ".cache", "oh-my-gjc", "lazycodex-gjc");
  let childHome;
  try {
    mkdirSync(baseInput, { recursive: true, mode: 0o700 });
    const baseEntry = lstatSync(baseInput);
    const base = realpathSync(baseInput);
    const baseStats = statSync(base);
    const uid = process.getuid?.();
    if (baseEntry.isSymbolicLink() || !baseStats.isDirectory() || !within(base, home) || (uid !== undefined && baseStats.uid !== uid) || (baseStats.mode & 0o077) !== 0) {
      throw new CliError("private Codex runtime state could not be established", 78);
    }
    childHome = mkdtempSync(join(base, "runtime-"));
    chmodSync(childHome, 0o700);
    const canonicalChildHome = realpathSync(childHome);
    if (!within(canonicalChildHome, base)) throw new CliError("private Codex runtime state could not be established", 78);
    symlinkSync(realpathSync(auth), join(canonicalChildHome, "auth.json"));
    return canonicalChildHome;
  } catch (error) {
    if (childHome !== undefined) rmSync(childHome, { recursive: true, force: true });
    if (error instanceof CliError) throw error;
    throw new CliError("private Codex runtime state could not be established", 78);
  } // no-excuse-ok: catch
}

function versionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  return match === null ? undefined : match.slice(1).map(Number);
}

function compatibleVersion(value) {
  const parts = versionParts(value);
  if (parts === undefined || parts[0] !== OMO_MIN[0]) return false;
  return parts[1] > OMO_MIN[1] || (parts[1] === OMO_MIN[1] && parts[2] >= OMO_MIN[2]);
}

function resolveOmoSkill(codexHomeInput) {
  if (!codexHomeInput || !isAbsolute(codexHomeInput)) throw new CliError("compatible OMO ultrawork capability not found", 78);
  let root;
  try { root = realpathSync(join(codexHomeInput, "plugins/cache/sisyphuslabs/omo")); } catch { throw new CliError("compatible OMO ultrawork capability not found", 78); } // no-excuse-ok: catch
  const candidates = readdirSync(root).filter(compatibleVersion).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
  for (const version of candidates) {
    try {
      const pluginRoot = realpathSync(join(root, version));
      if (!within(pluginRoot, root)) continue;
      const manifestPath = join(pluginRoot, ".codex-plugin/plugin.json");
      const skillPath = join(pluginRoot, "skills/ultrawork/SKILL.md");
      const componentPath = join(pluginRoot, "components/ultrawork/package.json");
      if (![manifestPath, skillPath, componentPath].every((path) => ownedContainedFile(path, pluginRoot))) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const component = JSON.parse(readFileSync(componentPath, "utf8"));
      const skill = readFileSync(skillPath, "utf8");
      if (manifest.name !== "omo" || manifest.version !== version) continue;
      if (component.name !== "@code-yeongyu/codex-ultrawork" || component.version !== version) continue;
      if (!/^---\nname: ultrawork\n/m.test(skill) || !skill.includes("<ultrawork-mode>")) continue;
      return { skill, version };
    } catch { /* malformed candidates are incompatible */ } // no-excuse-ok: catch
  }
  throw new CliError("compatible OMO ultrawork capability not found", 78);
}

function modeInstructions() {
  return "This worker is read-only; do not create, edit, delete, rename, or move files.";
}

function workerPrompt(task, omo, sandbox) {
  return `$omo:ultrawork
<validated-omo-ultrawork version="${omo.version}">
${omo.skill}
</validated-omo-ultrawork>
Run the raw task below as the sole goal. This is an isolated Codex/LazyCodex worker: do not invoke, configure, or mutate GJC tasks, sessions, plugins, credentials, or files. Do not run LazyCodex install, update, migration, doctor, or setup commands. Do not commit or push unless the raw task explicitly requests it. Obey the process permissions and return a final answer only after the goal is verified. Keep the final answer concise and below 1 MiB; summarize completed work and verification instead of embedding large files, diffs, or logs.
${modeInstructions(sandbox)}
<lazycodex-gjc-task>
${task}
</lazycodex-gjc-task>
`;
}

function toml(value) { return JSON.stringify(value); }

function prepareRuntime(core, codexPath, privateRoot) {
  const helperDir = join(privateRoot, "helpers");
  mkdirSync(helperDir, { mode: 0o700 });
  for (const name of ["codex-linux-sandbox", "codex-execve-wrapper", "apply_patch", "applypatch"]) symlinkSync(core, join(helperDir, name));
  return { core, codexPath, helperDir, safePath: [helperDir, codexPath, "/usr/local/bin", "/usr/bin", "/bin"].join(delimiter) };
}

function childEnvironment(runtime, codexHome, privateRoot) {
  const isolatedTmp = join(privateRoot, "tmp");
  const isolatedHome = join(isolatedTmp, "home");
  mkdirSync(isolatedHome, { recursive: true, mode: 0o700 });
  const env = { HOME: isolatedHome, CODEX_HOME: codexHome, PATH: runtime.safePath, TMPDIR: isolatedTmp };
  for (const name of ["LANG", ...Object.keys(process.env).filter((key) => key.startsWith("LC_"))]) if (process.env[name]) env[name] = process.env[name];
  return { ...env, GJC_NOTIFICATIONS: "0", GJC_SDK_DISABLE: "1", LAZYCODEX_AUTO_UPDATE_DISABLED: "1", OMO_CODEX_AUTO_UPDATE_DISABLED: "1", LAZYCODEX_CONFIG_MIGRATION_DISABLED: "1", OMO_CODEX_CONFIG_MIGRATION_DISABLED: "1", OMO_CODEX_DISABLE_POSTHOG: "1", OMO_CODEX_SEND_ANONYMOUS_TELEMETRY: "0", OMO_DISABLE_POSTHOG: "1", OMO_SEND_ANONYMOUS_TELEMETRY: "0", OMO_CODEGRAPH_AUTO_PROVISION: "0", CODEX_CODEGRAPH_AUTO_PROVISION: "0", OMO_CODEGRAPH_ENABLED: "0", CODEX_CODEGRAPH_ENABLED: "0", OMO_CODEGRAPH_TELEMETRY: "0", CODEX_CODEGRAPH_TELEMETRY: "0" };
}

function childArgs(config, env, runtime, output) {
  const baseProfile = ":read-only";
  const workspaceRoots = `{\".\"=\"read\"}`;
  const grants = [...config.protectedStatePaths.map((path) => [path, "deny"]), [env.HOME, "deny"], [env.CODEX_HOME, "read"], [runtime.core, "read"], [runtime.helperDir, "read"], [runtime.codexPath, "read"]].map(([path, mode]) => `${toml(path)}=${toml(mode)}`).join(",");
  const filesystem = `{":minimal"="read",":workspace_roots"=${workspaceRoots},":tmpdir"="write",${grants}}`;
  const args = ["exec", "--ephemeral", "--color", "never", "--ignore-user-config", "--ignore-rules", "--strict-config", "-C", config.cwd];
  for (const value of ['approval_policy="never"', 'web_search="disabled"', 'cli_auth_credentials_store="file"', 'default_permissions="lazycodex_gjc"', `permissions.lazycodex_gjc.extends=${toml(baseProfile)}`, `permissions.lazycodex_gjc.filesystem=${filesystem}`, "permissions.lazycodex_gjc.network.enabled=false", 'shell_environment_policy.inherit="none"', `shell_environment_policy.set={HOME=${toml(env.HOME)},TMPDIR=${toml(env.TMPDIR)},PATH=${toml(runtime.safePath)},GJC_NOTIFICATIONS="0",GJC_SDK_DISABLE="1"}`, "mcp_servers={}", "apps={}", "hooks={}"]) args.push("-c", value);
  for (const feature of ["apps", "enable_mcp_apps", "hooks", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "in_app_browser", "remote_plugin", "skill_mcp_dependency_install", "plugins"]) args.push("--disable", feature);
  args.push("-o", output);
  if (config.model !== undefined) args.push("--model", config.model);
  args.push("-");
  return args;
}

function killGroup(child) {
  if (child.pid === undefined) return;
  try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { /* already gone */ } // no-excuse-ok: catch
}

function stopUnit(systemctl, unit) {
  return new Promise((resolveStop) => {
    const stop = spawn(systemctl, ["--user", "kill", "--kill-who=all", "--signal=SIGKILL", unit], { shell: false, stdio: "ignore" });
    stop.once("error", () => resolveStop(false));
    stop.once("close", (code) => resolveStop(code === 0));
  });
}

function unitControlGroup(systemctl, unit) {
  return new Promise((resolveGroup) => {
    const show = spawn(systemctl, ["--user", "show", "--property=ControlGroup", "--value", unit], { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    show.stdout.setEncoding("utf8");
    show.stdout.on("data", (chunk) => { output += chunk; });
    show.once("error", () => resolveGroup(undefined));
    show.once("close", (code) => resolveGroup(code === 0 ? output.trim() : undefined));
  });
}

function cgroupEmpty(controlGroup) {
  if (!/^\/(?:[^/\0]+\/)*[^/\0]*$/.test(controlGroup) || controlGroup.split("/").some((part) => part === "." || part === "..")) return false;
  try {
    const path = `/sys/fs/cgroup${controlGroup}/cgroup.procs`;
    const stats = lstatSync(path);
    return !stats.isSymbolicLink() && stats.isFile() && readFileSync(path, "utf8").trim().length === 0;
  } catch {
    return false;
  }
}

async function unitDrained(systemctl, unit) {
  const inactiveCode = await new Promise((resolveInactive) => {
    const status = spawn(systemctl, ["--user", "is-active", "--quiet", unit], { shell: false, stdio: "ignore" });
    status.once("error", () => resolveInactive(undefined));
    status.once("close", resolveInactive);
  });
  if (inactiveCode === 4) return true;
  if (inactiveCode !== 3) return false;
  const controlGroup = await unitControlGroup(systemctl, unit);
  if (controlGroup === "") return true;
  return controlGroup !== undefined && cgroupEmpty(controlGroup);
}

function pause(milliseconds) {
  return new Promise((resolvePause) => { setTimeout(resolvePause, milliseconds); });
}

async function stopAndConfirmUnit(systemctl, unit) {
  await stopUnit(systemctl, unit);
  for (let attempt = 0; attempt < UNIT_CONFIRM_ATTEMPTS; attempt += 1) {
    if (await unitDrained(systemctl, unit)) return true;
    await pause(50);
  }
  await stopUnit(systemctl, unit);
  return unitDrained(systemctl, unit);
}

function redactObserved(text) {
  let redacted = text;
  for (const [pattern, replacement] of OBSERVE_REDACTIONS) redacted = redacted.replace(pattern, replacement);
  return redacted;
}

// Read-only observation tap: the launcher (never the child) tees the redacted codex exec
// event stream to a leader-owned log so `gjc monitor`/tail can watch a live run. Observation
// is best-effort — a failing log write disables the tap without touching the worker — while
// log *creation* fails closed before any spawn. The relay contract is unchanged: raw child
// stderr/stdout still never reach the launcher's own stdio.
function createObserver(path, protectedPaths) {
  if (path === undefined) return undefined;
  const lexical = resolve(path);
  let canonical;
  try { canonical = join(realpathSync(dirname(lexical)), basename(lexical)); } catch { throw new CliError("--observe-log parent directory must exist"); } // no-excuse-ok: catch
  if (protectedPaths.some((root) => within(lexical, root) || within(canonical, root))) throw new CliError("--observe-log cannot be inside protected GJC or Codex state");
  let fd;
  try { fd = openSync(canonical, "wx", 0o600); } catch { throw new CliError("--observe-log must be a new writable file"); } // no-excuse-ok: catch
  const decoders = { out: new StringDecoder("utf8"), err: new StringDecoder("utf8") };
  const buffers = { out: "", err: "" };
  let bytes = 0;
  let open = true;
  const append = (text) => {
    if (!open) return;
    const payload = redactObserved(text);
    bytes += Buffer.byteLength(payload, "utf8");
    if (bytes > OBSERVE_LOG_LIMIT) {
      open = false;
      try { writeSync(fd, "[observe] log limit reached; observation stopped, worker unaffected\n"); } catch { /* observation is best-effort */ } // no-excuse-ok: catch
      return;
    }
    try { writeSync(fd, payload); } catch { open = false; } // no-excuse-ok: catch
  };
  const flushLines = (stream) => {
    let index = buffers[stream].indexOf("\n");
    while (index >= 0) {
      append(`${stream} ${buffers[stream].slice(0, index)}\n`);
      buffers[stream] = buffers[stream].slice(index + 1);
      index = buffers[stream].indexOf("\n");
    }
    if (buffers[stream].length > OBSERVE_FLUSH_BYTES) {
      append(`${stream} ${buffers[stream]}\n`);
      buffers[stream] = "";
    }
  };
  return {
    note: (text) => append(`[observe] ${text}\n`),
    ingest: (stream, chunk) => {
      if (!open) return;
      buffers[stream] += decoders[stream].write(chunk);
      flushLines(stream);
    },
    close: () => {
      for (const stream of ["out", "err"]) {
        const tail = buffers[stream] + decoders[stream].end();
        buffers[stream] = "";
        if (tail.length > 0) append(`${stream} ${tail}\n`);
      }
      open = false;
      try { closeSync(fd); } catch { /* already closed */ } // no-excuse-ok: catch
    },
  };
}

function runChild(binary, args, prompt, env, output, timeoutSeconds, supervisor, observer) {
  return new Promise((resolveResult, reject) => {
    if (process.platform !== "linux") {
      reject(new CliError("systemd user-service containment is required", 78));
      return;
    }
    const unit = `lazycodex-gjc-${process.pid}-${Date.now()}`;
    // Manager-enforced termination backstop: even if every `systemctl kill` we issue fails
    // (or this process is SIGKILLed before its own timer fires), systemd force-terminates the
    // whole unit cgroup at RuntimeMaxSec. The grace only matters on the failure path — normal
    // flow kills at `timeoutSeconds` via our own timer, well before this cap.
    const runtimeMaxSec = timeoutSeconds + CONTAINMENT_GRACE_SECONDS;
    observer?.note(`unit=${unit} runtime-max-sec=${runtimeMaxSec} stop-command="systemctl --user stop ${unit}"`);
    const supervisorArgs = ["--user", "--wait", "--pipe", "--quiet", `--unit=${unit}`, "--property=KillMode=control-group", "--property=TimeoutStopSec=1s", `--property=RuntimeMaxSec=${runtimeMaxSec}`, "--", supervisor.env, "-i"];
    for (const [name, value] of Object.entries(env)) supervisorArgs.push(`${name}=${value}`);
    supervisorArgs.push(binary, ...args);
    const child = spawn(supervisor.systemdRun, supervisorArgs, { detached: true, env: process.env, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let failure;
    let containmentStopFailed = false;
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputMonitor;
    let timer;
    let containment;
    const interrupt = () => stop("interrupted");
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(outputMonitor);
      clearTimeout(timer);
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
      // Release the relay pipes and drop the child handle. On the containment-failure path
      // the abandoned unit still holds the write ends; without this the event loop would stay
      // alive until the RuntimeMaxSec backstop reaps it, hanging the synchronous call.
      for (const stream of [child.stdin, child.stdout, child.stderr]) { try { stream.destroy(); } catch { /* already closed */ } } // no-excuse-ok: catch
      try { child.unref(); } catch { /* already gone */ } // no-excuse-ok: catch
      resolveResult(result);
    };
    const confirmContainment = () => {
      if (containment === undefined) containment = stopAndConfirmUnit(supervisor.systemctl, unit);
      return containment;
    };
    const stop = (reason) => {
      if (failure === undefined) failure = reason;
      void (async () => {
        const inactive = await confirmContainment();
        containmentStopFailed = !inactive;
        killGroup(child);
        finish({ code: null, signal: "SIGKILL", failure, containmentStopFailed });
      })();
    };
    const failOverflow = () => stop("overflow");
    child.stdout.on("data", (chunk) => { stdoutBytes += chunk.length; observer?.ingest("out", chunk); if (stdoutBytes > OUTPUT_LIMIT) failOverflow(); });
    child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; observer?.ingest("err", chunk); if (stderrBytes > OUTPUT_LIMIT) failOverflow(); });
    child.once("error", () => { if (settled) return; settled = true; clearInterval(outputMonitor); clearTimeout(timer); process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt); reject(new CliError("worker failed to start", 127)); });
    outputMonitor = setInterval(() => { try { if (statSync(output).size > OUTPUT_HARD_LIMIT) failOverflow(); } catch { /* close handles missing output */ } }, 10); // no-excuse-ok: catch
    timer = setTimeout(() => stop("timeout"), timeoutSeconds * 1000);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    child.once("close", (code, signal) => {
      void (async () => {
        const inactive = await confirmContainment();
        containmentStopFailed = !inactive;
        killGroup(child);
        finish({ code, signal, failure, containmentStopFailed });
      })();
    });
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") stop("input"); });
    child.stdin.end(prompt);
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) { process.stdout.write(HELP); return; }
  const task = readTask();
  const binding = readBinding(config.binding);
  const codexHome = binding.codexHome;
  const workspaceState = workspaceStateDenyPaths(config.cwd);
  const protectedPaths = [...new Set([...protectedStatePaths(config.cwd, binding.accountHome, codexHome), ...workspaceState.denyPaths])];
  const omo = resolveOmoSkill(codexHome);
  const observer = createObserver(config.observeLog, protectedPaths);
  let temp;
  let childCodexHome;
  let result;
  try {
    temp = mkdtempSync(join(tmpdir(), "lazycodex-gjc-"));
    chmodSync(temp, 0o700);
    const runtime = prepareRuntime(binding.core, binding.codexPath, temp);
    childCodexHome = prepareChildCodexHome(binding.accountHome, codexHome);
    const output = join(temp, "final.txt");
    writeFileSync(output, "", { mode: 0o600 });
    const env = childEnvironment(runtime, childCodexHome, temp);
    result = await runChild(runtime.core, childArgs({ ...config, protectedStatePaths: protectedPaths }, env, runtime, output), workerPrompt(task, omo, config.sandbox), env, output, config.timeoutSeconds, binding, observer);
    observer?.note(`worker closed failure=${result.failure ?? "none"} code=${result.code ?? "null"} signal=${result.signal ?? "none"}`);
    if (result.failure === "input") throw new CliError("worker input failed", 1);
    if (result.failure === "interrupted") throw new CliError("worker interrupted", 130);
    if (result.failure === "timeout") throw new CliError("worker timed out", 124);
    if (result.failure === "overflow" || statSync(output).size > OUTPUT_HARD_LIMIT) throw new CliError("worker output exceeded hard limit", 1);
    if (result.code !== 0) throw new CliError(result.code === null ? `worker terminated by signal ${result.signal ?? "unknown"}` : `worker exited with code ${result.code}`, result.code ?? 1);
    if (result.containmentStopFailed) throw new CliError("worker containment was not confirmed", 1);
    const bytes = readFileSync(output);
    if (bytes.length > OUTPUT_HARD_LIMIT) throw new CliError("worker output exceeded hard limit", 1);
    if (bytes.length > OUTPUT_LIMIT) {
      // Atomicity contract (#202): a verified, completed worker must never be reported as a
      // failure just because its final summary is oversized. The worker is read-only, so no
      // workspace side effects exist either way; relay a bounded fixed summary instead.
      process.stdout.write(OVERSIZED_OUTPUT_SUMMARY);
      return;
    }
    let finalOutput;
    try { finalOutput = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CliError("final output is not valid UTF-8", 1); } // no-excuse-ok: catch
    if (finalOutput.trim().length === 0) throw new CliError("final output is empty", 1);
    process.stdout.write(finalOutput);
  } catch (error) {
    throw error;
  } finally {
    observer?.close();
    if (temp !== undefined) rmSync(temp, { recursive: true, force: true });
    if (childCodexHome !== undefined) rmSync(childCodexHome, { recursive: true, force: true });
  }
}

main().catch((error) => { // no-excuse-ok: catch
  if (error instanceof CliError) {
    process.stderr.write(`lazycodex-gjc: ${error.message}\n`);
    process.exitCode = error.exitCode;
    return;
  }
  process.stderr.write("lazycodex-gjc: unexpected failure\n");
  process.exitCode = 1;
});
