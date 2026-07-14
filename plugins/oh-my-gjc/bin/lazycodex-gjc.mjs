#!/usr/bin/env node

import { constants, accessSync, chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const TASK_LIMIT = 256 * 1024;
const OUTPUT_LIMIT = 1024 * 1024;
const TIMEOUT_LIMIT = 3600;
const CONTAINMENT_GRACE_SECONDS = 5;
const WORKSPACE_DIRECTORY_LIMIT = 100000;
const WORKSPACE_GJC_LIMIT = 256;
const WORKSPACE_DENY_BYTES_LIMIT = 64 * 1024;
const OMO_MIN = Object.freeze([4, 18, 0]);
const HELP = `Usage: lazycodex-gjc [options] < task.txt

Options:
  --cwd PATH                           worker directory (default: current directory)
  --sandbox read-only|workspace-write worker filesystem access (default: read-only)
  --model MODEL                        Codex model selector
  --timeout-seconds N                  timeout from 1 to 3600 (default: 1800)
  --binding PATH                       private install-time runtime binding
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
    if (!["--cwd", "--sandbox", "--model", "--timeout-seconds", "--binding"].includes(name)) throw new CliError(`unknown argument: ${name ?? ""}`);
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
  if (!["read-only", "workspace-write"].includes(sandbox)) throw new CliError("invalid --sandbox");
  const model = values.get("--model");
  if (model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(model)) throw new CliError("invalid --model");
  const timeoutInput = values.get("--timeout-seconds") ?? "1800";
  if (!/^[1-9][0-9]*$/.test(timeoutInput)) throw new CliError("invalid --timeout-seconds");
  const timeoutSeconds = Number.parseInt(timeoutInput, 10);
  if (timeoutSeconds > TIMEOUT_LIMIT) throw new CliError("invalid --timeout-seconds");
  const binding = values.get("--binding");
  if (binding === undefined || !isAbsolute(binding)) throw new CliError("--binding must be an absolute path");
  return { help: false, cwd, sandbox, model, timeoutSeconds, binding };
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
  const state = { denyPaths: new Set(), denyBytes: 0, gjcRoots: 0 };
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
          addWorkspaceDeny(state, resolve(entryPath));
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
  return [...state.denyPaths];
}

function rejectNewWorkspaceState(cwd, initialPaths) {
  const currentPaths = workspaceStateDenyPaths(cwd);
  const created = currentPaths.filter((path) => basename(path) === ".gjc" && !initialPaths.has(path));
  for (const path of created) rmSync(path, { recursive: true, force: true });
  if (created.length > 0) throw new CliError("worker created forbidden workspace .gjc state", 1);
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

function modeInstructions(sandbox) {
  if (sandbox === "read-only") return "This worker is read-only; do not create, edit, delete, rename, or move files.";
  return "The built-in `file_change` route is broken under this custom permission profile; do not use it. Make authorized workspace edits through the shell tool, using the existing `apply_patch` command for patches or other shell commands inside the active custom permission profile. Verify every edit before finishing.";
}

function workerPrompt(task, omo, sandbox) {
  return `$omo:ultrawork
<validated-omo-ultrawork version="${omo.version}">
${omo.skill}
</validated-omo-ultrawork>
Run the raw task below as the sole goal. This is an isolated Codex/LazyCodex worker: do not invoke, configure, or mutate GJC tasks, sessions, plugins, credentials, or files. Do not run LazyCodex install, update, migration, doctor, or setup commands. Do not commit or push unless the raw task explicitly requests it. Obey the process permissions and return a final answer only after the goal is verified.
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
  return { ...env, GJC_NOTIFICATIONS: "0", LAZYCODEX_AUTO_UPDATE_DISABLED: "1", OMO_CODEX_AUTO_UPDATE_DISABLED: "1", LAZYCODEX_CONFIG_MIGRATION_DISABLED: "1", OMO_CODEX_CONFIG_MIGRATION_DISABLED: "1", OMO_CODEX_DISABLE_POSTHOG: "1", OMO_CODEX_SEND_ANONYMOUS_TELEMETRY: "0", OMO_DISABLE_POSTHOG: "1", OMO_SEND_ANONYMOUS_TELEMETRY: "0", OMO_CODEGRAPH_AUTO_PROVISION: "0", CODEX_CODEGRAPH_AUTO_PROVISION: "0", OMO_CODEGRAPH_ENABLED: "0", CODEX_CODEGRAPH_ENABLED: "0", OMO_CODEGRAPH_TELEMETRY: "0", CODEX_CODEGRAPH_TELEMETRY: "0" };
}

