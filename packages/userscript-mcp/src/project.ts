import {
  assertSupportedUserscriptMetadata,
  buildUserscriptMetadataBlock,
  createUserscriptMetadata,
  type UserscriptMetadata,
} from "@bb-browser/shared";
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface UserscriptProjectInitOptions {
  rootDir: string;
  name: string;
  namespace?: string;
  description?: string;
  match: string[];
  include?: string[];
  exclude?: string[];
  grant?: string[];
  runAt?: UserscriptMetadata["runAt"];
  noframes?: boolean;
  force?: boolean;
}

export interface UserscriptProjectPaths {
  rootDir: string;
  srcDir: string;
  entryPath: string;
  metaPath: string;
  scenariosDir: string;
  defaultScenarioPath: string;
  distDir: string;
  distPath: string;
  projectId: string;
  scriptId: string;
}

export interface BuiltUserscriptProject {
  paths: UserscriptProjectPaths;
  metadata: UserscriptMetadata;
  code: string;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "userscript";
}

export function deriveProjectId(rootDir: string): string {
  return toSlug(path.basename(path.resolve(rootDir)));
}

export function deriveScriptId(rootDir: string, metadata: UserscriptMetadata): string {
  const pieces = [metadata.namespace, metadata.name].filter(Boolean) as string[];
  if (pieces.length === 0) {
    return deriveProjectId(rootDir);
  }
  return toSlug(pieces.join("-"));
}

export function getProjectPaths(rootDir: string, metadata?: UserscriptMetadata): UserscriptProjectPaths {
  const normalizedRoot = path.resolve(rootDir);
  const projectId = deriveProjectId(normalizedRoot);
  const scriptId = metadata ? deriveScriptId(normalizedRoot, metadata) : projectId;

  return {
    rootDir: normalizedRoot,
    srcDir: path.join(normalizedRoot, "src"),
    entryPath: path.join(normalizedRoot, "src", "main.ts"),
    metaPath: path.join(normalizedRoot, "meta.json"),
    scenariosDir: path.join(normalizedRoot, "scenarios"),
    defaultScenarioPath: path.join(normalizedRoot, "scenarios", "smoke.json"),
    distDir: path.join(normalizedRoot, "dist"),
    distPath: path.join(normalizedRoot, "dist", `${scriptId}.user.js`),
    projectId,
    scriptId,
  };
}

export async function readProjectMetadata(rootDir: string): Promise<UserscriptMetadata> {
  const metaPath = getProjectPaths(rootDir).metaPath;
  const raw = await readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<UserscriptMetadata>;

  const metadata = createUserscriptMetadata({
    name: parsed.name || deriveProjectId(rootDir),
    namespace: parsed.namespace,
    version: parsed.version,
    description: parsed.description,
    match: parsed.match || [],
    include: parsed.include || [],
    exclude: parsed.exclude || [],
    grant: parsed.grant || [],
    runAt: parsed.runAt,
    noframes: parsed.noframes,
    downloadURL: parsed.downloadURL,
    updateURL: parsed.updateURL,
  });

  assertSupportedUserscriptMetadata(metadata);
  return metadata;
}

export function injectPublishUrls(
  metadata: UserscriptMetadata,
  publishInfo?: { installUrl?: string; updateUrl?: string }
): UserscriptMetadata {
  return {
    ...metadata,
    downloadURL: publishInfo?.installUrl || metadata.downloadURL,
    updateURL: publishInfo?.updateUrl || metadata.updateURL,
  };
}

export async function initUserscriptProject(
  options: UserscriptProjectInitOptions
): Promise<{ paths: UserscriptProjectPaths; metadata: UserscriptMetadata }> {
  const metadata = createUserscriptMetadata({
    name: options.name,
    namespace: options.namespace,
    version: "0.1.0",
    description: options.description,
    match: options.match,
    include: options.include || [],
    exclude: options.exclude || [],
    grant: options.grant || ["GM_getValue", "GM_setValue"],
    runAt: options.runAt || "document-idle",
    noframes: options.noframes,
  });
  assertSupportedUserscriptMetadata(metadata);

  const paths = getProjectPaths(options.rootDir, metadata);
  if (!options.force && existsSync(paths.metaPath)) {
    throw new Error(`Project already exists at ${paths.rootDir}`);
  }

  await mkdir(paths.srcDir, { recursive: true });
  await mkdir(paths.scenariosDir, { recursive: true });
  await mkdir(paths.distDir, { recursive: true });

  await writeFile(paths.metaPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeFile(
    paths.entryPath,
    `async function main() {\n  const current = await GM_getValue("visitCount", 0);\n  await GM_setValue("visitCount", current + 1);\n  console.log("Userscript active", {\n    visits: current + 1,\n    url: location.href,\n  });\n}\n\nvoid main();\n`,
    "utf8"
  );
  await writeFile(
    paths.defaultScenarioPath,
    `${JSON.stringify(
      {
        url: metadata.match[0] || metadata.include[0] || "https://example.com/",
        steps: [{ type: "wait", ms: 500 }],
        assertions: [{ type: "element_exists", selector: "body" }],
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return { paths, metadata };
}

export async function buildUserscriptProject(
  rootDir: string,
  options?: { installUrl?: string; updateUrl?: string }
): Promise<BuiltUserscriptProject> {
  const metadata = injectPublishUrls(await readProjectMetadata(rootDir), options);
  assertSupportedUserscriptMetadata(metadata);

  const paths = getProjectPaths(rootDir, metadata);
  await mkdir(paths.distDir, { recursive: true });

  await build({
    entryPoints: [paths.entryPath],
    outfile: paths.distPath,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    legalComments: "none",
    banner: {
      js: buildUserscriptMetadataBlock(metadata),
    },
  });

  const code = await readFile(paths.distPath, "utf8");
  return {
    paths,
    metadata,
    code,
  };
}
