export const SUPPORTED_USERSCRIPT_GRANTS = [
  "GM_getValue",
  "GM_setValue",
  "GM_deleteValue",
  "GM_listValues",
  "GM_addStyle",
  "GM_xmlhttpRequest",
  "GM_openInTab",
] as const;

export type SupportedUserscriptGrant = (typeof SUPPORTED_USERSCRIPT_GRANTS)[number];

export interface UserscriptMetadata {
  name: string;
  namespace?: string;
  version: string;
  description?: string;
  match: string[];
  include: string[];
  exclude: string[];
  grant: string[];
  runAt?: "document-start" | "document-end" | "document-idle";
  noframes?: boolean;
  downloadURL?: string;
  updateURL?: string;
}

export interface UserscriptProjectPayload {
  projectId: string;
  scriptId: string;
  version: string;
  code: string;
  metadata: UserscriptMetadata;
  enabled?: boolean;
}

export interface UserscriptNetworkSummary {
  id: string;
  type: "gm_xmlhttpRequest";
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface UserscriptLogEntry {
  cursor: number;
  scriptId: string;
  projectId: string;
  level: "log" | "info" | "warn" | "error" | "debug" | "network" | "storage";
  message: string;
  timestamp: string;
  url?: string;
  details?: unknown;
}

export interface UserscriptStorageSnapshot {
  scriptId: string;
  projectId: string;
  values: Record<string, unknown>;
}

export interface UserscriptPublishInfo {
  host: string;
  port: number;
  installUrl: string;
  updateUrl: string;
  scriptPath: string;
}

export interface UserscriptRuntimeInfo {
  scriptId: string;
  projectId: string;
  version: string;
  enabled: boolean;
  matches: string[];
  grants: string[];
  installUrl?: string;
  logCursor?: number;
  errors?: UserscriptLogEntry[];
  networkSummary?: UserscriptNetworkSummary[];
}

export interface UserscriptValidationResult {
  valid: boolean;
  errors: string[];
}

function parseBooleanFlag(value: string): boolean {
  if (!value) return true;
  return value === "true";
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function createUserscriptMetadata(
  partial: Partial<UserscriptMetadata> & Pick<UserscriptMetadata, "name">
): UserscriptMetadata {
  return {
    name: partial.name,
    namespace: partial.namespace,
    version: partial.version || "0.1.0",
    description: partial.description,
    match: dedupe(partial.match || []),
    include: dedupe(partial.include || []),
    exclude: dedupe(partial.exclude || []),
    grant: dedupe(partial.grant || []),
    runAt: partial.runAt,
    noframes: partial.noframes,
    downloadURL: partial.downloadURL,
    updateURL: partial.updateURL,
  };
}

export function parseUserscriptMetadata(source: string): UserscriptMetadata {
  const match = source.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!match) {
    throw new Error("Userscript metadata block not found");
  }

  const partial: Partial<UserscriptMetadata> & { name?: string } = {
    match: [],
    include: [],
    exclude: [],
    grant: [],
  };

  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    const metadataMatch = line.match(/^\/\/\s*@([^\s]+)\s*(.*)$/);
    if (!metadataMatch) continue;

    const [, key, rawValue] = metadataMatch;
    const value = rawValue.trim();

    switch (key) {
      case "name":
        partial.name = value;
        break;
      case "namespace":
        partial.namespace = value;
        break;
      case "version":
        partial.version = value;
        break;
      case "description":
        partial.description = value;
        break;
      case "match":
        partial.match!.push(value);
        break;
      case "include":
        partial.include!.push(value);
        break;
      case "exclude":
        partial.exclude!.push(value);
        break;
      case "grant":
        partial.grant!.push(value);
        break;
      case "run-at":
        if (value === "document-start" || value === "document-end" || value === "document-idle") {
          partial.runAt = value;
        }
        break;
      case "noframes":
        partial.noframes = parseBooleanFlag(value);
        break;
      case "downloadURL":
        partial.downloadURL = value;
        break;
      case "updateURL":
        partial.updateURL = value;
        break;
      default:
        break;
    }
  }

  if (!partial.name) {
    throw new Error("Userscript metadata is missing @name");
  }

  return createUserscriptMetadata(partial as Partial<UserscriptMetadata> & Pick<UserscriptMetadata, "name">);
}

export function validateUserscriptMetadata(metadata: UserscriptMetadata): UserscriptValidationResult {
  const errors: string[] = [];
  const supportedGrants = new Set<string>(SUPPORTED_USERSCRIPT_GRANTS);

  if (!metadata.name.trim()) {
    errors.push("Metadata field @name is required");
  }

  if (!metadata.version.trim()) {
    errors.push("Metadata field @version is required");
  }

  if (metadata.match.length === 0 && metadata.include.length === 0) {
    errors.push("At least one @match or @include rule is required");
  }

  for (const grant of metadata.grant) {
    if (!supportedGrants.has(grant)) {
      errors.push(`Unsupported @grant: ${grant}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertSupportedUserscriptMetadata(metadata: UserscriptMetadata): void {
  const validation = validateUserscriptMetadata(metadata);
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }
}

export function buildUserscriptMetadataBlock(metadata: UserscriptMetadata): string {
  const lines = [
    "// ==UserScript==",
    `// @name ${metadata.name}`,
    metadata.namespace ? `// @namespace ${metadata.namespace}` : undefined,
    `// @version ${metadata.version}`,
    metadata.description ? `// @description ${metadata.description}` : undefined,
    ...metadata.match.map((value) => `// @match ${value}`),
    ...metadata.include.map((value) => `// @include ${value}`),
    ...metadata.exclude.map((value) => `// @exclude ${value}`),
    ...metadata.grant.map((value) => `// @grant ${value}`),
    metadata.runAt ? `// @run-at ${metadata.runAt}` : undefined,
    metadata.noframes ? "// @noframes" : undefined,
    metadata.downloadURL ? `// @downloadURL ${metadata.downloadURL}` : undefined,
    metadata.updateURL ? `// @updateURL ${metadata.updateURL}` : undefined,
    "// ==/UserScript==",
  ].filter((line): line is string => Boolean(line));

  return `${lines.join("\n")}\n`;
}
