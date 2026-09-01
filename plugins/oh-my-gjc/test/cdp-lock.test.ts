import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const lock = resolve(import.meta.dir, "../bin/cdp_lock.py");

function runPython(script: string) {
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n");
}

describe("CdpLease acquisition safety", () => {
  // Found by a GPT-5.6 Sol Pro review of this file (2026-09-01) and reproduced
  // against the pre-fix code: it leaked 1 fd AND left the flock held, so every
  // later run refused to start with "another OMG ChatGPT CDP automation is
  // running" until the process exited.
  test("releases the fd and the lock when interrupted mid-acquire", () => {
    const output = runPython(`
import importlib.util, os
spec = importlib.util.spec_from_file_location("cdp_lock", ${JSON.stringify(lock)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def fd_count():
    return len(os.listdir("/proc/self/fd"))

port = 45997
before = fd_count()
real_write = os.write

def interrupt_after_lock(fd, data):
    # the pid write happens only after the lock is held
    if data == str(os.getpid()).encode("ascii"):
        raise KeyboardInterrupt("user interrupt")
    return real_write(fd, data)

os.write = interrupt_after_lock
try:
    module.CdpLease(port).acquire()
    print("NOT_INTERRUPTED")
except KeyboardInterrupt:
    print("interrupted")
finally:
    os.write = real_write

print(fd_count() - before)

# a jammed lock would make this raise; nobody owns the lease anymore
lease = module.CdpLease(port).acquire()
lease.release()
print("reacquired")
`);

    expect(output).toEqual([
      "interrupted",
      "0", // no descriptor leaked
      "reacquired", // and the lock is genuinely free again
    ]);
  });

  test("still rejects a genuinely concurrent holder", () => {
    // The interrupt fix must not weaken the single-flight guarantee itself.
    const output = runPython(`
import importlib.util
spec = importlib.util.spec_from_file_location("cdp_lock", ${JSON.stringify(lock)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

held = module.CdpLease(45996).acquire()
try:
    module.CdpLease(45996).acquire()
    print("SECOND_ACQUIRE_SUCCEEDED")
except RuntimeError as exc:
    print("rejected" if "already" in str(exc) or "running" in str(exc) else str(exc))
finally:
    held.release()

after = module.CdpLease(45996).acquire()
after.release()
print("free after release")
`);

    expect(output).toEqual(["rejected", "free after release"]);
  });
});
