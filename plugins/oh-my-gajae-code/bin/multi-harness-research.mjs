#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  realpathSync as staticRealpath,
  readSync,
  constants,
} from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

const TASK_LIMIT = 256 * 1024;
const MARKDOWN_LIMIT = 1024 * 1024;
const STREAM_LIMIT = 8 * 1024 * 1024;
const COMPARISON_LIMIT = 12 * 1024;
const CONTROL_LIMIT = 32 * 1024;
const LANES = Object.freeze([
  Object.freeze({ id: "gjc-opus", binary: "gjc", selector: "anthropic/claude-opus-4-8", thinking: "max", credential: "gjc" }),
  Object.freeze({ id: "gjc-sol", binary: "gjc", selector: "openai-codex/gpt-5.6-sol", thinking: "xhigh", credential: "gjc" }),
  Object.freeze({ id: "codex-sol", binary: "codex", selector: "gpt-5.6-sol", thinking: "xhigh", credential: "codex" }),
  Object.freeze({ id: "claude-ultracode", binary: "claude", selector: "ultracode", thinking: "ultracode", credential: "claude" }),
]);
const LANE_ERRORS = new Set(["preflight", "spawn", "timeout", "nonzero_exit", "invalid_output", "contract_breach"]);
const FINALIZER_ERRORS = new Set(["leader_input_invalid", "authorization_failed", "base_changed", "publication_failed"]);
const FORBIDDEN_CONCLUSION = /\b(?:winners?|majorit(?:y|ies)|vot(?:e|ed|es|ing)|consensus(?:es)?|rank(?:s|ed|ing)?|recommend(?:s|ed|ing|ation|ations)?|final\s+verdict)\b/i;
const SUFFIX = "\n\n---\n\nYou are one of four independent read-only research harnesses. Inspect only the supplied target. Do not create, edit, delete, rename, chmod, commit, install, log in, configure, or use shell/Bash tools. Return Markdown only, no more than 1 MiB, with exactly these substantive sections: `## Conclusion`, `## Evidence`, and `## Uncertainties`. Evidence must include repository paths with line numbers or external URLs. Do not claim a winner, vote, ranking, recommendation, consensus, or final verdict.\n";
const SECRET_PATTERNS = Object.freeze([
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{8,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{12}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?/g,
  /\b[A-Za-z0-9+/_-]{64,}={0,2}\b/g,
  /(?:authorization\s*[:=]\s*bearer\s+)\S+/gi,
  /(?:api[_-]?key|access[_-]?key|client[_-]?secret|token|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi,
]);

class RunnerError extends Error {
  constructor(message, code = 1, finalizerClass) {
    super(message);
    this.code = code;
    this.finalizerClass = finalizerClass;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function ownUid() {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function within(child, parent) {
  return child === parent || child.startsWith(`${parent}${sep}`);
}
function overlaps(left, right) {
  return within(left, right) || within(right, left);
}

function safeMessage(value) {
  return String(value).replace(/[\r\n\u0000]+/g, " ").slice(0, 160) || "unspecified";
}

function fail(message) {
  throw new RunnerError(message);
}

function parseInteger(name, raw, minimum, maximum, defaultValue) {
  const value = raw ?? defaultValue;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) fail(`invalid ${name}`);
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) fail(`invalid ${name}`);
  return number;
}

function parseRunArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--target", "--cwd", "--binding"]).has(key) || value === undefined || value.startsWith("--") || values.has(key)) fail("invalid run arguments");
    values.set(key, value);
  }
  const target = values.get("--target") ?? values.get("--cwd");
  const binding = values.get("--binding");
  if (values.has("--target") === values.has("--cwd") || !target || !binding || !isAbsolute(target) || !isAbsolute(binding)) fail("run paths must be absolute");
  return { target, binding };
}

function parseFinalizeArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--run-dir", "--cwd", "--binding"]).has(key) || value === undefined || value.startsWith("--") || values.has(key)) throw new RunnerError("invalid finalizer arguments", 20, "authorization_failed");
    values.set(key, value);
  }
  const runDir = values.get("--run-dir");
  const cwd = values.get("--cwd");
  const binding = values.get("--binding");
  if (!binding || !isAbsolute(binding) || (runDir !== undefined && !isAbsolute(runDir)) || (cwd !== undefined && !isAbsolute(cwd))) throw new RunnerError("finalizer paths must be absolute", 20, "authorization_failed");
  return { runDir, cwd, binding };
}

function trustedPath(path, type, modeMaximum = 0o022, allowRootOwner = false) {
  const lexical = resolve(path);
  if (!isAbsolute(path) || lexical !== path) return undefined;
  let entry;
  let canonical;
  let stats;
  try {
    entry = lstatSync(path);
    canonical = staticRealpath(path);
    stats = statSync(canonical);
  } catch {
    return undefined;
  }
  const uid = ownUid();
  if (entry.isSymbolicLink() || canonical !== lexical || (type === "file" ? !stats.isFile() : !stats.isDirectory()) || (stats.mode & modeMaximum) !== 0 || (uid !== undefined && stats.uid !== uid && !(allowRootOwner && stats.uid === 0))) return undefined;
  let current = type === "file" ? dirname(canonical) : canonical;
  for (;;) {
    let part;
    try { part = lstatSync(current); } catch { return undefined; }
    if (part.isSymbolicLink() || !part.isDirectory() || (uid !== undefined && part.uid !== uid && part.uid !== 0)) return undefined;
    // /tmp may be a sticky ancestor of an otherwise private fixture/root. It is not an
    // artifact/control destination itself and cannot replace a child owned 0700 directory.
    if ((part.mode & 0o022) !== 0 && !(current === "/tmp" && (part.mode & 0o1000) !== 0)) return undefined;
    if (current === dirname(current)) break;
    current = dirname(current);
  }
  return { path: canonical, stats };
}



function trustedFile(path, maximumBytes = Infinity, allowRootOwner = false) {
  const trusted = trustedPath(path, "file", 0o022, allowRootOwner);
  if (!trusted || trusted.stats.nlink !== 1 || trusted.stats.size > maximumBytes) return undefined;
  return trusted;
}

function verifyDigest(path, digest) {
  return /^[a-f0-9]{64}$/i.test(digest) && sha256(readFileSync(path)) === digest.toLowerCase();
}