function childArgs(config, env, runtime, output) {
  const access = config.sandbox === "workspace-write" ? "write" : "read";
  const baseProfile = config.sandbox === "workspace-write" ? ":workspace" : ":read-only";
  const workspaceRoots = `{"."="${access}"}`;
  const grants = [...config.protectedStatePaths.map((path) => [path, "deny"]), [env.HOME, "deny"], [env.CODEX_HOME, "read"], [runtime.core, "read"], [runtime.helperDir, "read"], [runtime.codexPath, "read"]].map(([path, mode]) => `${toml(path)}=${toml(mode)}`).join(",");
  const filesystem = `{":minimal"="read",":workspace_roots"=${workspaceRoots},":tmpdir"="write",${grants}}`;
  const args = ["exec", "--ephemeral", "--color", "never", "--ignore-user-config", "--ignore-rules", "--strict-config", "-C", config.cwd];
  for (const value of ['approval_policy="never"', 'web_search="disabled"', 'cli_auth_credentials_store="file"', 'default_permissions="lazycodex_gjc"', `permissions.lazycodex_gjc.extends=${toml(baseProfile)}`, `permissions.lazycodex_gjc.filesystem=${filesystem}`, "permissions.lazycodex_gjc.network.enabled=false", 'shell_environment_policy.inherit="none"', `shell_environment_policy.set={HOME=${toml(env.HOME)},TMPDIR=${toml(env.TMPDIR)},PATH=${toml(runtime.safePath)}}`, "mcp_servers={}", "apps={}", "hooks={}"]) args.push("-c", value);
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

function runChild(binary, args, prompt, env, output, timeoutSeconds, supervisor) {
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
    const supervisorArgs = ["--user", "--wait", "--collect", "--pipe", "--quiet", `--unit=${unit}`, "--property=KillMode=control-group", "--property=TimeoutStopSec=1s", `--property=RuntimeMaxSec=${runtimeMaxSec}`, "--", supervisor.env, "-i"];
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
    const stop = (reason) => {
      if (failure === undefined) failure = reason;
      void (async () => {
        // Fail-closed containment accounting: one retry, then record the failure so the
        // caller reports an uncertain stop instead of silently assuming the unit died.
        if (!(await stopUnit(supervisor.systemctl, unit)) && !(await stopUnit(supervisor.systemctl, unit))) containmentStopFailed = true;
        killGroup(child);
        // On a failed stop the unit may still hold the relay pipes, so `close` would not fire
        // until the RuntimeMaxSec backstop reaps it. Do not block the synchronous call on that:
        // resolve now with the failure recorded; systemd force-terminates the cgroup at the cap.
        if (containmentStopFailed) finish({ code: null, signal: "SIGKILL", failure, containmentStopFailed });
      })();
    };
    const failOverflow = () => stop("overflow");
    child.stdout.on("data", (chunk) => { stdoutBytes += chunk.length; if (stdoutBytes > OUTPUT_LIMIT) failOverflow(); });
    child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; if (stderrBytes > OUTPUT_LIMIT) failOverflow(); });
    child.once("error", () => { if (settled) return; settled = true; clearInterval(outputMonitor); clearTimeout(timer); process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt); reject(new CliError("worker failed to start", 127)); });
    outputMonitor = setInterval(() => { try { if (statSync(output).size > OUTPUT_LIMIT) failOverflow(); } catch { /* close handles missing output */ } }, 10); // no-excuse-ok: catch
    timer = setTimeout(() => stop("timeout"), timeoutSeconds * 1000);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    child.once("close", async (code, signal) => {
      await stopUnit(supervisor.systemctl, unit);
      killGroup(child);
      finish({ code, signal, failure, containmentStopFailed });
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
  const workspaceDenies = workspaceStateDenyPaths(config.cwd);
  const initialWorkspaceState = new Set(workspaceDenies.filter((path) => basename(path) === ".gjc"));
  const protectedPaths = [...new Set([...protectedStatePaths(config.cwd, binding.accountHome, codexHome), ...workspaceDenies])];
  const omo = resolveOmoSkill(codexHome);
  let temp;
  let childCodexHome;
  try {
    temp = mkdtempSync(join(tmpdir(), "lazycodex-gjc-"));
    chmodSync(temp, 0o700);
    const runtime = prepareRuntime(binding.core, binding.codexPath, temp);
    childCodexHome = prepareChildCodexHome(binding.accountHome, codexHome);
    const output = join(temp, "final.txt");
    writeFileSync(output, "", { mode: 0o600 });
    const env = childEnvironment(runtime, childCodexHome, temp);
    const result = await runChild(runtime.core, childArgs({ ...config, protectedStatePaths: protectedPaths }, env, runtime, output), workerPrompt(task, omo, config.sandbox), env, output, config.timeoutSeconds, binding);
    rejectNewWorkspaceState(config.cwd, initialWorkspaceState);
    const stopSuffix = result.containmentStopFailed ? "; containment stop failed — the systemd user unit may still be running" : "";
    if (result.failure === "input") throw new CliError(`worker input failed${stopSuffix}`, 1);
    if (result.failure === "interrupted") throw new CliError(`worker interrupted${stopSuffix}`, 130);
    if (result.failure === "timeout") throw new CliError(`worker timed out${stopSuffix}`, 124);
    if (result.failure === "overflow" || statSync(output).size > OUTPUT_LIMIT) throw new CliError(`worker output exceeded limit${stopSuffix}`, 1);
    if (result.code !== 0) throw new CliError(result.code === null ? `worker terminated by signal ${result.signal ?? "unknown"}` : `worker exited with code ${result.code}`, result.code ?? 1);
    const bytes = readFileSync(output);
    let finalOutput;
    try { finalOutput = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CliError("final output is not valid UTF-8", 1); } // no-excuse-ok: catch
    if (finalOutput.trim().length === 0) throw new CliError("final output is empty", 1);
    process.stdout.write(finalOutput);
  } finally {
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
