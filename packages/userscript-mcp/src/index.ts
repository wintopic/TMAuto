import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  parseUserscriptMetadata,
  type UserscriptProjectPayload,
} from "@bb-browser/shared";
import { z } from "zod";
import { localPublishServer } from "./publish-server.js";
import {
  buildUserscriptProject,
  deriveProjectId,
  deriveScriptId,
  getProjectPaths,
  initUserscriptProject,
  readProjectMetadata,
  type BuiltUserscriptProject,
} from "./project.js";
import { getCapabilities, responseError, runCommand, textResult } from "./runtime.js";
import { userscriptToolError, userscriptToolResult } from "./tool-response.js";
import {
  collectUserscriptDebugArtifacts,
  collectUserscriptDoctorReport,
  collectUserscriptProjectStatus,
  generateUserscriptDraft,
  materializeUserscriptDraft,
  runUserscriptDevCycle,
} from "./workflow.js";

declare const __BB_BROWSER_VERSION__: string;

const StepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), ref: z.string() }),
  z.object({ type: z.literal("fill"), ref: z.string(), text: z.string() }),
  z.object({ type: z.literal("type"), ref: z.string(), text: z.string() }),
  z.object({ type: z.literal("check"), ref: z.string() }),
  z.object({ type: z.literal("uncheck"), ref: z.string() }),
  z.object({ type: z.literal("select"), ref: z.string(), value: z.string() }),
  z.object({ type: z.literal("press"), key: z.string() }),
  z.object({
    type: z.literal("scroll"),
    direction: z.enum(["up", "down", "left", "right"]),
    pixels: z.number().optional(),
  }),
  z.object({ type: z.literal("wait"), ms: z.number() }),
  z.object({ type: z.literal("eval"), script: z.string() }),
  z.object({ type: z.literal("snapshot"), interactive: z.boolean().optional() }),
]);

const AssertionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_includes"), value: z.string() }),
  z.object({ type: z.literal("url_equals"), value: z.string() }),
  z.object({ type: z.literal("element_exists"), selector: z.string() }),
  z.object({ type: z.literal("element_text"), selector: z.string(), includes: z.string() }),
  z.object({ type: z.literal("network_hit"), filter: z.string() }),
  z.object({ type: z.literal("no_js_errors") }),
]);

type RegressionStep = z.infer<typeof StepSchema>;
type RegressionAssertion = z.infer<typeof AssertionSchema>;

function buildUserscriptPayload(project: BuiltUserscriptProject): UserscriptProjectPayload {
  return {
    projectId: project.paths.projectId,
    scriptId: project.paths.scriptId,
    version: project.metadata.version,
    code: project.code,
    metadata: project.metadata,
    enabled: true,
  };
}

async function installOrUpdateUserscript(
  action: "userscript_install" | "userscript_update",
  project: BuiltUserscriptProject,
  publishInfo?: { installUrl?: string; updateUrl?: string; host?: string; port?: number; scriptPath?: string }
) {
  return runCommand({
    action,
    userscript: {
      ...buildUserscriptPayload(project),
      publishInfo,
    },
  });
}

async function installWithFallback(project: BuiltUserscriptProject) {
  let response = await installOrUpdateUserscript("userscript_update", project);
  if (!response.success) {
    response = await installOrUpdateUserscript("userscript_install", project);
  }
  return response;
}

async function runRegressionStep(tabId: number, step: RegressionStep) {
  switch (step.type) {
    case "click":
      return runCommand({ action: "click", ref: step.ref, tabId });
    case "fill":
      return runCommand({ action: "fill", ref: step.ref, text: step.text, tabId });
    case "type":
      return runCommand({ action: "type", ref: step.ref, text: step.text, tabId });
    case "check":
      return runCommand({ action: "check", ref: step.ref, tabId });
    case "uncheck":
      return runCommand({ action: "uncheck", ref: step.ref, tabId });
    case "select":
      return runCommand({ action: "select", ref: step.ref, value: step.value, tabId });
    case "press": {
      const parts = step.key.split("+");
      const modifierNames = new Set(["Control", "Alt", "Shift", "Meta"]);
      const modifiers = parts.filter((part) => modifierNames.has(part));
      const mainKey = parts.find((part) => !modifierNames.has(part));
      return runCommand({ action: "press", key: mainKey, modifiers, tabId });
    }
    case "scroll":
      return runCommand({
        action: "scroll",
        direction: step.direction,
        pixels: step.pixels || 500,
        tabId,
      });
    case "wait":
      return runCommand({ action: "wait", waitType: "time", ms: step.ms, tabId });
    case "eval":
      return runCommand({ action: "eval", script: step.script, tabId });
    case "snapshot":
      return runCommand({ action: "snapshot", interactive: step.interactive, tabId });
    default:
      return runCommand({ action: "wait", waitType: "time", ms: 0, tabId });
  }
}