function readBinding(input) {
  const binding = trustedFile(input, 16 * 1024);
  if (!binding || (binding.stats.mode & 0o077) !== 0) fail("trusted runtime binding not found");
  const lines = readFileSync(binding.path, "utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== 19 || lines[0] !== "multi-harness-research-binding-v1" || lines[15] !== "multi-harness-credential-schema-v1") fail("trusted runtime binding not found");
  const [version, accountHome, runnerDigest, runnerPath, nodeDigest, nodePath, gjcDigest, gjcPath, codexDigest, codexPath, codexRuntime, claudeDigest, claudePath, bwrapDigest, bwrapPath, credentialSchema, gjcAuth, codexAuth, claudeAuth] = lines;
  const runner = trustedFile(runnerPath);
  const node = trustedFile(nodePath, Infinity, true);
  const gjc = trustedFile(gjcPath, Infinity, true);
  const codex = trustedFile(codexPath, Infinity, true);
  const claude = trustedFile(claudePath, Infinity, true);
  const bwrap = trustedFile(bwrapPath, Infinity, true);
  const home = trustedPath(accountHome, "directory");
  const codexRoot = trustedPath(codexRuntime, "directory", 0o022, true);
  const actualRunner = trustedFile(staticRealpath(process.argv[1]));
  if (!runner || !actualRunner || !node || !gjc || !codex || !claude || !bwrap || !home || !codexRoot ||
      !verifyDigest(runner.path, runnerDigest) || !verifyDigest(actualRunner.path, runnerDigest) || !verifyDigest(node.path, nodeDigest) ||
      !verifyDigest(gjc.path, gjcDigest) || !verifyDigest(codex.path, codexDigest) ||
      !verifyDigest(claude.path, claudeDigest) || !verifyDigest(bwrap.path, bwrapDigest) ||
      !authorizedRunner(actualRunner.path, runner.path, home.path)) fail("trusted runtime binding mismatch");
  const credentials = {
    gjc: credentialLeaf(gjcAuth, "gjc"),
    codex: credentialLeaf(codexAuth, "codex"),
    claude: credentialLeaf(claudeAuth, "claude"),
  };
  const configuredXdg = process.env.XDG_DATA_HOME ?? join(home.path, ".local", "share");
  const configuredCodexHome = process.env.CODEX_HOME ?? join(home.path, ".codex");
  const xdg = canonicalCredentialParent(configuredXdg);
  const codexHome = canonicalCredentialParent(configuredCodexHome);
  if (credentials.gjc.path !== join(xdg, "gjc", "auth.json") ||
      credentials.codex.path !== join(codexHome, "auth.json") ||
      credentials.claude.path !== join(home.path, ".claude", ".credentials.json")) fail("unsupported credential layout");
  return Object.freeze({ version, credentialSchema, home: home.path, runner: runner.path, actualRunner: actualRunner.path, node: node.path, gjc: gjc.path, codex: codex.path, codexRuntime: codexRoot.path, claude: claude.path, bwrap: bwrap.path, credentials });
}
function canonicalCredentialParent(path) {
  if (!isAbsolute(path) || resolve(path) !== path) fail("unsupported credential layout");
  const trusted = trustedPath(path, "directory");
  if (!trusted || trusted.path !== path) fail("unsupported credential layout");
  return trusted.path;
}

function authorizedRunner(actual, bound, home) {
  if (actual === bound) return true;
  const launchRoot = join(home, ".cache", "oh-my-gajae-code", "multi-harness-research");
  const launchDirectory = dirname(actual);
  if (dirname(launchDirectory) !== launchRoot || basename(launchDirectory).match(/^launch-[A-Za-z0-9._-]+$/) === null || basename(actual) !== "runner.mjs") return false;
  const trustedLaunchRoot = trustedPath(launchRoot, "directory");
  const trustedLaunchDirectory = trustedPath(launchDirectory, "directory");
  const uid = ownUid();
  return Boolean(trustedLaunchRoot && trustedLaunchDirectory && trustedLaunchRoot.path === launchRoot && trustedLaunchDirectory.path === launchDirectory &&
    (trustedLaunchRoot.stats.mode & 0o077) === 0 && (trustedLaunchDirectory.stats.mode & 0o077) === 0 &&
    (uid === undefined || (trustedLaunchRoot.stats.uid === uid && trustedLaunchDirectory.stats.uid === uid)));
}

function credentialLeaf(path, lane) {
  const leaf = trustedFile(path, 1024 * 1024);
  if (!leaf || (leaf.stats.mode & 0o077) !== 0) fail(`unsupported credential layout for ${lane}`);
  const fd = openSync(leaf.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const held = fstatSync(fd);
    if (held.dev !== leaf.stats.dev || held.ino !== leaf.stats.ino || held.nlink !== 1 || held.uid !== leaf.stats.uid || held.size !== leaf.stats.size || (held.mode & 0o077) !== 0) fail(`unsupported credential layout for ${lane}`);
    bytes = Buffer.alloc(held.size);
    if (readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) fail(`unsupported credential layout for ${lane}`);
  } finally {
    closeSync(fd);
  }
  return Object.freeze({ path: leaf.path, uid: leaf.stats.uid, digest: sha256(bytes), bytes, secrets: credentialSecrets(bytes) });
}

function credentialSecrets(bytes) {
  const values = new Set();
  const text = bytes.toString("utf8");
  try {
    const collect = (value) => {
      if (typeof value === "string" && value.length > 0) values.add(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(JSON.parse(text));
  } catch {
    const raw = text.trim();
    if (raw.length > 0) values.add(raw);
  }
  const token = /"((?:\\.|[^"\\])*)"/g;
  for (let match; (match = token.exec(text)) !== null;) {
    if (!/^\s*:/.test(text.slice(token.lastIndex)) && match[1].length > 0) values.add(match[1]);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

function normalizeTask() {
  const bytes = readFileSync(0);
  if (bytes.length === 0 || bytes.length > TASK_LIMIT || bytes.includes(0)) fail("invalid task input");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("invalid task input"); }
  text = text.replace(/\r\n?/g, "\n");
  if (text.trim().length === 0) fail("invalid task input");
  if (!text.endsWith("\n")) text += "\n";
  const normalized = Buffer.from(text, "utf8");
  if (normalized.length > TASK_LIMIT) fail("invalid task input");
  const content = Buffer.from(text.trim(), "utf8");
  return Object.freeze({ text, bytes: normalized, digest: sha256(normalized), content, contentDigest: sha256(content), payload: Buffer.concat([normalized, Buffer.from(SUFFIX, "utf8")]) });
}

function configuredXdgData(binding) {
  const configured = process.env.XDG_DATA_HOME ?? join(binding.home, ".local", "share");
  if (!isAbsolute(configured) || resolve(configured) !== configured || configured.includes("\0")) fail("unsafe XDG data root");
  return configured;
}

function artifactSuiteRoot(binding) {
  return join(configuredXdgData(binding), "oh-my-gajae-code", "multi-harness");
}

function legacyArtifactSuiteRoot(binding) {
  return join(configuredXdgData(binding), "oh-my-gjc", "multi-harness");
}

function validateTarget(input, binding) {
  const target = trustedPath(input, "directory");
  if (!target) fail("target must be a private canonical directory");
  if (target.path === binding.home || within(binding.home, target.path)) fail("target contains protected state");
  const protectedPaths = [
    dirname(binding.runner),
    dirname(binding.actualRunner),
    dirname(binding.credentials.gjc.path),
    dirname(binding.credentials.codex.path),
    dirname(binding.credentials.claude.path),
    artifactSuiteRoot(binding),
    legacyArtifactSuiteRoot(binding),
  ];
  if (protectedPaths.some((path) => overlaps(target.path, path))) fail("target overlaps protected state");
  return target.path;
}

function xdgRoot(binding) {
  const configured = configuredXdgData(binding);
  const parent = dirname(configured);
  const trustedParent = trustedPath(parent, "directory");
  if (!trustedParent) fail("unsafe XDG data root");
  if (!existsSync(configured)) mkdirSync(configured, { mode: 0o700 });
  const root = trustedPath(configured, "directory");
  if (!root || !within(root.path, trustedParent.path)) fail("unsafe XDG data root");
  chmodSync(root.path, 0o700);
  return root.path;
}

function mkdirPrivate(path) {
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; throw new RunnerError("artifact collision"); }
  const trusted = trustedPath(path, "directory");
  if (!trusted || (trusted.stats.mode & 0o077) !== 0) fail("unsafe artifact directory");
  chmodSync(path, 0o700);
  return trusted.path;
}

