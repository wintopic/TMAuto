import {
  createUserscriptDiagnostic,
  createUserscriptMetadata,
  getRuntimePaths,
  type Request,
  type Response,
  type BrowserCapabilities,
  type UserscriptDiagnostic,
  type UserscriptEnvironmentStatus,
  type UserscriptMetadata,
} from "@bb-browser/shared";
import { createServer } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildUserscriptProject,
  deriveProjectId,
  getProjectPaths,
  initUserscriptProject,
  type BuiltUserscriptProject,
} from "./project.js";
import { discoverBrowserCandidate } from "./environment.js";
import { fetchDaemonStatus, getCapabilities, runCommand } from "./runtime.js";
import { inspectUserscriptWorkspace, type InspectedUserscriptWorkspace } from "./workspace-status.js";

export interface UserscriptDoctorReport {
  ready: boolean;
  capabilities: BrowserCapabilities;
  environment: UserscriptEnvironmentStatus;
  diagnostics: UserscriptDiagnostic[];
  workspace?: InspectedUserscriptWorkspace;
}

export interface UserscriptProjectStatusReport {
  ready: boolean;
  projectId: string;
  scriptId: string;
  distPath: string;
  diagnostics: UserscriptDiagnostic[];
  nextStep: InspectedUserscriptWorkspace["nextStep"];
  workspace: InspectedUserscriptWorkspace;
}

export interface BuildUserscriptDoctorReportInput {
  capabilities: BrowserCapabilities;
  environment: UserscriptEnvironmentStatus;
  workspace?: InspectedUserscriptWorkspace;
}

export interface UserscriptDevRunDeps {
  buildProject: typeof buildUserscriptProject;
  installWithFallback: (
    project: BuiltUserscriptProject
  ) => Promise<Pick<Response, "success" | "data" | "error">>;
  runCommand: (request: Omit<Request, "id">) => Promise<Pick<Response, "success" | "data" | "error">>;
}

export interface UserscriptDevRunInput {
  rootDir: string;
  url: string;
  settleMs?: number;
}

export interface UserscriptDebugArtifacts {
  logs: unknown[];
  jsErrors: unknown[];
  networkRequests: unknown[];
}

export interface UserscriptDevRunResult extends UserscriptDebugArtifacts {
  ready: boolean;
  summary: string;
  projectId: string;
  scriptId: string;
  tabId?: number;
  install?: unknown;
}

export interface GenerateUserscriptDraftInput {
  url: string;
  intent: string;
  projectName: string;
  namespace?: string;
}

export interface GeneratedUserscriptDraft {
  metadata: UserscriptMetadata;
  entryTemplate: string;
  scenario: {
    url: string;
    steps: Array<{ type: "wait"; ms: number }>;
    assertions: Array<{ type: "element_exists"; selector: string }>;
  };
}

async function canConnect(host: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`http://${host}:${port}/json/version`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function isManagedBrowserReachable(): Promise<boolean> {
  try {
    const rawPort = await readFile(getRuntimePaths().managedPortFile, "utf8");
    const port = Number.parseInt(rawPort.trim(), 10);
    if (!Number.isInteger(port) || port <= 0) {
      return false;
    }

    return await canConnect("127.0.0.1", port);
  } catch {
    return false;
  }
}

async function canBindPublishServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function createEnvironmentDiagnostics(
  browserName: string | undefined,
  capabilities: BrowserCapabilities,
  environment: Omit<UserscriptEnvironmentStatus, "diagnostics">
): UserscriptDiagnostic[] {
  const diagnostics: UserscriptDiagnostic[] = [];

  if (!environment.browserFound) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "error",
        "browser_not_found",
        "No supported Chromium browser executable was found",
        "Install Chrome, Edge, Brave, or set BB_BROWSER_EXECUTABLE to a valid browser path.",
        {
          label: "Set BB_BROWSER_EXECUTABLE to a local Chromium browser path",
        }
      )
    );
  } else {
    diagnostics.push(
      createUserscriptDiagnostic(
        "info",
        "browser_found",
        `Detected browser candidate: ${browserName || "chromium"}`,
        environment.executablePath
      )
    );
  }

  if (!environment.daemonReachable) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "warn",
        "daemon_unreachable",
        "bb-browser daemon is not reachable yet",
        "The MCP runtime will try to start it automatically when browser commands are sent."
      )
    );
  }

  if (!capabilities.extensionConnected) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "error",
        "extension_missing",
        "Chrome extension is not connected",
        "Load the unpacked extension and keep it enabled before retrying.",
        {
          label: "Load the unpacked extension in chrome://extensions",
        }
      )
    );
  } else if (!capabilities.userScriptsAvailable) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "error",
        "userscripts_unavailable",
        "chrome.userScripts is unavailable in the connected browser",
        "Use a Chromium browser that supports the userScripts API and keep the permission enabled."
      )
    );
  } else if (!capabilities.minimumRequirementsMet) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "error",
        "minimum_requirements",
        "Connected browser does not meet the minimum userscript runtime requirements",
        "Upgrade the browser to Chrome 120+ or a compatible Chromium build."
      )
    );
  }

  if (!environment.publishServerReachable) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "warn",
        "publish_server_unavailable",
        "Local publish server probe failed",
        "Check whether localhost port binding is blocked by the environment."
      )
    );
  }

  return diagnostics;
}

