export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticAction {
  label: string;
  command?: string;
}

export interface UserscriptDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  hint?: string;
  action?: DiagnosticAction;
}

export interface UserscriptEnvironmentStatus {
  browserFound: boolean;
  browserName?: string;
  executablePath?: string;
  managedBrowserReachable: boolean;
  daemonReachable: boolean;
  extensionConnected: boolean;
  userScriptsAvailable: boolean;
  minimumRequirementsMet: boolean;
  publishServerReachable: boolean;
  diagnostics: UserscriptDiagnostic[];
}

export interface UserscriptWorkspaceStatus {
  projectExists: boolean;
  metadataValid: boolean;
  entryExists: boolean;
  buildExists: boolean;
  runtimeInstalled: boolean;
  publishConfigured: boolean;
  diagnostics?: UserscriptDiagnostic[];
}

export interface UserscriptNextStep {
  action:
    | "create_project"
    | "repair_metadata"
    | "create_entry"
    | "build"
    | "install"
    | "publish"
    | "debug";
  reason: string;
}

export function createUserscriptDiagnostic(
  level: DiagnosticLevel,
  code: string,
  message: string,
  hint?: string,
  action?: DiagnosticAction
): UserscriptDiagnostic {
  return {
    level,
    code,
    message,
    hint,
    action,
  };
}

export function deriveUserscriptNextStep(status: UserscriptWorkspaceStatus): UserscriptNextStep {
  if (!status.projectExists) {
    return { action: "create_project", reason: "Project root is missing" };
  }

  if (!status.metadataValid) {
    return { action: "repair_metadata", reason: "Userscript metadata is invalid" };
  }

  if (!status.entryExists) {
    return { action: "create_entry", reason: "Userscript entry file is missing" };
  }

  if (!status.buildExists) {
    return { action: "build", reason: "Build artifact has not been created yet" };
  }

  if (!status.runtimeInstalled) {
    return { action: "install", reason: "Userscript is not installed in the dev runtime" };
  }

  if (!status.publishConfigured) {
    return { action: "publish", reason: "Tampermonkey publish URLs are not configured" };
  }

  return { action: "debug", reason: "Workspace is ready for debugging" };
}
