import test from "node:test";
import assert from "node:assert/strict";
import { generateUserscriptDraft } from "../dist/workflow.js";

test("generateUserscriptDraft creates metadata and an entry template from page intent", () => {
  const draft = generateUserscriptDraft({
    url: "https://example.com/dashboard",
    intent: "Add export buttons to each report card",
    projectName: "Dashboard Export Helper",
  });

  assert.equal(draft.metadata.name, "Dashboard Export Helper");
  assert.deepEqual(draft.metadata.match, ["https://example.com/dashboard*"]);
  assert.match(draft.entryTemplate, /report card/i);
});