async function collectUserscriptEnvironmentStatus(): Promise<{
  capabilities: BrowserCapabilities;
  environment: UserscriptEnvironmentStatus;
}> {
  const [browserCandidate, capabilities, daemonStatus, managedBrowserReachable, publishServerReachable] =
    await Promise.all([
      discoverBrowserCandidate(),
      getCapabilities(),
      fetchDaemonStatus(),
      isManagedBrowserReachable(),
      canBindPublishServer(),
    ]);

  const environmentBase = {
    browserFound: Boolean(browserCandidate),
    browserName: browserCandidate?.browserName,
    executablePath: browserCandidate?.executablePath,
    managedBrowserReachable,
    daemonReachable: Boolean(daemonStatus?.running),
    extensionConnected: capabilities.extensionConnected,
    userScriptsAvailable: capabilities.userScriptsAvailable,
    minimumRequirementsMet: capabilities.minimumRequirementsMet,
    publishServerReachable,
  };

  return {
    capabilities,
    environment: {
      ...environmentBase,
      diagnostics: createEnvironmentDiagnostics(browserCandidate?.browserName, capabilities, environmentBase),
    },
  };
}

async function lookupRuntimeInstallation(rootDir: string, scriptId: string): Promise<boolean> {
  const response = await runCommand({
    action: "userscript_logs",
    userscript: {
      projectId: deriveProjectId(rootDir),
      scriptId,
      limit: 1,
    },
  });

  return response.success;
}

export async function buildUserscriptDoctorReport(
  input: BuildUserscriptDoctorReportInput
): Promise<UserscriptDoctorReport> {
  const diagnostics = [...input.environment.diagnostics, ...(input.workspace?.diagnostics || [])];
  const workspaceReady = !input.workspace || input.workspace.nextStep.action === "debug";

  return {
    ready:
      input.capabilities.minimumRequirementsMet &&
      diagnostics.every((diagnostic) => diagnostic.level !== "error") &&
      workspaceReady,
    capabilities: input.capabilities,
    environment: input.environment,
    diagnostics,
    workspace: input.workspace,
  };
}

export function buildUserscriptProjectStatus(
  workspace: InspectedUserscriptWorkspace
): UserscriptProjectStatusReport {
  return {
    ready: workspace.nextStep.action === "debug",
    projectId: workspace.projectId,
    scriptId: workspace.scriptId,
    distPath: workspace.distPath,
    diagnostics: workspace.diagnostics,
    nextStep: workspace.nextStep,
    workspace,
  };
}

export async function collectUserscriptDoctorReport(rootDir?: string): Promise<UserscriptDoctorReport> {
  const { capabilities, environment } = await collectUserscriptEnvironmentStatus();
  const workspace = rootDir
    ? await inspectUserscriptWorkspace({
        rootDir,
        runtimeLookup: async (scriptId) => lookupRuntimeInstallation(rootDir, scriptId),
      })
    : undefined;

  return buildUserscriptDoctorReport({
    capabilities,
    environment,
    workspace,
  });
}

export async function collectUserscriptProjectStatus(
  rootDir: string
): Promise<UserscriptProjectStatusReport> {
  const workspace = await inspectUserscriptWorkspace({
    rootDir,
    runtimeLookup: async (scriptId) => lookupRuntimeInstallation(rootDir, scriptId),
  });

  return buildUserscriptProjectStatus(workspace);
}

