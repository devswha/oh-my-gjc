import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const installer = resolve(import.meta.dir, "../../..", "install.sh");
const cacheDirectory = "oh-my-gajae-code___oh-my-gajae-code___";
const sandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true });
});

type ForceOutcome = "success" | "unsupported" | "operational" | "near-miss";
type InstallOutput = "success" | "nerd" | "ascii" | "missing" | "duplicate" | "malformed" | "ansi" | "ansi-near-miss";
type InstallStderr = "none" | "stale-success";

interface RunInstallerOptions {
  addFails?: boolean;
  addDuplicate?: boolean;
  args?: string[];
  cacheSymlink?: boolean;
  forceOutcome?: ForceOutcome;
  installOutput?: InstallOutput;
  installStderr?: InstallStderr;
  installVersion?: string;
  nativeSymlink?: boolean;
  staleVersions?: string[];
  updateFails?: boolean;
}

function createNativeInstaller(root: string) {
  const native = join(root, "bin", "install-skill.sh");
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(
    native,
    `#!/bin/bash
printf 'native:%s %s\\n' "$0" "$*" >> "$GJC_TEST_LOG"
`,
  );
  chmodSync(native, 0o755);
}

function runInstaller(options: RunInstallerOptions = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), "omg-one-shot-"));
  sandboxes.push(sandbox);
  const home = join(sandbox, "home");
  const bin = join(sandbox, "bin");
  const log = join(sandbox, "gjc.log");
  const cache = join(home, ".gjc", "plugins", "cache", "plugins");
  const installVersion = options.installVersion ?? "1.2.3";
  const selectedRoot = join(cache, `${cacheDirectory}${installVersion}`);

  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  symlinkSync("/usr/bin/mktemp", join(bin, "mktemp"));
  symlinkSync("/usr/bin/rm", join(bin, "rm"));
  if (options.cacheSymlink) {
    const externalCache = join(sandbox, "external-cache");
    mkdirSync(join(home, ".gjc", "plugins", "cache"), { recursive: true });
    mkdirSync(externalCache, { recursive: true });
    symlinkSync(externalCache, cache);
  }
  writeFileSync(log, "");
  mkdirSync(join(selectedRoot, "bin"), { recursive: true });
  if (options.nativeSymlink) {
    symlinkSync(join(sandbox, "native-target"), join(selectedRoot, "bin", "install-skill.sh"));
  }
  for (const version of options.staleVersions ?? []) {
    createNativeInstaller(join(cache, `${cacheDirectory}${version}`));
  }

  const gjc = join(bin, "gjc");
  writeFileSync(
    gjc,
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "$GJC_TEST_LOG"

emit_success() {
  case "$INSTALL_OUTPUT" in
    success) printf '✔ Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\n' "$INSTALL_VERSION" ;;
    nerd) printf '󰄬 Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\n' "$INSTALL_VERSION" ;;
    ascii) printf '[ok] Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\n' "$INSTALL_VERSION" ;;
    missing) ;;
    duplicate)
      printf '✔ Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\n' "$INSTALL_VERSION"
      printf '✔ Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\n' "$INSTALL_VERSION"
      ;;
    malformed) printf '✔ Installed oh-my-gajae-code from oh-my-gajae-code (1.2)\\n' ;;
    ansi) printf '\\033[32m✔ Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\033[39m\\n' "$INSTALL_VERSION" ;;
    ansi-near-miss) printf '\\033[32m✔ Installed oh-my-gajae-code from oh-my-gajae-code (%s)\\033[39m extra\\n' "$INSTALL_VERSION" ;;
  esac
}
emit_stderr() {
  case "$INSTALL_STDERR_OUTPUT" in
    stale-success) printf '✔ Installed oh-my-gajae-code from oh-my-gajae-code (99.0.0)\\n' >&2 ;;
  esac
}


create_native() {
  root="$HOME/.gjc/plugins/cache/plugins/${cacheDirectory}${installVersion}/bin"
  printf '%s\\n' '#!/bin/bash' > "$root/install-skill.sh"
  printf '%s\\n' 'printf "native:%s %s\\n" "$0" "$*" >> "$GJC_TEST_LOG"' >> "$root/install-skill.sh"
  emit_success
  emit_stderr
}

