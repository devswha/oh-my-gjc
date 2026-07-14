#!/usr/bin/env node

import { constants, accessSync, chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const TASK_LIMIT = 256 * 1024;
const OUTPUT_LIMIT = 1024 * 1024;
const TIMEOUT_LIMIT = 3600;
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
    if (!["--cwd", "--sandbox", "--model", "--timeout-seconds"].includes(name)) throw new CliError(`unknown argument: ${name ?? ""}`);
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
  return { help: false, cwd, sandbox, model, timeoutSeconds };
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
          addWorkspaceDeny(state, realpathSync(entryPath));
          continue;
        }
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }
        if (entry.isSymbolicLink()) {
          const canonical = realpathSync(entryPath);
          if (statSync(canonical).isDirectory() && within(canonical, cwd)) pending.push(canonical);
        }
      }
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("workspace .gjc protection could not be established", 78);
  } // no-excuse-ok: catch
  return [...state.denyPaths];
}

function trustedFile(path) {
  const stats = statSync(path);
  const uid = process.getuid?.();
  return stats.isFile() && (uid === undefined || stats.uid === uid || stats.uid === 0) && (stats.mode & 0o022) === 0;
}

function ownedContainedFile(path, root) {
  const entry = lstatSync(path);
  const canonical = realpathSync(path);
  const stats = statSync(canonical);
  const uid = process.getuid?.();
  return !entry.isSymbolicLink() && stats.isFile() && within(canonical, root) && (uid === undefined || stats.uid === uid || stats.uid === 0);
}

function resolveCodex(pathValue, cwd) {
  for (const directory of (pathValue ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = resolve(directory, "codex");
    try {
      accessSync(candidate, constants.X_OK);
      const canonical = realpathSync(candidate);
      if (trustedFile(canonical) && !within(canonical, cwd)) return canonical;
    } catch { /* try the next trusted PATH entry */ } // no-excuse-ok: catch
  }
  throw new CliError("trusted codex executable not found", 127);
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

function prepareRuntime(binary, privateRoot) {
  const packages = { "linux:x64": "codex-linux-x64", "linux:arm64": "codex-linux-arm64", "darwin:x64": "codex-darwin-x64", "darwin:arm64": "codex-darwin-arm64", "win32:x64": "codex-win32-x64", "win32:arm64": "codex-win32-arm64" };
  let core = binary;
  let codexPath = dirname(binary);
  let derivedVendor = false;
  const packageName = packages[`${process.platform}:${process.arch}`];
  if (packageName !== undefined) {
    const vendor = join(resolve(dirname(binary), ".."), "node_modules/@openai", packageName, "vendor");
    try {
      const target = readdirSync(vendor).find((name) => statSync(join(vendor, name)).isDirectory());
      if (target !== undefined) {
        const candidate = realpathSync(join(vendor, target, "bin", process.platform === "win32" ? "codex.exe" : "codex"));
        if (trustedFile(candidate)) {
          core = candidate;
          codexPath = realpathSync(join(vendor, target, "codex-path"));
          derivedVendor = true;
        }
      }
    } catch { /* test doubles and native entrypoints use the canonical binary itself */ } // no-excuse-ok: catch
  }
  if (basename(binary) === "codex.js" && !derivedVendor) throw new CliError("compatible Codex runtime not found", 127);
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
  const grants = [...config.protectedStatePaths.map((path) => [path, "deny"]), [env.HOME, "deny"], [runtime.core, "read"], [runtime.helperDir, "read"], [runtime.codexPath, "read"]].map(([path, mode]) => `${toml(path)}=${toml(mode)}`).join(",");
  const filesystem = `{":minimal"="read",":workspace_roots"=${workspaceRoots},":tmpdir"="write",${grants}}`;
  const args = ["exec", "--ephemeral", "--color", "never", "--ignore-user-config", "--ignore-rules", "--strict-config", "-C", config.cwd];
  for (const value of ['approval_policy="never"', 'web_search="disabled"', 'default_permissions="lazycodex_gjc"', `permissions.lazycodex_gjc.extends=${toml(baseProfile)}`, `permissions.lazycodex_gjc.filesystem=${filesystem}`, "permissions.lazycodex_gjc.network.enabled=false", 'shell_environment_policy.inherit="none"', `shell_environment_policy.set={HOME=${toml(env.HOME)},TMPDIR=${toml(env.TMPDIR)},PATH=${toml(runtime.safePath)}}`, "mcp_servers={}", "apps={}", "hooks={}"]) args.push("-c", value);
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

function runChild(binary, args, prompt, env, output, timeoutSeconds) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { detached: process.platform !== "win32", env, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let overflow = false;
    let timedOut = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const failOverflow = () => { if (!overflow) { overflow = true; killGroup(child); } };
    child.stdout.on("data", (chunk) => { stdoutBytes += chunk.length; if (stdoutBytes > OUTPUT_LIMIT) failOverflow(); });
    child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; if (stderrBytes > OUTPUT_LIMIT) failOverflow(); });
    child.once("error", () => reject(new CliError("worker failed to start", 127)));
    const outputMonitor = setInterval(() => { try { if (statSync(output).size > OUTPUT_LIMIT) failOverflow(); } catch { /* close handles missing output */ } }, 10); // no-excuse-ok: catch
    const timer = setTimeout(() => { timedOut = true; killGroup(child); }, timeoutSeconds * 1000);
    child.once("close", (code, signal) => {
      clearInterval(outputMonitor);
      clearTimeout(timer);
      resolveResult({ code, signal, timedOut, overflow });
    });
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(new CliError("worker input failed", 1)); });
    child.stdin.end(prompt);
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) { process.stdout.write(HELP); return; }
  const task = readTask();
  const codexHome = process.env.CODEX_HOME;
  const workspaceDenies = workspaceStateDenyPaths(config.cwd);
  const protectedPaths = [...new Set([...protectedStatePaths(config.cwd, process.env.HOME, codexHome), ...workspaceDenies])];
  const omo = resolveOmoSkill(codexHome);
  const binary = resolveCodex(process.env.PATH, config.cwd);
  const temp = mkdtempSync(join(tmpdir(), "lazycodex-gjc-"));
  chmodSync(temp, 0o700);
  const output = join(temp, "final.txt");
  writeFileSync(output, "", { mode: 0o600 });
  try {
    const runtime = prepareRuntime(binary, temp);
    const env = childEnvironment(runtime, codexHome, temp);
    const result = await runChild(runtime.core, childArgs({ ...config, protectedStatePaths: protectedPaths }, env, runtime, output), workerPrompt(task, omo, config.sandbox), env, output, config.timeoutSeconds);
    if (result.timedOut) throw new CliError("worker timed out", 124);
    if (result.overflow || statSync(output).size > OUTPUT_LIMIT) throw new CliError("worker output exceeded limit", 1);
    if (result.code !== 0) throw new CliError(result.code === null ? `worker terminated by signal ${result.signal ?? "unknown"}` : `worker exited with code ${result.code}`, result.code ?? 1);
    const bytes = readFileSync(output);
    let finalOutput;
    try { finalOutput = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CliError("final output is not valid UTF-8", 1); } // no-excuse-ok: catch
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
  process.stderr.write("lazycodex-gjc: unexpected failure\n");
  process.exitCode = 1;
});
