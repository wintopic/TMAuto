import test from "node:test";
import assert from "node:assert/strict";
import { buildUserscriptDoctorReport, buildUserscriptProjectStatus } from "../dist/workflow.js";

test("buildUserscriptDoctorReport reports environment blockers", async () => {
  const report = await buildUserscriptDoctorReport({
    capabilities: {
      extensionConnected: false,
      userScriptsAvailable: false,
      minimumRequirementsMet: false,
    },
    environment: {
      browserFound: true,
      browserName: "chrome",
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      managedBrowserReachable: false,
      daemonReachable: false,
      extensionConnected: false,
      userScriptsAvailable: false,
      minimumRequirementsMet: false,
      publishServerReachable: true,
      diagnostics: [
        {
          level: "error",
          code: "extension_missing",
          message: "Extension not connected",
          hint: "Load the unpacked extension before retrying",
          action: {
            label: "Load the unpacked extension in chrome://extensions",
          },
        },
      ],
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.diagnostics[0].code, "extension_missing");
  assert.equal(report.diagnostics[0].action?.label, "Load the unpacked extension in chrome://extensions");
});

test("buildUserscriptProjectStatus exposes the next recommended action", () => {
  const report = buildUserscriptProjectStatus({
    projectId: "demo-project",
    scriptId: "demo-script",
    distPath: "/tmp/demo/dist/demo-script.user.js",
    projectExists: true,
    metadataValid: true,
    entryExists: true,
    buildExists: false,
    runtimeInstalled: false,
    publishConfigured: false,
    diagnostics: [],
    nextStep: {
      action: "build",
      reason: "Build artifact has not been created yet",
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.nextStep.action, "build");
});
