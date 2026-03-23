import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildUserscriptProject,
  initUserscriptProject,
  injectPublishUrls,
} from "../dist/project.js";

test("injectPublishUrls overrides metadata URLs", () => {
  const output = injectPublishUrls(
    {
      name: "Demo",
      version: "0.1.0",
      match: ["https://example.com/*"],
      include: [],
      exclude: [],
      grant: ["GM_getValue"],
    },
    {
      installUrl: "http://127.0.0.1:3000/demo.user.js",
      updateUrl: "http://127.0.0.1:3000/demo.user.js",
    }
  );

  assert.equal(output.downloadURL, "http://127.0.0.1:3000/demo.user.js");
  assert.equal(output.updateURL, "http://127.0.0.1:3000/demo.user.js");
});

test("buildUserscriptProject emits a user.js bundle with metadata banner", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "bb-userscript-"));

  try {
    await initUserscriptProject({
      rootDir,
      name: "Demo Script",
      match: ["https://example.com/*"],
      force: true,
    });

    const built = await buildUserscriptProject(rootDir);
    assert.match(built.code, /==UserScript==/);
    assert.match(built.code, /@name Demo Script/);
    assert.match(built.code, /@match https:\/\/example\.com\/\*/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