async function runRegressionAssertion(tabId: number, assertion: RegressionAssertion) {
  switch (assertion.type) {
    case "url_includes": {
      const response = await runCommand({ action: "get", attribute: "url", tabId });
      const url = response.data?.value || "";
      return { passed: url.includes(assertion.value), details: { url } };
    }
    case "url_equals": {
      const response = await runCommand({ action: "get", attribute: "url", tabId });
      const url = response.data?.value || "";
      return { passed: url === assertion.value, details: { url } };
    }
    case "element_exists": {
      const response = await runCommand({
        action: "eval",
        script: `Boolean(document.querySelector(${JSON.stringify(assertion.selector)}))`,
        tabId,
      });
      return { passed: Boolean(response.data?.result), details: { result: response.data?.result } };
    }
    case "element_text": {
      const response = await runCommand({
        action: "eval",
        script: `(() => {
          const element = document.querySelector(${JSON.stringify(assertion.selector)});
          return element ? element.textContent || "" : null;
        })()`,
        tabId,
      });
      const text = typeof response.data?.result === "string" ? response.data.result : "";
      return { passed: text.includes(assertion.includes), details: { text } };
    }
    case "network_hit": {
      const response = await runCommand({
        action: "network",
        networkCommand: "requests",
        filter: assertion.filter,
        tabId,
      });
      const requests = response.data?.networkRequests || [];
      return { passed: requests.length > 0, details: { requestCount: requests.length } };
    }
    case "no_js_errors": {
      const response = await runCommand({
        action: "errors",
        errorsCommand: "get",
        tabId,
      });
      const errors = response.data?.jsErrors || [];
      return { passed: errors.length === 0, details: { errors } };
    }
    default:
      return { passed: false, details: { error: "Unsupported assertion" } };
  }
}

const server = new McpServer(
  { name: "bb-browser-userscript-mcp", version: __BB_BROWSER_VERSION__ },
  {
    instructions: `bb-browser userscript MCP helps AI agents scaffold, build, install, debug, publish, and regression test userscripts.

Recommended flow:
- userscript_project_init
- userscript_build
- userscript_dev_install or userscript_dev_update
- userscript_logs and userscript_storage
- userscript_publish_local
- userscript_export_tampermonkey
- userscript_regression_run`,
  }
);

server.tool("browser_capabilities", "Inspect browser and userscript runtime support", {}, async () =>
  textResult(await getCapabilities())
);

server.tool(
  "userscript_doctor",
  "Inspect whether the machine and optional project are ready for userscript development",
  {
    rootDir: z.string().optional().describe("Optional userscript project root directory"),
  },
  async ({ rootDir }) => {
    try {
      return userscriptToolResult(await collectUserscriptDoctorReport(rootDir));
    } catch (error) {
      return userscriptToolError(
        error instanceof Error ? error.message : String(error),
        "Run the doctor again after confirming the browser, daemon, and extension are available."
      );
    }
  }
);

server.tool(
  "userscript_project_status",
  "Inspect the current userscript project state and recommended next step",
  {
    rootDir: z.string().describe("Userscript project root directory"),
  },
  async ({ rootDir }) => {
    try {
      return userscriptToolResult(await collectUserscriptProjectStatus(rootDir));
    } catch (error) {
      return userscriptToolError(
        error instanceof Error ? error.message : String(error),
        "Verify that rootDir points to a local userscript project before retrying."
      );
    }
  }
);

server.tool(
  "userscript_project_init",
  "Create a new userscript project scaffold",
  {
    rootDir: z.string().describe("Project root directory"),
    name: z.string().describe("Userscript @name"),
    namespace: z.string().optional().describe("Userscript @namespace"),
    description: z.string().optional().describe("Userscript @description"),
    match: z.array(z.string()).min(1).describe("Userscript @match rules"),
    include: z.array(z.string()).optional().describe("Optional @include rules"),
    exclude: z.array(z.string()).optional().describe("Optional @exclude rules"),
    grant: z.array(z.string()).optional().describe("Optional @grant list"),
    runAt: z.enum(["document-start", "document-end", "document-idle"]).optional(),
    noframes: z.boolean().optional().describe("Emit @noframes"),
    force: z.boolean().optional().describe("Overwrite an existing scaffold"),
  },
  async (args) => {
    const result = await initUserscriptProject(args);
    return textResult({
      projectId: result.paths.projectId,
      scriptId: result.paths.scriptId,
      rootDir: result.paths.rootDir,
      metaPath: result.paths.metaPath,
      entryPath: result.paths.entryPath,
      scenarioPath: result.paths.defaultScenarioPath,
      metadata: result.metadata,
    });
  }
);