function makeRunDirectory(target, binding) {
  const root = xdgRoot(binding);
  const repoName = basename(target).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64) || "repository";
  const repoId = `${repoName}-${sha256(target).slice(0, 16)}`;
  const base = join(root, "oh-my-gajae-code");
  if (!existsSync(base)) mkdirSync(base, { mode: 0o700 });
  const suite = join(base, "multi-harness");
  if (!existsSync(suite)) mkdirSync(suite, { mode: 0o700 });
  const repo = join(suite, repoId);
  if (!existsSync(repo)) mkdirSync(repo, { mode: 0o700 });
  for (const path of [base, suite, repo]) {
    const trusted = trustedPath(path, "directory");
    if (!trusted || (trusted.stats.mode & 0o077) !== 0) fail("unsafe artifact directory");
    chmodSync(path, 0o700);
  }
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const runId = `${timestamp}-${randomBytes(16).toString("hex")}`;
    try { return Object.freeze({ root: mkdirPrivate(join(repo, runId)), repoId, runId }); } catch (error) { if (!(error instanceof RunnerError) || error.message !== "artifact collision" || attempt === 7) throw error; }
  }
  fail("artifact collision");
}

function atomicCreate(path, bytes, mode = 0o600) {
  const directory = dirname(path);
  const parent = trustedPath(directory, "directory");
  if (!parent || (parent.stats.mode & 0o077) !== 0 || existsSync(path)) throw new RunnerError("atomic publication failed");
  const temporary = join(directory, `.${basename(path)}.${randomBytes(12).toString("hex")}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, "wx", mode);
    writeSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    chmodSync(path, mode);
    const published = trustedFile(path);
    if (!published || (published.stats.mode & 0o777) !== mode) throw new RunnerError("atomic publication failed");
    const directoryFd = openSync(directory, "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd); } catch { /* closed below */ }
    try { unlinkSync(temporary); } catch { /* publication did not create a residue */ }
    if (error instanceof RunnerError) throw error;
    throw new RunnerError("atomic publication failed");
  }
}

function atomicReplace(path, bytes, mode = 0o600) {
  const directory = dirname(path);
  const parent = trustedPath(directory, "directory");
  if (!parent || (parent.stats.mode & 0o077) !== 0) throw new RunnerError("atomic publication failed");
  const temporary = join(directory, `.${basename(path)}.${randomBytes(12).toString("hex")}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, "wx", mode);
    writeSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    chmodSync(path, mode);
    const published = trustedFile(path);
    if (!published || (published.stats.mode & 0o777) !== mode) throw new RunnerError("atomic publication failed");
    const directoryFd = openSync(directory, "r");
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd); } catch { /* closed below */ }
    try { unlinkSync(temporary); } catch { /* replace did not create a residue */ }
    if (error instanceof RunnerError) throw error;
    throw new RunnerError("atomic publication failed");
  }
}

function containsSecret(text, secrets) {
  for (const secret of secrets) if (secret.length > 0 && text.includes(secret)) return true;
  return SECRET_PATTERNS.some((pattern) => { pattern.lastIndex = 0; return pattern.test(text); });
}
function normalizedCrLfBytes(text) {
  return Buffer.from(text.replace(/\r\n?/g, "\n"), "utf8");
}

function containsDigestWindow(bytes, digest, length) {
  if (!Number.isSafeInteger(length) || length < 1 || length > bytes.length || !/^[a-f0-9]{64}$/i.test(digest)) return false;
  const expected = digest.toLowerCase();
  for (let offset = 0; offset <= bytes.length - length; offset += 1) {
    if (sha256(bytes.subarray(offset, offset + length)) === expected) return true;
  }
  return false;
}

