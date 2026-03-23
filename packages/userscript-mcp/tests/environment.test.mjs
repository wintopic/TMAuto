import test from "node:test";
import assert from "node:assert/strict";
import { discoverBrowserCandidate, getDaemonPidFilePath } from "../dist/environment.js";

test("discoverBrowserCandidate prefers an explicit browser path", async () => {
  const result = await discoverBrowserCandidate({
    platform: "win32",
    env: {
      BB_BROWSER_EXECUTABLE: "C:\\Custom\\chrome.exe",
    },
    pathEntries: [],
    fileExists: (candidate) => candidate === "C:\\Custom\\chrome.exe",
  });

  assert.equal(result?.executablePath, "C:\\Custom\\chrome.exe");
  assert.equal(result?.source, "env");
});

test("getDaemonPidFilePath uses an app-specific runtime directory", () => {
  const pidFilePath = getDaemonPidFilePath({
    platform: "win32",
    homeDir: "C:\\Users\\winto",
    tmpDir: "C:\\Temp",
  });

  assert.match(pidFilePath, /bb-browser/i);
  assert.doesNotMatch(pidFilePath, /^\/tmp\/bb-browser\.pid$/);
});