server.tool(
  "userscript_generate_from_page",
  "Generate a userscript draft from a target page URL and intent, optionally writing a scaffold to disk",
  {
    url: z.string().describe("Target page URL"),
    intent: z.string().describe("What the userscript should accomplish"),
    projectName: z.string().describe("Userscript project and @name"),
    rootDir: z.string().optional().describe("Optional project root directory to scaffold"),
    namespace: z.string().optional().describe("Optional userscript namespace"),
    force: z.boolean().optional().describe("Overwrite an existing scaffold when rootDir is provided"),
  },
  async ({ url, intent, projectName, rootDir, namespace, force }) => {
    try {
      if (rootDir) {
        return userscriptToolResult(
          await materializeUserscriptDraft({
            url,
            intent,
            projectName,
            rootDir,
            namespace,
            force,
          })
        );
      }

      return userscriptToolResult(
        generateUserscriptDraft({
          url,
          intent,
          projectName,
          namespace,
        })
      );
    } catch (error) {
      return userscriptToolError(
        error instanceof Error ? error.message : String(error),
        "Check the target URL and project root, then retry the userscript draft generation."
      );
    }
  }
);

server.tool(
  "userscript_build",
  "Bundle a userscript project into dist/*.user.js",
  {
    rootDir: z.string().describe("Project root directory"),
  },
  async ({ rootDir }) => {
    const project = await buildUserscriptProject(rootDir);
    return textResult({
      projectId: project.paths.projectId,
      scriptId: project.paths.scriptId,
      distPath: project.paths.distPath,
      metadata: project.metadata,
    });
  }
);

server.tool(
  "userscript_dev_install",
  "Build and install the userscript into the extension dev runtime",
  {
    rootDir: z.string().describe("Project root directory"),
  },
  async ({ rootDir }) => {
    const project = await buildUserscriptProject(rootDir);
    const response = await installOrUpdateUserscript("userscript_install", project);
    if (!response.success) return responseError(response);
    return textResult(response.data);
  }
);

server.tool(
  "userscript_dev_update",
  "Build and update the userscript in the extension dev runtime",
  {
    rootDir: z.string().describe("Project root directory"),
  },
  async ({ rootDir }) => {
    const project = await buildUserscriptProject(rootDir);
    const response = await installOrUpdateUserscript("userscript_update", project);
    if (!response.success) return responseError(response);
    return textResult(response.data);
  }
);

server.tool(
  "userscript_dev_run",
  "Build, install or update, open the target page, and return debug artifacts for the userscript",
  {
    rootDir: z.string().describe("Project root directory"),
    url: z.string().describe("Target URL to open"),
    settleMs: z.number().optional().describe("Optional wait time after opening the page"),
  },
  async ({ rootDir, url, settleMs }) => {
    try {
      return userscriptToolResult(
        await runUserscriptDevCycle(
          {
            buildProject: buildUserscriptProject,
            installWithFallback,
            runCommand,
          },
          { rootDir, url, settleMs }
        )
      );
    } catch (error) {
      return userscriptToolError(
        error instanceof Error ? error.message : String(error),
        "Run userscript_doctor first if the browser runtime is not ready."
      );
    }
  }
);

server.tool(
  "userscript_dev_uninstall",
  "Remove the userscript from the extension dev runtime",
  {
    rootDir: z.string().describe("Project root directory"),
  },
  async ({ rootDir }) => {
    const metadata = await readProjectMetadata(rootDir);
    const response = await runCommand({
      action: "userscript_uninstall",
      userscript: {
        scriptId: deriveScriptId(rootDir, metadata),
        projectId: deriveProjectId(rootDir),
      },
    });
    if (!response.success) return responseError(response);
    return textResult(response.data);
  }
);

server.tool(
  "userscript_logs",
  "Read log entries emitted by the installed userscript runtime",
  {
    rootDir: z.string().describe("Project root directory"),
    cursor: z.number().optional().describe("Only return log entries after this cursor"),
    limit: z.number().optional().describe("Maximum number of logs to return"),
  },
  async ({ rootDir, cursor, limit }) => {
    const metadata = await readProjectMetadata(rootDir);
    const response = await runCommand({
      action: "userscript_logs",
      userscript: {
        projectId: deriveProjectId(rootDir),
        scriptId: deriveScriptId(rootDir, metadata),
        logCursor: cursor,
        limit,
      },
    });
    if (!response.success) return responseError(response);
    return textResult(response.data);
  }
);