function validMarkdown(bytes, secrets) {
  if (bytes.length === 0 || bytes.length > MARKDOWN_LIMIT) return undefined;
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return undefined; }
  if (containsSecret(text, secrets)) return "secret";
  if (FORBIDDEN_CONCLUSION.test(text)) return "contract";
  const sections = ["Conclusion", "Evidence", "Uncertainties"];
  const headings = [...text.matchAll(/^[ \t]{0,3}(#{1,6})[ \t]+([^\r\n]+?)[ \t]*\r?$/gm)].map((match) => ({ level: match[1].length, name: match[2] }));
  if (headings.length !== sections.length || headings.some((heading, index) => heading.level !== 2 || heading.name !== sections[index]) || /^[ ]{0,3}.+\r?\n[ ]{0,3}(?:=+|-+)[ \t]*$/m.test(text) || /^[ \t]*<\/?h[1-6]\b/im.test(text)) return undefined;
  const evidence = /^## Evidence[ \t]*\r?\n([\s\S]*?)(?=^## [^\r\n]+[ \t]*\r?$|(?![\s\S]))/m.exec(text)?.[1] ?? "";
  if (!/(?:https?:\/\/[^\s)]+|(?:^|\s)(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+:\d+\b)/m.test(evidence)) return undefined;
  return text;
}

function privateReadOnlyFile(path, bytes) {
  atomicCreate(path, bytes, 0o400);
  const file = trustedFile(path, bytes.length);
  if (!file || (file.stats.mode & 0o777) !== 0o400) fail("private lane state invalid");
  return file.path;
}

function privateLaneState(runRoot, lane, credential) {
  const root = mkdirPrivate(join(runRoot, `.lane-${lane.id}-${randomBytes(8).toString("hex")}`));
  const home = mkdirPrivate(join(root, "home"));
  const xdg = mkdirPrivate(join(root, "xdg-data"));
  const tmp = mkdirPrivate(join(root, "tmp"));
  const codexHome = mkdirPrivate(join(root, "codex-home"));
  const emptyDirectory = mkdirPrivate(join(root, "empty-directory"));
  const emptyFile = privateReadOnlyFile(join(root, "empty-file"), Buffer.alloc(0));
  if (sha256(credential.bytes) !== credential.digest) fail("credential snapshot invalid");
  const credentialSnapshot = privateReadOnlyFile(join(root, "credential-snapshot"), credential.bytes);
  if (sha256(readFileSync(credentialSnapshot)) !== credential.digest) fail("credential snapshot invalid");
  mkdirSync(join(home, ".local", "share", "gjc"), { recursive: true, mode: 0o700 });
  mkdirSync(join(home, ".claude"), { recursive: true, mode: 0o700 });
  return Object.freeze({ root, home, xdg, tmp, codexHome, emptyDirectory, emptyFile, credentialSnapshot });
}

function mountParents(path) {
  const paths = [];
  let current = dirname(path);
  while (current !== "/") { paths.push(current); current = dirname(current); }
  return paths.reverse();
}

function targetMasks(target, state) {
  return [".git", ".gjc"].map((name) => {
    const destination = join(target, name);
    try {
      const entry = lstatSync(destination);
      if (entry.isDirectory()) return Object.freeze({ destination, source: state.emptyDirectory, absent: false });
      if (entry.isFile()) return Object.freeze({ destination, source: state.emptyFile, absent: false });
      fail(`unsafe target ${name} entry`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return Object.freeze({ destination, source: state.emptyDirectory, absent: true });
    }
  });
}

function bwrapBase(binding, target, state, executable, credential, includeCodexRuntime) {
  const systemRoots = ["/usr", "/bin", "/lib", "/lib64", "/etc/ssl", "/etc/hosts", "/etc/resolv.conf"].filter(existsSync);
  const systemDirectories = systemRoots.filter((path) => statSync(path).isDirectory());
  const runtimeFiles = [...new Set([executable, binding.node])].filter((path) => !systemDirectories.some((root) => within(path, root)));
  const runtimeRoots = includeCodexRuntime && !systemDirectories.some((root) => within(binding.codexRuntime, root)) ? [binding.codexRuntime] : [];
  const prohibitedRoots = [
    target,
    artifactSuiteRoot(binding),
    dirname(binding.credentials.gjc.path),
    dirname(binding.credentials.codex.path),
    dirname(binding.credentials.claude.path),
  ];
  for (const root of runtimeRoots) {
    if (root === "/" || root === binding.home || prohibitedRoots.some((path) => overlaps(root, path))) fail("unsafe runtime root");
  }

  let destination;
  if (credential.path === binding.credentials.gjc.path) destination = join(state.xdg, "gjc", "auth.json");
  else if (credential.path === binding.credentials.codex.path) destination = join(state.codexHome, "auth.json");
  else destination = join(state.home, ".claude", ".credentials.json");
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  writeFileSync(destination, "", { mode: 0o600 });

  // bwrap begins with an empty mount namespace. Directory destinations are created explicitly;
  // file destinations get only their parents so file-over-directory binds cannot occur.
  const directories = new Set();
  const addDirectory = (path) => {
    for (const parent of [...mountParents(path), path]) {
      if (!["/", "/proc", "/dev", "/run"].includes(parent)) directories.add(parent);
    }
  };
  for (const root of systemRoots) addDirectory(statSync(root).isDirectory() ? root : dirname(root));
  for (const root of runtimeRoots) addDirectory(root);
  for (const file of runtimeFiles) addDirectory(dirname(file));
  for (const path of [target, state.home, state.xdg, state.tmp, state.codexHome, dirname(destination)]) addDirectory(path);

  const args = ["--die-with-parent", "--new-session", "--unshare-all", "--share-net", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/run"];
  for (const directory of [...directories].sort((left, right) => left.length - right.length || left.localeCompare(right))) args.push("--dir", directory);
  for (const root of systemRoots) args.push("--ro-bind", root, root);
  for (const root of runtimeRoots) args.push("--ro-bind", root, root);
  for (const file of runtimeFiles) args.push("--ro-bind", file, file);
  args.push("--ro-bind", target, target, "--bind", state.home, state.home, "--bind", state.xdg, state.xdg, "--bind", state.tmp, state.tmp, "--bind", state.codexHome, state.codexHome);
  for (const mask of targetMasks(target, state)) {
    if (!mask.absent) args.push("--ro-bind", mask.source, mask.destination);
  }
  args.push("--ro-bind", state.credentialSnapshot, destination);
  return Object.freeze({ args });
}

function laneSpec(lane, binding, target, state) {
  const executable = binding[lane.binary];
  const base = bwrapBase(binding, target, state, executable, binding.credentials[lane.credential], lane.binary === "codex");
  const env = {
    HOME: state.home,
    XDG_DATA_HOME: state.xdg,
    XDG_CONFIG_HOME: join(state.root, "xdg-config"),
    XDG_CACHE_HOME: join(state.root, "xdg-cache"),
    TMPDIR: state.tmp,
    PATH: "/usr/local/bin:/usr/bin:/bin",
    LANG: process.env.LANG ?? "C.UTF-8",
  };
  let args;
  if (lane.binary === "gjc") {
    args = ["-p", "--no-session", "--no-extensions", "--no-skills", "--no-rules", "--model", lane.selector, "--thinking", lane.thinking, "--tools", "read,search,find,web_search"];
    env.GJC_NOTIFICATIONS = "0";
    env.GJC_SDK_DISABLE = "1";
  } else if (lane.binary === "codex") {
    args = ["exec", "--ephemeral", "--color", "never", "--ignore-user-config", "--ignore-rules", "--strict-config", "-C", target,
      "-c", 'approval_policy="never"', "-c", 'web_search="live"', "-c", 'cli_auth_credentials_store="file"', "-c", 'default_permissions="multi_harness_research"',
      "-c", 'permissions.multi_harness_research.extends=":read-only"', "-c", 'permissions.multi_harness_research.network.enabled=false',
      "-c", 'shell_network.enabled=false', "-c", 'shell_environment_policy.inherit="none"', "-c", "mcp_servers={}", "-c", "apps={}", "-c", "hooks={}",
      "-c", 'model_reasoning_effort="xhigh"', "--disable", "apps", "--disable", "enable_mcp_apps", "--disable", "hooks", "--disable", "browser_use", "--disable", "browser_use_external", "--disable", "browser_use_full_cdp_access", "--disable", "computer_use", "--disable", "in_app_browser", "--disable", "remote_plugin", "--disable", "skill_mcp_dependency_install", "--disable", "plugins", "--model", "gpt-5.6-sol", "-"];
    env.CODEX_HOME = state.codexHome;
  } else {
    args = ["-p", "--no-session-persistence", "--effort", "ultracode", "--allowedTools", "Read,Grep,Glob,WebSearch,WebFetch"];
  }
  return Object.freeze({ command: binding.bwrap, args: [...base.args, "--chdir", target, "--", executable, ...args], env });
}

function runProcess(spec, input, timeoutMs) {
  return new Promise((resolveResult) => {
    let child;
    try { child = spawn(spec.command, spec.args, { detached: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: spec.env }); } catch { resolveResult({ error: "spawn" }); return; }
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stderrProbe = [];
    const output = [];
    let overflow = false;
    let timedOut = false;
    let interrupted = false;
    let spawned = false;
    let settled = false;
    const stop = () => { if (child.pid !== undefined) try { process.kill(-child.pid, "SIGKILL"); } catch { /* process already terminated */ } };
    const interrupt = () => { interrupted = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
      try { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); } catch { /* handles may already be closed */ }
      resolveResult(result);
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    child.once("spawn", () => { spawned = true; });
    child.once("error", () => finish({ error: "spawn" }));
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MARKDOWN_LIMIT + 1) output.push(chunk);
      if (stdoutBytes > STREAM_LIMIT) { overflow = true; stop(); }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      const captured = Buffer.concat(stderrProbe);
      if (captured.length < 8192) stderrProbe.push(chunk.subarray(0, 8192 - captured.length));
      if (stderrBytes > STREAM_LIMIT) { overflow = true; stop(); }
    });
    child.once("close", (code, signal) => finish({ spawned, code, signal, stdoutBytes, stderrBytes, stderrProbe: Buffer.concat(stderrProbe).toString("utf8"), output: Buffer.concat(output), timeout: timedOut, interrupted, overflow }));
    child.stdin.once("error", () => { overflow = true; stop(); });
    child.stdin.end(input);
  });
}

async function executeLane(lane, context) {
  const started = Date.now();
  let state;
  try {
    state = privateLaneState(context.run.root, lane, context.binding.credentials[lane.credential]);
    const spec = laneSpec(lane, context.binding, context.target, state);
    const result = await runProcess(spec, context.task.payload, context.timeoutMinutes * 60_000);
    const durationMs = Math.max(0, Date.now() - started);
    if (result.error === "spawn" || !result.spawned) return failedLane(lane, durationMs, "spawn", null);
    if (result.timeout || result.interrupted) return failedLane(lane, durationMs, "timeout", result.code);
    if (result.stdoutBytes > STREAM_LIMIT || result.stderrBytes > STREAM_LIMIT) return failedLane(lane, durationMs, "contract_breach", result.code);
    if (result.stdoutBytes > MARKDOWN_LIMIT) return failedLane(lane, durationMs, "invalid_output", result.code);
    if (result.overflow) return failedLane(lane, durationMs, "contract_breach", result.code);
    if (result.code !== 0) return failedLane(lane, durationMs, /(?:\b401\b|unauthori[sz]ed|unsupported (?:model|selector|credential)|not logged)/i.test(result.stderrProbe) ? "preflight" : "nonzero_exit", result.code);
    const allSecrets = Object.values(context.binding.credentials).flatMap((credential) => credential.secrets);
    const markdown = validMarkdown(result.output, allSecrets);
    if (markdown === "secret" || markdown === "contract") return failedLane(lane, durationMs, "contract_breach", result.code);
    if (typeof markdown === "string" && markdown.replace(/\r\n?/g, "\n").includes(context.task.text.trim())) return failedLane(lane, durationMs, "contract_breach", result.code);
    if (markdown === undefined) return failedLane(lane, durationMs, "invalid_output", result.code);
    const documentPath = join(context.docs, `${String(LANES.indexOf(lane) + 1).padStart(2, "0")}-${lane.id}.md`);
    atomicCreate(documentPath, Buffer.from(markdown, "utf8"));
    return Object.freeze({ id: lane.id, selector: lane.selector, status: "SUCCESS", error_class: null, exit_code: result.code, duration_ms: durationMs, artifact_path: documentPath, artifact_sha256: sha256(Buffer.from(markdown, "utf8")) });
  } catch {
    return failedLane(lane, Math.max(0, Date.now() - started), "preflight", null);
  } finally {
    if (state) try { rmSync(state.root, { recursive: true, force: true }); } catch { /* private lane residue is never promoted */ }
  }
}

function failedLane(lane, durationMs, errorClass, exitCode) {
  const closed = LANE_ERRORS.has(errorClass) ? errorClass : "preflight";
  return Object.freeze({ id: lane.id, selector: lane.selector, status: "FAILED", error_class: closed, exit_code: Number.isInteger(exitCode) ? exitCode : null, duration_ms: durationMs, artifact_path: null, artifact_sha256: null });
}
function materializeFailedLane(lane, index, docs) {
  if (lane.status !== "FAILED") return lane;
  const documentPath = join(docs, `${String(index + 1).padStart(2, "0")}-${lane.id}.md`);
  const body = Buffer.from([
    "# Multi-harness lane placeholder",
    "",
    `lane: ${lane.id}`,
    `selector: ${lane.selector}`,
    "status: FAILED",
    `error_class: ${lane.error_class}`,
    "No valid research document was produced.",
    "",
  ].join("\n"), "utf8");
  atomicCreate(documentPath, body);
  return Object.freeze({ ...lane, artifact_path: documentPath, artifact_sha256: sha256(body), placeholder: true });
}

async function lanePool(context) {
  const results = new Array(LANES.length);
  let cursor = 0;
  const workers = Array.from({ length: context.concurrency }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= LANES.length) return;
      results[index] = await executeLane(LANES[index], context);
    }
  });
  await Promise.all(workers);
  return results;
}