export async function collectUserscriptDebugArtifacts(
  deps: Pick<UserscriptDevRunDeps, "runCommand">,
  project: Pick<BuiltUserscriptProject, "paths">,
  tabId: number
): Promise<UserscriptDebugArtifacts> {
  const [logsResponse, errorsResponse, networkResponse] = await Promise.all([
    deps.runCommand({
      action: "userscript_logs",
      userscript: {
        projectId: project.paths.projectId,
        scriptId: project.paths.scriptId,
        limit: 200,
      },
    }),
    deps.runCommand({
      action: "errors",
      errorsCommand: "get",
      tabId,
    }),
    deps.runCommand({
      action: "network",
      networkCommand: "requests",
      tabId,
    }),
  ]);

  return {
    logs: logsResponse.data?.userscriptLogs || [],
    jsErrors: errorsResponse.data?.jsErrors || [],
    networkRequests: networkResponse.data?.networkRequests || [],
  };
}

export async function runUserscriptDevCycle(
  deps: UserscriptDevRunDeps,
  input: UserscriptDevRunInput
): Promise<UserscriptDevRunResult> {
  const project = await deps.buildProject(input.rootDir);
  const installResponse = await deps.installWithFallback(project);

  if (!installResponse.success) {
    return {
      ready: false,
      summary: `Install failed for ${project.paths.scriptId}: ${installResponse.error || "unknown error"}`,
      projectId: project.paths.projectId,
      scriptId: project.paths.scriptId,
      install: installResponse.data,
      logs: [],
      jsErrors: [],
      networkRequests: [],
    };
  }

  const openResponse = await deps.runCommand({ action: "open", url: input.url });
  const tabId = typeof openResponse.data?.tabId === "number" ? openResponse.data.tabId : undefined;

  if (!openResponse.success || tabId === undefined) {
    return {
      ready: false,
      summary: `Open failed for ${input.url}: ${openResponse.error || "no tabId returned"}`,
      projectId: project.paths.projectId,
      scriptId: project.paths.scriptId,
      install: installResponse.data,
      logs: [],
      jsErrors: [],
      networkRequests: [],
    };
  }

  await deps.runCommand({ action: "network", networkCommand: "clear", tabId });
  await deps.runCommand({ action: "errors", errorsCommand: "clear", tabId });
  await deps.runCommand({ action: "wait", waitType: "time", ms: input.settleMs ?? 1000, tabId });

  const artifacts = await collectUserscriptDebugArtifacts(deps, project, tabId);

  return {
    ready: artifacts.jsErrors.length === 0,
    summary: `Installed ${project.paths.scriptId} and collected ${artifacts.logs.length} log entries`,
    projectId: project.paths.projectId,
    scriptId: project.paths.scriptId,
    tabId,
    install: installResponse.data,
    ...artifacts,
  };
}

export function generateUserscriptDraft(input: GenerateUserscriptDraftInput): GeneratedUserscriptDraft {
  const target = new URL(input.url);
  const matchRule = `${target.origin}${target.pathname || "/"}*`;
  const metadata = createUserscriptMetadata({
    name: input.projectName,
    namespace: input.namespace,
    version: "0.1.0",
    description: input.intent,
    match: [matchRule],
    include: [],
    exclude: [],
    grant: ["GM_getValue", "GM_setValue", "GM_addStyle"],
    runAt: "document-idle",
  });
  const entryTemplate = `async function main() {\n  // Goal: ${input.intent}\n  console.log(${JSON.stringify(input.intent)}, {\n    url: location.href,\n  });\n}\n\nvoid main();\n`;

  return {
    metadata,
    entryTemplate,
    scenario: {
      url: input.url,
      steps: [{ type: "wait", ms: 500 }],
      assertions: [{ type: "element_exists", selector: "body" }],
    },
  };
}

export async function materializeUserscriptDraft(input: GenerateUserscriptDraftInput & { rootDir: string; force?: boolean }) {
  const draft = generateUserscriptDraft(input);
  const scaffold = await initUserscriptProject({
    rootDir: input.rootDir,
    name: draft.metadata.name,
    namespace: draft.metadata.namespace,
    description: draft.metadata.description,
    match: draft.metadata.match,
    include: draft.metadata.include,
    exclude: draft.metadata.exclude,
    grant: draft.metadata.grant,
    runAt: draft.metadata.runAt,
    noframes: draft.metadata.noframes,
    force: input.force,
  });
  const projectPaths = getProjectPaths(input.rootDir, draft.metadata);

  await writeFile(projectPaths.entryPath, draft.entryTemplate, "utf8");
  await writeFile(`${projectPaths.defaultScenarioPath}`, `${JSON.stringify(draft.scenario, null, 2)}\n`, "utf8");

  return {
    draft,
    paths: projectPaths,
    metadata: scaffold.metadata,
  };
}
