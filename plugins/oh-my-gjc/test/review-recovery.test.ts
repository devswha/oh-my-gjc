import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

test("offline durable review delivery and harvest regressions", () => {
  const result = spawnSync("python3", [resolve(import.meta.dir, "review_recovery_test.py"), "-v"], {
    encoding: "utf8", timeout: 30000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 35000);