function baseSummary(facts) {
  const factsJson = canonicalJson(facts);
  const factsDigest = sha256(factsJson);
  const body = [
    "# Multi-harness factual research summary",
    "",
    `run_id: ${facts.run_id}`,
    `repo_id: ${facts.repo_id}`,
    `task_sha256: ${facts.task_sha256}`,
    `task_bytes: ${facts.task_bytes}`,
    `lane_status: ${facts.lane_status}`,
    `phase1_exit: ${facts.phase1_exit}`,
    "comparison_status: pending",
    `immutable_facts_sha256: ${factsDigest}`,
    "",
    "<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->",
    factsJson,
    "<!-- OMG_MULTI_HARNESS_FACTS_END -->",
    "",
    "## Lane ledger",
    "",
    ...facts.lanes.map((lane) => `- ${lane.id}: ${lane.status}${lane.error_class ? ` (${lane.error_class})` : ""}${lane.artifact_path ? ` — ${lane.artifact_path}` : " — no valid document"}`),
    "",
    "## Comparison",
    "",
    "<!-- OMG_MULTI_HARNESS_COMPARISON_PENDING -->",
    "",
  ].join("\n");
  return Object.freeze({ bytes: Buffer.from(body, "utf8"), factsDigest });
}

function parseSummary(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new RunnerError("base changed", 20, "base_changed"); }
  const factsMatch = /<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)\n<!-- OMG_MULTI_HARNESS_FACTS_END -->/.exec(text);
  if (!factsMatch) throw new RunnerError("base changed", 20, "base_changed");
  let facts;
  try { facts = JSON.parse(factsMatch[1]); } catch { throw new RunnerError("base changed", 20, "base_changed"); }
  if (canonicalJson(facts) !== factsMatch[1]) throw new RunnerError("base changed", 20, "base_changed");
  return Object.freeze({ text, facts, factsJson: factsMatch[1], factsDigest: sha256(factsMatch[1]) });
}

