/**
 * CLI 与 Chrome Extension 之间的通信协议类型定义
 */
import type {
  UserscriptLogEntry,
  UserscriptMetadata,
  UserscriptNetworkSummary,
  UserscriptProjectPayload,
  UserscriptPublishInfo,
  UserscriptRuntimeInfo,
  UserscriptStorageSnapshot,
} from "./userscript.js";

/** 支持的操作类型 */
export type ActionType =
  | "open"
  | "snapshot"
  | "click"
  | "hover"
  | "fill"
  | "type"
  | "check"
  | "uncheck"
  | "select"
  | "get"
  | "screenshot"
  | "close"
  | "wait"
  | "press"
  | "scroll"
  | "back"
  | "forward"
  | "refresh"
  | "eval"
  | "tab_list"
  | "tab_new"
  | "tab_select"
  | "tab_close"
  | "frame"
  | "frame_main"
  | "dialog"
  | "network"
  | "console"
  | "errors"
  | "trace"
  | "history"
  | "capabilities"
  | "cdp_call"
  | "userscript_install"
  | "userscript_update"
  | "userscript_uninstall"
  | "userscript_logs"
  | "userscript_storage"
  | "userscript_publish";

export interface BrowserCapabilities {
  extensionConnected: boolean;
  chromeVersion?: number;
  userScriptsAvailable: boolean;
  minimumRequirementsMet: boolean;
}

/** 请求类型 */
export interface Request {
  id: string;
  action: ActionType;
  url?: string;
  ref?: string;
  text?: string;
  attribute?: string;
  path?: string;
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
  maxResults?: number;
  script?: string;
  value?: string;
  index?: number;
  tabId?: number | string;
  selector?: string;
  dialogResponse?: "accept" | "dismiss";
  promptText?: string;
  networkCommand?: "requests" | "route" | "unroute" | "clear";
  routeOptions?: {
    abort?: boolean;
    body?: string;
    status?: number;
    headers?: Record<string, string>;
  };
  filter?: string;
  withBody?: boolean;
  consoleCommand?: "get" | "clear";
  errorsCommand?: "get" | "clear";
  traceCommand?: "start" | "stop" | "status";
  historyCommand?: "search" | "domains";
  key?: string;
  modifiers?: string[];
  direction?: string;
  pixels?: number;
  waitType?: string;
  ms?: number;
  cdpMethod?: string;
  cdpParams?: Record<string, unknown>;
  userscript?: Partial<UserscriptProjectPayload> & {
    metadata?: UserscriptMetadata;
    limit?: number;
    logCursor?: number;
    storageKey?: string;
    publishInfo?: Partial<UserscriptPublishInfo>;
  };
}

/** 元素引用信息 */
export interface RefInfo {
  backendDOMNodeId?: number;
  xpath?: string;
  role: string;
  name?: string;
  tagName?: string;
}

/** 标签页信息 */
export interface TabInfo {
  index: number;
  url: string;
  title: string;
  active: boolean;
  tabId: number | string;
}

/** Snapshot 命令返回的数据 */
export interface SnapshotData {
  snapshot: string;
  refs: Record<string, RefInfo>;
}

/** 网络请求信息 */
export interface NetworkRequestInfo {
  requestId: string;
  url: string;
  method: string;
  type: string;
  timestamp: number;
  status?: number;
  statusText?: string;
  failed?: boolean;
  failureReason?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  requestBodyTruncated?: boolean;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseBodyBase64?: boolean;
  responseBodyTruncated?: boolean;
  mimeType?: string;
  bodyError?: string;
}

/** 控制台消息 */
export interface ConsoleMessageInfo {
  type: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

/** JS 错误信息 */
export interface JSErrorInfo {
  message: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: string;
  timestamp: number;
}

/** Trace 事件类型 */
export interface TraceEvent {
  type: "click" | "fill" | "select" | "check" | "press" | "scroll" | "navigation";
  timestamp: number;
  url: string;
  ref?: number;
  xpath?: string;
  cssSelector?: string;
  selectorCandidates?: string[];
  relatedRequests?: Array<{
    requestId: string;
    url: string;
    method: string;
    status?: number;
  }>;
  value?: string;
  key?: string;
  direction?: "up" | "down" | "left" | "right";
  pixels?: number;
  checked?: boolean;
  elementRole?: string;
  elementName?: string;
  elementTag?: string;
}

/** Trace 录制状态 */
export interface TraceStatus {
  recording: boolean;
  eventCount: number;
  tabId?: number;
}

/** 响应数据 */
export interface ResponseData {
  [key: string]: unknown;
  title?: string;
  url?: string;
  tabId?: number | string;
  snapshotData?: SnapshotData;
  value?: string;
  screenshotPath?: string;
  dataUrl?: string;
  result?: unknown;
  tabs?: TabInfo[];
  activeIndex?: number;
  capabilities?: BrowserCapabilities;
  cdpResult?: unknown;
  userscript?: UserscriptRuntimeInfo;
  userscriptLogs?: UserscriptLogEntry[];
  userscriptStorage?: UserscriptStorageSnapshot;
  userscriptPublish?: UserscriptPublishInfo;
  userscriptNetworkSummary?: UserscriptNetworkSummary[];
  frameInfo?: {
    selector?: string;
    name?: string;
    url?: string;
    frameId?: number | string;
  };
  dialog?: {
    armed: boolean;
    response: "accept" | "dismiss";
  };
  dialogInfo?: {
    type: string;
    message: string;
    handled: boolean;
  };
  networkRequests?: NetworkRequestInfo[];
  routeCount?: number;
  consoleMessages?: ConsoleMessageInfo[];
  jsErrors?: JSErrorInfo[];
  traceEvents?: TraceEvent[];
  traceStatus?: TraceStatus;
  role?: string;
  name?: string;
  waited?: number;
  ref?: string;
  wasAlreadyChecked?: boolean;
  wasAlreadyUnchecked?: boolean;
  selectedValue?: string;
  selectedLabel?: string;
  historyItems?: Array<{
    url: string;
    title: string;
    visitCount: number;
    lastVisitTime: number;
  }>;
  historyDomains?: Array<{
    domain: string;
    visits: number;
    titles: string[];
  }>;
}

/** 响应类型 */
export interface Response {
  id: string;
  success: boolean;
  data?: ResponseData;
  error?: string;
}

/** SSE 事件类型 */
export type SSEEventType = "connected" | "heartbeat" | "command";

/** SSE 事件数据 */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

/** Daemon 状态 */
export interface DaemonStatus {
  running: boolean;
  extensionConnected: boolean;
  pendingRequests: number;
  uptime: number;
}

export function generateId(): string {
  const cryptoObject = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  return `bb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
