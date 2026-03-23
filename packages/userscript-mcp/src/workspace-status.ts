import {
  createUserscriptDiagnostic,
  deriveUserscriptNextStep,
  type UserscriptDiagnostic,
  type UserscriptNextStep,
  type UserscriptWorkspaceStatus,
} from "@bb-browser/shared";
import { access } from "node:fs/promises";
import path from "node:path";
import { deriveProjectId, deriveScriptId, getProjectPaths, readProjectMetadata } from "./project.js";

export interface InspectUserscriptWorkspaceInput {
  rootDir: string;
  runtimeLookup: (scriptId: string) => Promise<boolean>;
}

export interface InspectedUserscriptWorkspace extends UserscriptWorkspaceStatus {
  projectId: string;
  scriptId: string;
  distPath: string;
  diagnostics: UserscriptDiagnostic[];
  nextStep: UserscriptNextStep;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function inspectUserscriptWorkspace(
  input: InspectUserscriptWorkspaceInput
): Promise<InspectedUserscriptWorkspace> {
  const rootDir = path.resolve(input.rootDir);
  const projectId = deriveProjectId(rootDir);
  const metaPath = path.join(rootDir, "meta.json");
  const entryPath = path.join(rootDir, "src", "main.ts");
  const diagnostics: UserscriptDiagnostic[] = [];

  const projectExists = await pathExists(rootDir);
  const entryExists = await pathExists(entryPath);
  const metaExists = await pathExists(metaPath);

  let metadataValid = false;
  let publishConfigured = false;
  let scriptId = projectId;
  let distPath = path.join(rootDir, "dist", `${projectId}.user.js`);

  try {
    const metadata = await readProjectMetadata(rootDir);
    metadataValid = true;
    publishConfigured = Boolean(metadata.downloadURL || metadata.updateURL);
    scriptId = deriveScriptId(rootDir, metadata);
    distPath = getProjectPaths(rootDir, metadata).distPath;
  } catch (error) {
    if (metaExists) {
      diagnostics.push(
        createUserscriptDiagnostic(
          "error",
          "invalid_metadata",
          error instanceof Error ? error.message : "Userscript metadata is invalid",
          "Fix meta.json so the userscript metadata can be parsed and validated."
        )
      );
    }
  }

  const buildExists = await pathExists(distPath);
  const runtimeInstalled = metadataValid ? await input.runtimeLookup(scriptId) : false;

  if (!projectExists) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "error",
        "missing_project",
        "Userscript project root does not exist",
        "Create the project first or point the tool at the correct rootDir."
      )
    );
  }

  if (!metaExists) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "error",
        "missing_metadata",
        "meta.json is missing",
        "Create a project scaffold or add a valid meta.json file."
      )
    );
  }

  if (!entryExists) {
    diagnostics.push(
      createUserscriptDiagnostic(
        "warn",
        "missing_entry",
        "src/main.ts is missing",
        "Add the userscript entry file before building."
      )
    );
  }

  const status: UserscriptWorkspaceStatus = {
    projectExists,
    metadataValid,
    entryExists,
    buildExists,
    runtimeInstalled,
    publishConfigured,
    diagnostics,
  };

  return {
    ...status,
    projectId,
    scriptId,
    distPath,
    diagnostics,
    nextStep: deriveUserscriptNextStep(status),
  };
}