function readProtectedFile(path, maximum, finalizerClass = "authorization_failed") {
  const trusted = trustedFile(path, maximum);
  if (!trusted || (trusted.stats.mode & 0o077) !== 0) throw new RunnerError("protected file invalid", 20, finalizerClass);
  const fd = openSync(trusted.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const held = fstatSync(fd);
  if (held.dev !== trusted.stats.dev || held.ino !== trusted.stats.ino || held.nlink !== 1) { closeSync(fd); throw new RunnerError("protected file changed", 20, finalizerClass); }
  return Object.freeze({ fd, path: trusted.path, stats: held });
}

function readHeld(handle, maximum, finalizerClass) {
  const stats = fstatSync(handle.fd);
  if (stats.size < 0 || stats.size > maximum) throw new RunnerError("protected file invalid", 20, finalizerClass);
  const bytes = Buffer.alloc(stats.size);
  const received = readSync(handle.fd, bytes, 0, bytes.length, 0);
  if (received !== bytes.length) throw new RunnerError("protected file changed", 20, finalizerClass);
  return bytes;
}

function recheckHeldSummary(handle, expectedDigest, runDir) {
  const stats = fstatSync(handle.fd);
  if (stats.dev !== handle.stats.dev || stats.ino !== handle.stats.ino || stats.nlink !== 1 || (stats.mode & 0o077) !== 0) return false;
  const bytes = readHeld(handle, 2 * MARKDOWN_LIMIT, "base_changed");
  if (sha256(bytes) !== expectedDigest) return false;
  const current = trustedFile(join(runDir, "summary.md"));
  return Boolean(current && current.stats.dev === handle.stats.dev && current.stats.ino === handle.stats.ino);
}

function parseFinalizeEnvelope() {
  const bytes = readFileSync(0);
  if (bytes.length === 0 || bytes.length > CONTROL_LIMIT || bytes.includes(0)) throw new RunnerError("leader input invalid", 20, "leader_input_invalid");
  let envelope;
  try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new RunnerError("leader input invalid", 20, "leader_input_invalid"); }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || envelope.version !== "multi-harness-finalize-v1" || typeof envelope.comparison !== "string" || typeof envelope.receipt_path !== "string" || !isAbsolute(envelope.receipt_path)) throw new RunnerError("leader input invalid", 20, "leader_input_invalid");
  if (Buffer.byteLength(envelope.comparison, "utf8") === 0 || Buffer.byteLength(envelope.comparison, "utf8") > COMPARISON_LIMIT || envelope.comparison.includes("\0") || FORBIDDEN_CONCLUSION.test(envelope.comparison)) throw new RunnerError("leader input invalid", 20, "leader_input_invalid");
  return Object.freeze(envelope);
}
function validateComparisonSafety(comparison, facts, secrets) {
  if (!facts || !/^[a-f0-9]{64}$/i.test(facts.task_content_sha256 ?? "") || !Number.isSafeInteger(facts.task_content_bytes) || facts.task_content_bytes < 1 || facts.task_content_bytes > TASK_LIMIT) {
    throw new RunnerError("base changed", 20, "base_changed");
  }
  const normalized = normalizedCrLfBytes(comparison);
  if (containsSecret(comparison, secrets) || containsDigestWindow(normalized, facts.task_content_sha256, facts.task_content_bytes)) {
    throw new RunnerError("leader input invalid", 20, "leader_input_invalid");
  }
}

