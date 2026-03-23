import test from "node:test";
import assert from "node:assert/strict";
import { runUserscriptDevCycle } from "../dist/workflow.js";

test("runUserscriptDevCycle builds, installs, and returns debug artifacts", async () => {
  const commands = [];
  const project = {
    paths: {
      projectId: "demo-project",
      scriptId: "demo-script",
    },
  };

  const result = await runUserscriptDevCycle(
    {
      buildProject: async () => project,
      installWithFallback: async () => ({
        success: true,
        data: {
          userscript: {
            scriptId: "demo-script",
          },
        },
      }),
      runCommand: async (request) => {
        commands.push(request);

        if (request.action === "open") {
          return { success: true, data: { tabId: 7 } };
        }

        if (request.action === "userscript_logs") {
          return { success: true, data: { userscriptLogs: [{ message: "Userscript active" }] } };
        }

        if (request.action === "errors" && request.errorsCommand === "get") {
          return { success: true, data: { jsErrors: [] } };
        }

        if (request.action === "network" && request.networkCommand === "requests") {
          return { success: true, data: { networkRequests: [{ url: "https://example.com/api" }] } };
        }

        return { success: true, data: {} };
      },
    },
    {
      rootDir: "/tmp/demo",
      url: "https://example.com/app",
      settleMs: 750,
    }
  );

  assert.equal(result.ready, true);
  assert.match(result.summary, /install/i);
  assert.equal(result.logs.length, 1);
  assert.equal(result.jsErrors.length, 0);
  assert.equal(commands[0].action, "open");
  assert.equal(commands[1].action, "network");
  assert.equal(commands[2].action, "errors");
});