case "$*" in
  plugin\\ marketplace\\ add\\ *)
    if [ "$ADD_DUPLICATE" = "1" ] && [ ! -e "$GJC_DUPLICATE_SEEN" ]; then
      : > "$GJC_DUPLICATE_SEEN"
      printf '%s\n' '✗ Failed to add marketplace: Marketplace "oh-my-gajae-code" already exists' >&2
      exit 1
    fi
    if [ "$ADD_FAILS" = "1" ]; then
      printf '%s\n' 'network unavailable' >&2
      exit 9
    fi
    ;;
  "plugin marketplace update oh-my-gajae-code")
    if [ "$UPDATE_FAILS" = "1" ]; then exit 9; fi
    ;;
  "plugin install oh-my-gajae-code@oh-my-gajae-code --force")
    case "$FORCE_OUTCOME" in
      success) create_native ;;
      unsupported)
        printf '%s\\n' "error: unknown option '--force'" >&2
        exit 64
        ;;
      operational)
        printf '%s\\n' "token=should-not-leak network unavailable" >&2
        exit 70
        ;;
      near-miss)
        printf '%s\\n' "error: unknown option '--forceful'" >&2
        exit 64
        ;;
    esac
    ;;
  "plugin install oh-my-gajae-code@oh-my-gajae-code")
    create_native
    ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(gjc, 0o755);

  const result = spawnSync("/bin/bash", [installer, ...(options.args ?? [])], {
    env: {
      ...process.env,
      ADD_FAILS: options.addFails ? "1" : "0",
      ADD_DUPLICATE: options.addDuplicate ? "1" : "0",
      FORCE_OUTCOME: options.forceOutcome ?? "success",
      GJC_TEST_LOG: log,
      GJC_DUPLICATE_SEEN: join(sandbox, "duplicate-seen"),
      HOME: home,
      INSTALL_OUTPUT: options.installOutput ?? "success",
      INSTALL_STDERR_OUTPUT: options.installStderr ?? "none",
      INSTALL_VERSION: installVersion,
      PATH: `${bin}:/usr/bin:/bin`,
      UPDATE_FAILS: options.updateFails ? "1" : "0",
    },
    encoding: "utf8",
  });
  const logText = readFileSync(log, "utf8").trim();
  return { calls: logText ? logText.split("\n") : [], result, selectedRoot };
}

function nativeCall(root: string) {
  return `native:${join(root, "bin", "install-skill.sh")} all`;
}

