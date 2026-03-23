import test from "node:test";
import assert from "node:assert/strict";
import {
  parseUserscriptMetadata,
  validateUserscriptMetadata,
} from "../dist/index.js";

test("parseUserscriptMetadata extracts supported fields", () => {
  const metadata = parseUserscriptMetadata(`// ==UserScript==
// @name Demo Script
// @namespace demo
// @version 0.1.0
// @description hello
// @match https://example.com/*
// @grant GM_getValue
// @grant GM_setValue
// @run-at document-idle
// ==/UserScript==
console.log("ok");
`);

  assert.equal(metadata.name, "Demo Script");
  assert.equal(metadata.namespace, "demo");
  assert.deepEqual(metadata.match, ["https://example.com/*"]);
  assert.deepEqual(metadata.grant, ["GM_getValue", "GM_setValue"]);
});

test("validateUserscriptMetadata rejects unsupported grants", () => {
  const result = validateUserscriptMetadata({
    name: "Demo",
    version: "0.1.0",
    match: ["https://example.com/*"],
    include: [],
    exclude: [],
    grant: ["GM_notSupported"],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /Unsupported @grant/);
});