server.tool(
  "userscript_storage",
  "Read GM storage values from the installed userscript runtime",
  {
    rootDir: z.string().describe("Project root directory"),
    key: z.string().optional().describe("Optional storage key to read"),
  },
  async ({ rootDir, key }) => {
    const metadata = await readProjectMetadata(rootDir);
    const response = await runCommand({
      action: "userscript_storage",
      userscript: {
        projectId: deriveProjectId(rootDir),
        scriptId: deriveScriptId(rootDir, metadata),
        storageKey: key,
      },
    });
    if (!response.success) return responseError(response);
    return textResult(response.data);
  }
);

server.tool(
  "userscript_export_tampermonkey",
  "Build a Tampermonkey-compatible .user.js artifact",
  {
    rootDir: z.string().describe("Project root directory"),
    installUrl: z.string().optional().describe("Optional @downloadURL to inject"),
    updateUrl: z.string().optional().describe("Optional @updateURL to inject"),
  },
  async ({ rootDir, installUrl, updateUrl }) => {
    const project = await buildUserscriptProject(rootDir, { installUrl, updateUrl });
    const metadata = parseUserscriptMetadata(project.code);
    return textResult({
      projectId: project.paths.projectId,
      scriptId: project.paths.scriptId,
      distPath: project.paths.distPath,
      metadata,
    });
  }
);

server.tool(
  "userscript_publish_local",
  "Export a .user.js file and host it on localhost for install/update",
  {
    rootDir: z.string().describe("Project root directory"),
    host: z.string().optional().describe("Publish host, defaults to 127.0.0.1"),
    port: z.number().optional().describe("Publish port, defaults to an available port"),
  },
  async ({ rootDir, host, port }) => {
    const metadata = await readProjectMetadata(rootDir);
    const projectId = deriveProjectId(rootDir);
    const scriptId = deriveScriptId(rootDir, metadata);
    const projectPaths = getProjectPaths(rootDir, metadata);

    await localPublishServer.start(host || "127.0.0.1", port || 0);
    const provisional = await localPublishServer.publish(scriptId, projectPaths.distPath);
    const project = await buildUserscriptProject(rootDir, {
      installUrl: provisional.installUrl,
      updateUrl: provisional.updateUrl,
    });
    const publishInfo = await localPublishServer.publish(scriptId, project.paths.distPath);

    const runtimeResponse = await runCommand({
      action: "userscript_publish",
      userscript: {
        projectId,
        scriptId,
        publishInfo,
      },
    });

    return textResult({
      publishInfo,
      runtimeSynced: runtimeResponse.success,
      runtimeError: runtimeResponse.success ? undefined : runtimeResponse.error,
    });
  }
);

server.tool(
  "userscript_regression_run",
  "Build, install, and run a browser regression for the current userscript",
  {
    rootDir: z.string().describe("Project root directory"),
    url: z.string().describe("Target URL to open"),
    steps: z.array(StepSchema).optional().describe("Browser interaction steps"),
    assertions: z.array(AssertionSchema).optional().describe("Post-run assertions"),
  },
  async ({ rootDir, url, steps = [], assertions = [] }) => {
    const project = await buildUserscriptProject(rootDir);
    const installResponse = await installWithFallback(project);
    if (!installResponse.success) return responseError(installResponse);

    const openResponse = await runCommand({ action: "open", url });
    if (!openResponse.success) return responseError(openResponse);

    const tabId = openResponse.data?.tabId;
    if (typeof tabId !== "number") {
      return textResult({ error: "No tabId returned from open", install: installResponse.data });
    }

    await runCommand({ action: "wait", waitType: "time", ms: 1000, tabId });
    await runCommand({ action: "network", networkCommand: "clear", tabId });
    await runCommand({ action: "errors", errorsCommand: "clear", tabId });

    const stepResults: Array<{ step: RegressionStep; success: boolean; details: unknown }> = [];
    for (const step of steps) {
      const response = await runRegressionStep(tabId, step);
      stepResults.push({
        step,
        success: Boolean(response.success),
        details: response.success ? response.data : response.error,
      });
    }

    const assertionResults: Array<{ assertion: RegressionAssertion; passed: boolean; details: unknown }> = [];
    for (const assertion of assertions) {
      assertionResults.push({
        assertion,
        ...(await runRegressionAssertion(tabId, assertion)),
      });
    }

    const artifacts = await collectUserscriptDebugArtifacts(
      {
        runCommand,
      },
      project,
      tabId
    );

    return textResult({
      projectId: project.paths.projectId,
      scriptId: project.paths.scriptId,
      tabId,
      install: installResponse.data,
      steps: stepResults,
      assertions: assertionResults,
      passed: stepResults.every((result) => result.success) && assertionResults.every((result) => result.passed),
      logs: artifacts.logs,
      jsErrors: artifacts.jsErrors,
      networkRequests: artifacts.networkRequests,
    });
  }
);

export async function startUserscriptMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startUserscriptMcpServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
