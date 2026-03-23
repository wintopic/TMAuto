import {
  assertSupportedUserscriptMetadata,
  type BrowserCapabilities,
  type UserscriptLogEntry,
  type UserscriptMetadata,
  type UserscriptNetworkSummary,
  type UserscriptProjectPayload,
  type UserscriptPublishInfo,
  type UserscriptRuntimeInfo,
  type UserscriptStorageSnapshot,
} from "@bb-browser/shared";

type UserscriptMessageType =
  | "log"
  | "error"
  | "gm_getValue"
  | "gm_setValue"
  | "gm_deleteValue"
  | "gm_listValues"
  | "gm_xmlhttpRequest"
  | "gm_openInTab";

interface UserscriptBridgeMessage {
  __bbUserscript: true;
  type: UserscriptMessageType;
  scriptId: string;
  projectId: string;
  url?: string;
  payload?: Record<string, unknown>;
}

interface InstalledUserscriptState {
  payload: UserscriptProjectPayload;
  enabled: boolean;
  publishInfo?: UserscriptPublishInfo;
}

const MAX_SCRIPT_LOGS = 500;
const MAX_SCRIPT_NETWORK_EVENTS = 100;

const installedScripts = new Map<string, InstalledUserscriptState>();
const scriptLogs = new Map<string, UserscriptLogEntry[]>();
const scriptStorage = new Map<string, Map<string, unknown>>();
const scriptNetwork = new Map<string, UserscriptNetworkSummary[]>();

let globalCursor = 0;
let worldConfigured = false;
let listenersInitialised = false;