function readFinalizationReceipt(path) {
  if (basename(path) !== "finalization-receipt.json") throw new RunnerError("authorization invalid", 20, "authorization_failed");
  const handle = readProtectedFile(path, CONTROL_LIMIT);
  try {
    let receipt;
    try { receipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readHeld(handle, CONTROL_LIMIT, "authorization_failed"))); } catch { throw new RunnerError("receipt invalid", 20, "authorization_failed"); }
    if (!receipt || receipt.version !== "multi-harness-receipt-v1" || typeof receipt.run_id !== "string" || typeof receipt.repo_id !== "string" || !/^[a-f0-9]{64}$/i.test(receipt.nonce ?? "") || typeof receipt.run_dir !== "string" || !isAbsolute(receipt.run_dir) || join(receipt.run_dir, "finalization-receipt.json") !== handle.path) throw new RunnerError("receipt invalid", 20, "authorization_failed");
    return Object.freeze(receipt);
  } finally {
    closeSync(handle.fd);
  }
}
function expectedRunDirectory(binding, receipt) {
  const segment = /^[A-Za-z0-9._-]+$/;
  if (!segment.test(receipt.repo_id) || !segment.test(receipt.run_id)) throw new RunnerError("authorization invalid", 20, "authorization_failed");
  return join(artifactSuiteRoot(binding), receipt.repo_id, receipt.run_id);
}

function finalBytes(base, comparison) {
  if (!base.includes("comparison_status: pending") || !base.includes("<!-- OMG_MULTI_HARNESS_COMPARISON_PENDING -->")) throw new RunnerError("base changed", 20, "base_changed");
  return Buffer.from(base.replace("comparison_status: pending", "comparison_status: finalized").replace("<!-- OMG_MULTI_HARNESS_COMPARISON_PENDING -->", comparison.trimEnd()), "utf8");
}

function finalizerFailure(error, fallbackRunDir) {
  const finalizerClass = error instanceof RunnerError && FINALIZER_ERRORS.has(error.finalizerClass) ? error.finalizerClass : "publication_failed";
  const output = { finalization_status: "FINALIZATION_FAILED", finalization_class: finalizerClass, error_class: finalizerClass, summary_path: fallbackRunDir ? join(fallbackRunDir, "summary.md") : null };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 20;
}

async function run() {
  if (process.platform !== "linux") fail("Linux bubblewrap is required");
  const args = parseRunArgs(process.argv.slice(3));
  const binding = readBinding(args.binding);
  if ((trustedFile(binding.bwrap, Infinity, true)?.stats.mode & 0o111) === 0) fail("bubblewrap is not executable");
  const target = validateTarget(args.target, binding);
  const task = normalizeTask();
  const concurrency = parseInteger("OMG_MULTI_HARNESS_CONCURRENCY", process.env.OMG_MULTI_HARNESS_CONCURRENCY, 1, 4, "4");
  const timeoutMinutes = parseInteger("OMG_MULTI_HARNESS_TIMEOUT_MINUTES", process.env.OMG_MULTI_HARNESS_TIMEOUT_MINUTES, 1, 120, "30");
  const run = makeRunDirectory(target, binding);
  const docs = mkdirPrivate(join(run.root, "lanes"));
  const startedAt = new Date().toISOString();
  const laneResults = await lanePool({ binding, target, task, run, docs, concurrency, timeoutMinutes });
  const lanes = laneResults.map((lane, index) => materializeFailedLane(lane, index, docs));
  const successful = lanes.filter((lane) => lane.status === "SUCCESS");
  const laneStatus = successful.length === LANES.length ? "COMPLETE" : successful.length > 0 ? "INCOMPLETE" : "FATAL";
  const phase1Exit = laneStatus === "COMPLETE" ? 0 : laneStatus === "INCOMPLETE" ? 10 : 1;
  const facts = Object.freeze({ schema_version: "multi-harness-facts-v1", run_id: run.runId, repo_id: run.repoId, canonical_target_sha256: sha256(target), task_sha256: task.digest, task_bytes: task.bytes.length, task_content_sha256: task.contentDigest, task_content_bytes: task.content.length, started_at: startedAt, ended_at: new Date().toISOString(), lane_status: laneStatus, phase1_exit: phase1Exit, lanes });
  const base = baseSummary(facts);
  const summaryPath = join(run.root, "summary.md");
  atomicCreate(summaryPath, base.bytes);
  const summaryStats = statSync(summaryPath);
  const nonce = randomBytes(32).toString("hex");
  const control = Object.freeze({ version: "multi-harness-finalization-control-v1", nonce_sha256: sha256(nonce), summary_sha256: sha256(base.bytes), immutable_facts_sha256: base.factsDigest, repo_id: run.repoId, run_id: run.runId, summary_dev: summaryStats.dev, summary_ino: summaryStats.ino, consumed: false });
  atomicCreate(join(run.root, "finalization-control.json"), Buffer.from(`${canonicalJson(control)}\n`, "utf8"));
  const receipt = Object.freeze({ version: "multi-harness-receipt-v1", run_id: run.runId, repo_id: run.repoId, run_dir: run.root, nonce, summary_sha256: control.summary_sha256, immutable_facts_sha256: control.immutable_facts_sha256 });
  const receiptPath = join(run.root, "finalization-receipt.json");
  atomicCreate(receiptPath, Buffer.from(`${canonicalJson(receipt)}\n`, "utf8"));
  const publicReceipt = Object.freeze({ lane_status: laneStatus, phase: "BASE_SEALED", phase1_exit: phase1Exit, run_exit: phase1Exit, summary: summaryPath, summary_path: summaryPath, finalization_receipt_path: receiptPath, successful_documents: successful.map((lane) => lane.artifact_path), successful_lane_paths: successful.map((lane) => lane.artifact_path), lanes });
  process.stdout.write(`${JSON.stringify(publicReceipt)}\n`);
  process.exitCode = phase1Exit;
}

