import test from "node:test";
import assert from "node:assert/strict";
import { deriveUserscriptNextStep, getRuntimePaths } from "../dist/index.js";

test("deriveUserscriptNextStep prefers metadata repair before build", () => {
  const next = deriveUserscriptNextStep({
    projectExists: true,
    metadataValid: false,
    entryExists: true,
    buildExists: false,
    runtimeInstalled: false,
    publishConfigured: false,
  });

  assert.equal(next.action, "repair_metadata");
});

test("getRuntimePaths uses an app-specific runtime directory", () => {
  const paths = getRuntimePaths({
    homeDir: "/tmp/home",
    tmpDir: "/var/tmp",
  });

  assert.match(paths.runtimeDir, /bb-browser/);
  assert.match(paths.pidFilePath, /bb-browser/);
  assert.doesNotMatch(paths.pidFilePath, /^\/tmp\/bb-browser\.pid$/);
});
