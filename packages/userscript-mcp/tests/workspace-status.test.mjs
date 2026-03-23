import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectUserscriptWorkspace } from "../dist/workspace-status.js";
import { userscriptToolError } from "../dist/tool-response.js";

test("inspectUserscriptWorkspace suggests create_entry when src/main.ts is missing", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "bb-userscript-workspace-"));

  try {
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(
      path.join(rootDir, "meta.json"),
      `${JSON.stringify({
        name: "Demo Script",
        version: "0.1.0",
        match: ["https://example.com/*"],
        include: [],
        exclude: [],
        grant: ["GM_getValue"],
      })}\n`,
      "utf8"
    );

    const status = await inspectUserscriptWorkspace({
      rootDir,
      runtimeLookup: async () => false,
    });

    assert.equal(status.projectExists, true);
    assert.equal(status.entryExists, false);
    assert.equal(status.nextStep.action, "create_entry");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("userscriptToolError returns a structured MCP error payload", () => {
  const result = userscriptToolError(
    "Extension not connected",
    "Load the unpacked extension before retrying",
    "bb-browser open chrome://extensions"
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /"error": "Extension not connected"/);
  assert.match(result.content[0].text, /"action": "bb-browser open chrome:\/\/extensions"/);
});