async function finalize() {
  let runDir;
  try {
    const args = parseFinalizeArgs(process.argv.slice(3));
    const binding = readBinding(args.binding);
    const envelope = parseFinalizeEnvelope();
    const receipt = readFinalizationReceipt(envelope.receipt_path);
    const runInput = args.runDir ?? receipt.run_dir;
    const expectedRunDir = expectedRunDirectory(binding, receipt);
    runDir = runInput === expectedRunDir ? trustedPath(runInput, "directory")?.path : undefined;
    if (!runDir || runDir !== receipt.run_dir || runDir !== expectedRunDir || (statSync(runDir).mode & 0o077) !== 0) throw new RunnerError("run directory invalid", 20, "authorization_failed");
    const controlHandle = readProtectedFile(join(runDir, "finalization-control.json"), CONTROL_LIMIT);
    const summaryHandle = readProtectedFile(join(runDir, "summary.md"), 2 * MARKDOWN_LIMIT, "base_changed");
    try {
      const controlBytes = readHeld(controlHandle, CONTROL_LIMIT, "authorization_failed");
      let control;
      try { control = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(controlBytes)); } catch { throw new RunnerError("control invalid", 20, "authorization_failed"); }
      const baseBytes = readHeld(summaryHandle, 2 * MARKDOWN_LIMIT, "base_changed");
      const parsed = parseSummary(baseBytes);
      if (!control || control.version !== "multi-harness-finalization-control-v1" || control.consumed === true || control.run_id !== receipt.run_id || control.repo_id !== receipt.repo_id || control.run_id !== parsed.facts.run_id || control.repo_id !== parsed.facts.repo_id) throw new RunnerError("authorization invalid", 20, "authorization_failed");
      validateComparisonSafety(envelope.comparison, parsed.facts, Object.values(binding.credentials).flatMap((credential) => credential.secrets));
      const nonceDigest = Buffer.from(sha256(receipt.nonce), "hex");
      const expectedNonce = Buffer.from(control.nonce_sha256 ?? "", "hex");
      if (nonceDigest.length !== expectedNonce.length || !timingSafeEqual(nonceDigest, expectedNonce)) throw new RunnerError("authorization invalid", 20, "authorization_failed");
      const currentSummaryDigest = sha256(baseBytes);
      if (typeof control.pending_final_sha256 === "string" && control.pending_final_sha256 === currentSummaryDigest && control.immutable_facts_sha256 === parsed.factsDigest && parsed.text.includes("comparison_status: finalized") && !parsed.text.includes("<!-- OMG_MULTI_HARNESS_COMPARISON_PENDING -->")) {
        if (!recheckHeldSummary(summaryHandle, currentSummaryDigest, runDir)) throw new RunnerError("base changed", 20, "base_changed");
        const recovered = { ...control, consumed: true };
        delete recovered.pending_final_sha256;
        atomicReplace(join(runDir, "finalization-control.json"), Buffer.from(`${canonicalJson(recovered)}\n`, "utf8"));
        process.stdout.write(`${JSON.stringify({ finalization_status: "FINALIZED", summary: join(runDir, "summary.md"), summary_path: join(runDir, "summary.md"), lane_status: parsed.facts.lane_status, phase1_exit: parsed.facts.phase1_exit, run_exit: parsed.facts.phase1_exit })}\n`);
        return;
      }
      if (control.summary_sha256 !== currentSummaryDigest || control.immutable_facts_sha256 !== parsed.factsDigest || control.summary_dev !== summaryHandle.stats.dev || control.summary_ino !== summaryHandle.stats.ino) throw new RunnerError("base changed", 20, "base_changed");
      const final = finalBytes(parsed.text, envelope.comparison);
      const finalDigest = sha256(final);
      if (!recheckHeldSummary(summaryHandle, control.summary_sha256, runDir)) throw new RunnerError("base changed", 20, "base_changed");
      const pending = { ...control, pending_final_sha256: finalDigest };
      atomicReplace(join(runDir, "finalization-control.json"), Buffer.from(`${canonicalJson(pending)}\n`, "utf8"));
      if (!recheckHeldSummary(summaryHandle, control.summary_sha256, runDir)) throw new RunnerError("base changed", 20, "base_changed");
      atomicReplace(join(runDir, "summary.md"), final);
      const finalized = { ...pending, consumed: true };
      delete finalized.pending_final_sha256;
      atomicReplace(join(runDir, "finalization-control.json"), Buffer.from(`${canonicalJson(finalized)}\n`, "utf8"));
      process.stdout.write(`${JSON.stringify({ finalization_status: "FINALIZED", summary: join(runDir, "summary.md"), summary_path: join(runDir, "summary.md"), lane_status: parsed.facts.lane_status, phase1_exit: parsed.facts.phase1_exit, run_exit: parsed.facts.phase1_exit, comparison: envelope.comparison.trim().slice(0, 2048) })}\n`);
    } finally {
      closeSync(summaryHandle.fd);
      closeSync(controlHandle.fd);
    }
  } catch (error) {
    finalizerFailure(error, runDir);
  }
}

function usage() {
  process.stderr.write("Usage: multi-harness-research.mjs run (--target|--cwd) ABS --binding ABS < task | multi-harness-research.mjs finalize-comparison [--run-dir ABS] [--cwd ABS] --binding ABS < envelope.json\n");
}

const mode = process.argv[2];
if (mode === "run") {
  run().catch((error) => { process.stderr.write(`multi-harness-research: ${safeMessage(error?.message ?? "unexpected failure")}\n`); process.exitCode = error instanceof RunnerError ? error.code : 1; });
} else if (mode === "finalize-comparison") {
  finalize();
} else {
  usage();
  process.exitCode = 1;
}