function getChromeMajorVersion(): number | undefined {
  const ua = navigator.userAgent || "";
  const match = ua.match(/Chrom(?:e|ium)\/(\d+)/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function getBrowserCapabilities(extensionConnected = true): BrowserCapabilities {
  const chromeVersion = getChromeMajorVersion();
  const userScriptsAvailable =
    typeof chrome !== "undefined" &&
    typeof chrome.userScripts !== "undefined" &&
    typeof chrome.userScripts.register === "function";

  return {
    extensionConnected,
    chromeVersion,
    userScriptsAvailable,
    minimumRequirementsMet: Boolean(chromeVersion && chromeVersion >= 120 && userScriptsAvailable),
  };
}

function getUserscriptApi() {
  if (typeof chrome === "undefined" || typeof chrome.userScripts === "undefined") {
    throw new Error("chrome.userScripts is not available in this browser");
  }

  return chrome.userScripts;
}

async function ensureWorldConfigured(): Promise<void> {
  if (worldConfigured) return;
  const api = getUserscriptApi();
  if (typeof api.configureWorld === "function") {
    await api.configureWorld({ messaging: true });
  }
  worldConfigured = true;
}

function getStorageMap(scriptId: string): Map<string, unknown> {
  const current = scriptStorage.get(scriptId);
  if (current) return current;
  const created = new Map<string, unknown>();
  scriptStorage.set(scriptId, created);
  return created;
}

function setLog(entry: Omit<UserscriptLogEntry, "cursor">): UserscriptLogEntry {
  const logs = scriptLogs.get(entry.scriptId) || [];
  const next: UserscriptLogEntry = {
    ...entry,
    cursor: ++globalCursor,
  };

  logs.push(next);
  while (logs.length > MAX_SCRIPT_LOGS) {
    logs.shift();
  }

  scriptLogs.set(entry.scriptId, logs);
  return next;
}

function setNetworkEvent(scriptId: string, event: UserscriptNetworkSummary): void {
  const events = scriptNetwork.get(scriptId) || [];
  events.push(event);
  while (events.length > MAX_SCRIPT_NETWORK_EVENTS) {
    events.shift();
  }
  scriptNetwork.set(scriptId, events);
}

function getRuntimeInfo(scriptId: string): UserscriptRuntimeInfo {
  const state = installedScripts.get(scriptId);
  if (!state) {
    throw new Error(`Userscript ${scriptId} is not installed`);
  }

  const logs = scriptLogs.get(scriptId) || [];
  const latestCursor = logs.length > 0 ? logs[logs.length - 1].cursor : undefined;

  return {
    scriptId,
    projectId: state.payload.projectId,
    version: state.payload.version,
    enabled: state.enabled,
    matches:
      state.payload.metadata.match.length > 0
        ? [...state.payload.metadata.match]
        : [...state.payload.metadata.include],
    grants: [...state.payload.metadata.grant],
    installUrl: state.publishInfo?.installUrl,
    logCursor: latestCursor,
    errors: logs.filter((entry) => entry.level === "error").slice(-20),
    networkSummary: [...(scriptNetwork.get(scriptId) || [])],
  };
}

function getStorageSnapshot(scriptId: string, storageKey?: string): UserscriptStorageSnapshot {
  const state = installedScripts.get(scriptId);
  if (!state) {
    throw new Error(`Userscript ${scriptId} is not installed`);
  }

  const current = getStorageMap(scriptId);
  const values = Object.fromEntries(current.entries());

  if (!storageKey) {
    return {
      scriptId,
      projectId: state.payload.projectId,
      values,
    };
  }

  return {
    scriptId,
    projectId: state.payload.projectId,
    values: Object.prototype.hasOwnProperty.call(values, storageKey)
      ? { [storageKey]: values[storageKey] }
      : {},
  };
}

function getLogs(scriptId: string, cursor = 0, limit = 100): UserscriptLogEntry[] {
  return (scriptLogs.get(scriptId) || [])
    .filter((entry) => entry.cursor > cursor)
    .slice(0, Math.max(1, limit));
}

function createSelectorMatches(metadata: UserscriptMetadata): string[] {
  if (metadata.match.length > 0) {
    return metadata.match;
  }
  return ["<all_urls>"];
}

function buildPrelude(payload: UserscriptProjectPayload): string {
  const config = JSON.stringify({
    scriptId: payload.scriptId,
    projectId: payload.projectId,
    metadata: payload.metadata,
  });

  return `
(() => {
  const __bbConfig = ${config};
  const __bbGlobal = globalThis;
  const __bbSubscribersKey = "__bbUserscriptConsoleSubscribers";
  const __bbWrappedKey = "__bbUserscriptConsoleWrapped";
  const __bbSerialize = (value) => {
    if (typeof value === "undefined") return { type: "undefined" };
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      try {
        return String(value);
      } catch {
        return "[unserializable]";
      }
    }
  };
  const __bbFormatArgs = (args) => args.map((arg) => {
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(__bbSerialize(arg));
    } catch {
      return String(arg);
    }
  }).join(" ");
  const __bbSend = async (type, payload = {}) => chrome.runtime.sendMessage({
    __bbUserscript: true,
    type,
    scriptId: __bbConfig.scriptId,
    projectId: __bbConfig.projectId,
    url: __bbGlobal.location ? __bbGlobal.location.href : undefined,
    payload,
  });
  const __bbSubscribers = __bbGlobal[__bbSubscribersKey] || (__bbGlobal[__bbSubscribersKey] = []);
  __bbSubscribers.push({
    scriptId: __bbConfig.scriptId,
    projectId: __bbConfig.projectId,
    notify(level, args) {
      void __bbSend("log", {
        level,
        message: __bbFormatArgs(args),
        details: args.map((arg) => __bbSerialize(arg)),
      });
    },
  });
  if (!__bbGlobal[__bbWrappedKey]) {
    __bbGlobal[__bbWrappedKey] = true;
    for (const level of ["log", "info", "warn", "error", "debug"]) {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        const subscribers = __bbGlobal[__bbSubscribersKey] || [];
        for (const subscriber of subscribers) {
          try {
            subscriber.notify(level, args);
          } catch {
            // Ignore subscriber errors.
          }
        }
        original(...args);
      };
    }
  }
  __bbGlobal.addEventListener("error", (event) => {
    void __bbSend("error", {
      message: event.message || "Uncaught error",
      details: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });
  __bbGlobal.addEventListener("unhandledrejection", (event) => {
    void __bbSend("error", {
      message: event.reason ? String(event.reason) : "Unhandled promise rejection",
      details: __bbSerialize(event.reason),
    });
  });
  const GM_getValue = async (key, defaultValue) => {
    const response = await __bbSend("gm_getValue", { key, defaultValue });
    return response && Object.prototype.hasOwnProperty.call(response, "value") ? response.value : defaultValue;
  };
  const GM_setValue = async (key, value) => {
    await __bbSend("gm_setValue", { key, value: __bbSerialize(value) });
  };
  const GM_deleteValue = async (key) => {
    await __bbSend("gm_deleteValue", { key });
  };
  const GM_listValues = async () => {
    const response = await __bbSend("gm_listValues", {});
    return response && Array.isArray(response.values) ? response.values : [];
  };
  const GM_addStyle = (css) => {
    const style = document.createElement("style");
    style.textContent = String(css);
    (document.head || document.documentElement).appendChild(style);
    return style;
  };
  const GM_openInTab = async (url, options) => __bbSend("gm_openInTab", { url, options: __bbSerialize(options) });
  const GM_xmlhttpRequest = async (details) => {
    try {
      const response = await __bbSend("gm_xmlhttpRequest", { details: __bbSerialize(details) });
      if (details && typeof details.onload === "function") {
        details.onload(response);
      }
      return response;
    } catch (error) {
      if (details && typeof details.onerror === "function") {
        details.onerror(error);
      }
      throw error;
    }
  };
  __bbGlobal.GM_getValue = GM_getValue;
  __bbGlobal.GM_setValue = GM_setValue;
  __bbGlobal.GM_deleteValue = GM_deleteValue;
  __bbGlobal.GM_listValues = GM_listValues;
  __bbGlobal.GM_addStyle = GM_addStyle;
  __bbGlobal.GM_xmlhttpRequest = GM_xmlhttpRequest;
  __bbGlobal.GM_openInTab = GM_openInTab;
  __bbGlobal.GM_info = { script: __bbConfig.metadata };
  __bbGlobal.GM = Object.assign({}, __bbGlobal.GM || {}, {
    getValue: GM_getValue,
    setValue: GM_setValue,
    deleteValue: GM_deleteValue,
    listValues: GM_listValues,
    addStyle: GM_addStyle,
    xmlHttpRequest: GM_xmlhttpRequest,
    openInTab: GM_openInTab,
    info: __bbGlobal.GM_info,
  });
})();
`;
}

function toRegistration(payload: UserscriptProjectPayload): chrome.userScripts.RegisteredUserScript {
  const js = [{ code: buildPrelude(payload) }, { code: payload.code }];
  const runAtMap: Record<NonNullable<UserscriptMetadata["runAt"]>, chrome.userScripts.RunAt> = {
    "document-start": "document_start",
    "document-end": "document_end",
    "document-idle": "document_idle",
  };

  return {
    id: payload.scriptId,
    matches: createSelectorMatches(payload.metadata),
    includeGlobs: payload.metadata.include.length > 0 ? payload.metadata.include : undefined,
    excludeGlobs: payload.metadata.exclude.length > 0 ? payload.metadata.exclude : undefined,
    js,
    runAt: payload.metadata.runAt ? runAtMap[payload.metadata.runAt] : "document_idle",
    allFrames: payload.metadata.noframes ? false : true,
    world: "USER_SCRIPT",
  };
}

function applyPublishInfo(
  scriptId: string,
  publishInfo?: Partial<UserscriptPublishInfo>
): UserscriptPublishInfo | undefined {
  if (!publishInfo?.installUrl || !publishInfo.updateUrl || !publishInfo.scriptPath) {
    return undefined;
  }

  const port =
    typeof publishInfo.port === "number" && Number.isFinite(publishInfo.port) ? publishInfo.port : 0;
  return {
    host: publishInfo.host || "127.0.0.1",
    port,
    installUrl: publishInfo.installUrl,
    updateUrl: publishInfo.updateUrl,
    scriptPath: publishInfo.scriptPath,
  };
}

async function replaceRegistration(payload: UserscriptProjectPayload): Promise<void> {
  const api = getUserscriptApi();
  await ensureWorldConfigured();
  await api.unregister({ ids: [payload.scriptId] });
  await api.register([toRegistration(payload)]);
}

export async function installUserscript(
  payload: UserscriptProjectPayload,
  publishInfo?: Partial<UserscriptPublishInfo>
): Promise<UserscriptRuntimeInfo> {
  assertSupportedUserscriptMetadata(payload.metadata);
  await replaceRegistration(payload);

  installedScripts.set(payload.scriptId, {
    payload,
    enabled: payload.enabled ?? true,
    publishInfo: applyPublishInfo(payload.scriptId, publishInfo),
  });

  setLog({
    scriptId: payload.scriptId,
    projectId: payload.projectId,
    level: "info",
    message: `Installed userscript ${payload.scriptId}@${payload.version}`,
    timestamp: new Date().toISOString(),
  });

  return getRuntimeInfo(payload.scriptId);
}

export async function updateUserscript(
  payload: UserscriptProjectPayload,
  publishInfo?: Partial<UserscriptPublishInfo>
): Promise<UserscriptRuntimeInfo> {
  return installUserscript(payload, publishInfo);
}

export async function uninstallUserscript(scriptId: string): Promise<void> {
  const api = getUserscriptApi();
  await api.unregister({ ids: [scriptId] });
  installedScripts.delete(scriptId);
  scriptLogs.delete(scriptId);
  scriptStorage.delete(scriptId);
  scriptNetwork.delete(scriptId);
}

export function getUserscriptLogs(
  scriptId: string,
  cursor = 0,
  limit = 100
): { userscript: UserscriptRuntimeInfo; logs: UserscriptLogEntry[] } {
  return {
    userscript: getRuntimeInfo(scriptId),
    logs: getLogs(scriptId, cursor, limit),
  };
}

export function getUserscriptStorage(
  scriptId: string,
  storageKey?: string
): { userscript: UserscriptRuntimeInfo; storage: UserscriptStorageSnapshot } {
  return {
    userscript: getRuntimeInfo(scriptId),
    storage: getStorageSnapshot(scriptId, storageKey),
  };
}

export function publishUserscript(
  scriptId: string,
  publishInfo: Partial<UserscriptPublishInfo>
): { userscript: UserscriptRuntimeInfo; publish: UserscriptPublishInfo } {
  const state = installedScripts.get(scriptId);
  if (!state) {
    throw new Error(`Userscript ${scriptId} is not installed`);
  }

  const applied = applyPublishInfo(scriptId, publishInfo);
  if (!applied) {
    throw new Error("publishInfo must include installUrl, updateUrl, and scriptPath");
  }

  state.publishInfo = applied;
  installedScripts.set(scriptId, state);
  return {
    userscript: getRuntimeInfo(scriptId),
    publish: applied,
  };
}

async function performXmlHttpRequest(message: UserscriptBridgeMessage): Promise<unknown> {
  const details = (message.payload?.details || {}) as Record<string, unknown>;
  const method = typeof details.method === "string" ? details.method.toUpperCase() : "GET";
  const targetUrl = typeof details.url === "string" ? details.url : "";
  const headers =
    details.headers && typeof details.headers === "object" ? (details.headers as Record<string, string>) : undefined;
  const startedAt = new Date().toISOString();
  const eventId = `${message.scriptId}:${Date.now()}`;

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: typeof details.data === "string" ? details.data : undefined,
      credentials: "include",
    });

    const text = await response.text();
    const responseValue = {
      finalUrl: response.url,
      readyState: 4,
      responseHeaders: Array.from(response.headers.entries())
        .map(([name, value]) => `${name}: ${value}`)
        .join("\r\n"),
      responseText: text,
      response: text,
      status: response.status,
      statusText: response.statusText,
    };

    setNetworkEvent(message.scriptId, {
      id: eventId,
      type: "gm_xmlhttpRequest",
      method,
      url: targetUrl,
      status: response.status,
      ok: response.ok,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    setLog({
      scriptId: message.scriptId,
      projectId: message.projectId,
      level: "network",
      message: `${method} ${targetUrl} -> ${response.status}`,
      timestamp: new Date().toISOString(),
      url: targetUrl,
      details: responseValue,
    });

    return responseValue;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    setNetworkEvent(message.scriptId, {
      id: eventId,
      type: "gm_xmlhttpRequest",
      method,
      url: targetUrl,
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: errorMessage,
    });

    setLog({
      scriptId: message.scriptId,
      projectId: message.projectId,
      level: "error",
      message: `GM_xmlhttpRequest failed: ${method} ${targetUrl}`,
      timestamp: new Date().toISOString(),
      url: targetUrl,
      details: { error: errorMessage },
    });

    throw error;
  }
}

async function handleUserscriptMessage(message: UserscriptBridgeMessage): Promise<unknown> {
  switch (message.type) {
    case "log": {
      const levelValue = typeof message.payload?.level === "string" ? message.payload.level : "log";
      const level = ["log", "info", "warn", "error", "debug"].includes(levelValue) ? levelValue : "log";
      setLog({
        scriptId: message.scriptId,
        projectId: message.projectId,
        level: level as UserscriptLogEntry["level"],
        message:
          typeof message.payload?.message === "string" ? message.payload.message : `${message.scriptId} emitted a log`,
        timestamp: new Date().toISOString(),
        url: message.url,
        details: message.payload?.details,
      });
      return { ok: true };
    }

    case "error": {
      setLog({
        scriptId: message.scriptId,
        projectId: message.projectId,
        level: "error",
        message:
          typeof message.payload?.message === "string"
            ? message.payload.message
            : `${message.scriptId} emitted an error`,
        timestamp: new Date().toISOString(),
        url: message.url,
        details: message.payload?.details,
      });
      return { ok: true };
    }

    case "gm_getValue": {
      const key = typeof message.payload?.key === "string" ? message.payload.key : "";
      const values = getStorageMap(message.scriptId);
      if (!values.has(key)) {
        return { value: message.payload?.defaultValue };
      }
      return { value: values.get(key) };
    }

    case "gm_setValue": {
      const key = typeof message.payload?.key === "string" ? message.payload.key : "";
      const values = getStorageMap(message.scriptId);
      values.set(key, message.payload?.value);
      setLog({
        scriptId: message.scriptId,
        projectId: message.projectId,
        level: "storage",
        message: `Stored value for ${key}`,
        timestamp: new Date().toISOString(),
        url: message.url,
        details: { key, value: message.payload?.value },
      });
      return { ok: true };
    }

    case "gm_deleteValue": {
      const key = typeof message.payload?.key === "string" ? message.payload.key : "";
      const values = getStorageMap(message.scriptId);
      values.delete(key);
      setLog({
        scriptId: message.scriptId,
        projectId: message.projectId,
        level: "storage",
        message: `Deleted value for ${key}`,
        timestamp: new Date().toISOString(),
        url: message.url,
        details: { key },
      });
      return { ok: true };
    }

    case "gm_listValues": {
      const values = getStorageMap(message.scriptId);
      return { values: Array.from(values.keys()) };
    }

    case "gm_xmlhttpRequest":
      return performXmlHttpRequest(message);

    case "gm_openInTab": {
      const url = typeof message.payload?.url === "string" ? message.payload.url : undefined;
      if (!url) {
        throw new Error("GM_openInTab requires a url");
      }
      const tab = await chrome.tabs.create({ url, active: true });
      return { tabId: tab.id, url: tab.url };
    }

    default:
      throw new Error(`Unsupported userscript message type: ${(message as UserscriptBridgeMessage).type}`);
  }
}

function isUserscriptBridgeMessage(message: unknown): message is UserscriptBridgeMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<UserscriptBridgeMessage>;
  return candidate.__bbUserscript === true && typeof candidate.scriptId === "string";
}

function registerMessageListener(
  listener:
    | chrome.events.Event<
        (
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: unknown) => void
        ) => void
      >
    | undefined
): void {
  if (!listener) return;

  listener.addListener((message, _sender, sendResponse) => {
    if (!isUserscriptBridgeMessage(message)) {
      return false;
    }

    void handleUserscriptMessage(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });
}

function initialiseListeners(): void {
  if (listenersInitialised) return;
  listenersInitialised = true;

  registerMessageListener(chrome.runtime.onMessage);
  registerMessageListener(chrome.runtime.onUserScriptMessage);
}

initialiseListeners();
