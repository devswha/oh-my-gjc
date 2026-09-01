import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  test("detects a lease whose file was replaced underneath it", () => {
    // HIGH finding from the same Pro review: flock binds to an inode, not a path.
    // A tmp reaper or a stray rm leaves the holder guarding an orphan while the
    // next run creates a fresh file, locks that, and drives the same CDP browser.
    const output = runPython(`
import importlib.util, os
spec = importlib.util.spec_from_file_location("cdp_lock", ${JSON.stringify(lock)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

held = module.CdpLease(45010).acquire()
print(held.still_binding())          # bound to the inode we locked
os.unlink(held.path)
print(held.still_binding())          # our inode is orphaned -> not binding
usurper = module.CdpLease(45010).acquire()
print(usurper.still_binding())       # the new holder owns the live file
usurper.release()
held.release()

after = module.CdpLease(45010).acquire()
after.release()
print("recovered")
`);

    expect(output).toEqual(["True", "False", "True", "recovered"]);
  });

  test("grants exactly one holder under real multi-process contention", () => {
    // acquire() now retries on a raced lease. A retry loop is exactly the kind of
    // change that can quietly turn a rejection into a second grant, so contend for
    // real across processes rather than asserting on a single-process path.
    const output = runPython(`
import multiprocessing, os, time

LOCK = ${JSON.stringify(lock)}

def worker(port, q):
    import importlib.util
    spec = importlib.util.spec_from_file_location("cdp_lock", LOCK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        lease = module.CdpLease(port).acquire()
        q.put("granted")
        time.sleep(0.4)              # hold the critical section
        q.put("bound" if lease.still_binding() else "unbound")
        lease.release()
    except RuntimeError:
        q.put("rejected")

if __name__ == "__main__":
    q = multiprocessing.Queue()
    procs = [multiprocessing.Process(target=worker, args=(46100, q)) for _ in range(8)]
    for p in procs: p.start()
    for p in procs: p.join()
    seen = []
    while not q.empty(): seen.append(q.get())
    print(seen.count("granted"))
    print(seen.count("rejected"))
    print(seen.count("unbound"))
`);

    expect(output).toEqual([
      "1", // exactly one holder, never two
      "7", // everyone else is rejected outright
      "0", // and the holder's lease stayed bound for its whole critical section
    ]);
  });

  test("refuses to send while the lease no longer binds", () => {
    // still_binding() is only useful if the long-running consumer consults it
    // before the irreversible step; a send burns a Pro message.
    const engineSource = readFileSync(
      resolve(import.meta.dir, "../bin/pack_and_ask.py"),
      "utf8",
    );
    expect(engineSource).toContain("if not cdp_lease.still_binding():");
    const guard = engineSource.indexOf("if not cdp_lease.still_binding():");
    const send = engineSource.indexOf("click_send(page)", guard);
    expect(guard).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(guard); // the check precedes the send
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