describe("one-shot installer", () => {
  test("completes a fresh canonical install and announces the bounded v0.28 legacy boundary", () => {
    const { calls, result, selectedRoot } = runInstaller();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (1.2.3)");
    expect(result.stdout).toContain("✓ oh-my-gajae-code installed — one plugin, 7 skills + 9 commands (/omg + 8 /omg:*), all native surfaces installed.");
    expect(result.stdout).toContain("v0.28.0 cutover");
    expect(result.stdout).toContain("/omg:* commands remain stable.");
    expect(result.stdout).toContain("https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh");
    expect(result.stdout).toContain("Old raw.githubusercontent.com/devswha/oh-my-gjc URLs no longer work.");
    expect(result.stdout).toContain("An old oh-my-gjc marketplace registration may remain until targeted CLI cleanup is proven.");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
      nativeCall(selectedRoot),
    ]);
  });

  test("does not require bun on PATH to resolve the installed cache identity", () => {
    const { calls, result, selectedRoot } = runInstaller();

    expect(result.status, result.stderr).toBe(0);
    expect(calls.at(-1)).toBe(nativeCall(selectedRoot));
  });

  test("refreshes an existing canonical marketplace registration before install", () => {
    const { calls, result, selectedRoot } = runInstaller({ addDuplicate: true });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("already exists; leaving its registration intact before update");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
      nativeCall(selectedRoot),
    ]);
  });

  test("fails closed on a non-duplicate marketplace add failure", () => {
    const { calls, result } = runInstaller({ addFails: true });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing to use an unverified existing source");
    expect(calls).toEqual(["plugin marketplace add devswha/oh-my-gajae-code"]);
  });

  test("fails closed when the mandatory marketplace refresh fails", () => {
    const { calls, result } = runInstaller({ updateFails: true });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing to install from a possibly-stale catalog");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
    ]);
  });

  test("uses the current install's success version instead of a higher stale cache", () => {
    const { calls, result, selectedRoot } = runInstaller({ staleVersions: ["99.0.0"] });

    expect(result.status, result.stderr).toBe(0);
    expect(calls.at(-1)).toBe(nativeCall(selectedRoot));
    expect(calls.at(-1)).not.toContain("99.0.0");
  });
  test("does not let stderr success-looking output select a stale cache", () => {
    const { calls, result, selectedRoot } = runInstaller({
      installStderr: "stale-success",
      staleVersions: ["99.0.0"],
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (99.0.0)");
    expect(result.stderr).not.toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (99.0.0)");
    expect(calls.at(-1)).toBe(nativeCall(selectedRoot));
    expect(calls.at(-1)).not.toContain("99.0.0");
  });


  test("uses the candidate install's success version without a marketplace update", () => {
    const { calls, result, selectedRoot } = runInstaller({
      args: ["--candidate-ref", "/candidate/checkout"],
      installVersion: "2.0.0-rc.1",
      staleVersions: ["99.0.0"],
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (2.0.0-rc.1)");
    expect(calls).toEqual([
      "plugin marketplace add /candidate/checkout",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
      nativeCall(selectedRoot),
    ]);
  });

  test("fails candidate mode when fresh-HOME marketplace registration fails", () => {
    const { calls, result } = runInstaller({
      addFails: true,
      args: ["--candidate-ref", "/candidate/checkout"],
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("candidate marketplace add failed");
    expect(calls).toEqual(["plugin marketplace add /candidate/checkout"]);
  });

  test("retries a published install without force only for the proven unsupported-option diagnostic", () => {
    const { calls, result, selectedRoot } = runInstaller({ forceOutcome: "unsupported" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (1.2.3)");
    expect(result.stderr).toContain("does not support --force");
    expect(result.stdout).not.toContain("unknown option");
    expect(result.stderr).not.toContain("unknown option");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
      "plugin install oh-my-gajae-code@oh-my-gajae-code",
      nativeCall(selectedRoot),
    ]);
  });

  test("does not retry an operational forced-install failure", () => {
    const { calls, result } = runInstaller({ forceOutcome: "operational" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing an unforced fallback");
    expect(result.stderr).not.toContain("should-not-leak");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
    ]);
  });

  test("does not retry a near-miss force-option diagnostic", () => {
    const { calls, result } = runInstaller({ forceOutcome: "near-miss" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing an unforced fallback");
    expect(result.stderr).not.toContain("forceful");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
    ]);
  });

  for (const installOutput of ["missing", "duplicate", "malformed", "ansi-near-miss"] as const) {
    test(`fails closed on ${installOutput} install success output`, () => {
      const { calls, result } = runInstaller({ installOutput });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("could not identify the just-installed");
      expect(calls).toEqual([
        "plugin marketplace add devswha/oh-my-gajae-code",
        "plugin marketplace update oh-my-gajae-code",
        "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
      ]);
    });
  }
  test("fails closed when only stderr contains a success-looking line", () => {
    const { calls, result } = runInstaller({
      installOutput: "missing",
      installStderr: "stale-success",
      staleVersions: ["99.0.0"],
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("could not identify the just-installed");
    expect(result.stdout).not.toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (99.0.0)");
    expect(result.stderr).not.toContain("✔ Installed oh-my-gajae-code from oh-my-gajae-code (99.0.0)");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
    ]);
  });

  test("accepts the CLI's harmless complete-line ANSI wrapper", () => {
    const { calls, result, selectedRoot } = runInstaller({ installOutput: "ansi" });

    expect(result.status, result.stderr).toBe(0);
    expect(calls.at(-1)).toBe(nativeCall(selectedRoot));
  });

  for (const installOutput of ["nerd", "ascii"] as const) {
    test(`accepts the ${installOutput} theme success token`, () => {
      const { calls, result, selectedRoot } = runInstaller({ installOutput });

      expect(result.status, result.stderr).toBe(0);
      expect(calls.at(-1)).toBe(nativeCall(selectedRoot));
    });
  }

  test("rejects a symlinked cache root", () => {
    const { calls, result } = runInstaller({ cacheSymlink: true });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("could not identify the just-installed");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
    ]);
  });

  test("rejects a symlinked native installer", () => {
    const { calls, result } = runInstaller({ nativeSymlink: true });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("could not identify the just-installed");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gajae-code",
      "plugin marketplace update oh-my-gajae-code",
      "plugin install oh-my-gajae-code@oh-my-gajae-code --force",
    ]);
  });

  test("rejects unknown options before invoking gjc", () => {
    const { calls, result } = runInstaller({ args: ["--not-a-real-option"] });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown option: --not-a-real-option");
    expect(calls).toEqual([]);
  });

  test("rejects option-like candidate equality values before invoking gjc", () => {
    const { calls, result } = runInstaller({ args: ["--candidate-ref=--force"] });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--candidate-ref needs a path or ref");
    expect(calls).toEqual([]);
  });

  test("keeps documented legacy inputs as warning-only compatibility arguments", () => {
    const { calls, result, selectedRoot } = runInstaller({ args: ["--core"] });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("legacy and install nothing extra");
    expect(calls.at(-1)).toBe(nativeCall(selectedRoot));
  });
});