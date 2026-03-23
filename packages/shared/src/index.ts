/**
 * @bb-browser/shared
 * 共享类型和工具函数
 */

export {
  type ActionType,
  type BrowserCapabilities,
  type ConsoleMessageInfo,
  type DaemonStatus,
  type JSErrorInfo,
  type NetworkRequestInfo,
  type Request,
  type RefInfo,
  type Response,
  type ResponseData,
  type SnapshotData,
  type SSEEvent,
  type SSEEventType,
  type TabInfo,
  type TraceEvent,
  type TraceStatus,
  generateId,
} from "./protocol.js";

export {
  SUPPORTED_USERSCRIPT_GRANTS,
  type SupportedUserscriptGrant,
  type UserscriptLogEntry,
  type UserscriptMetadata,
  type UserscriptNetworkSummary,
  type UserscriptProjectPayload,
  type UserscriptPublishInfo,
  type UserscriptRuntimeInfo,
  type UserscriptStorageSnapshot,
  type UserscriptValidationResult,
  assertSupportedUserscriptMetadata,
  buildUserscriptMetadataBlock,
  createUserscriptMetadata,
  parseUserscriptMetadata,
  validateUserscriptMetadata,
} from "./userscript.js";

export {
  COMMAND_TIMEOUT,
  DAEMON_BASE_URL,
  DAEMON_HOST,
  DAEMON_PORT,
  SSE_HEARTBEAT_INTERVAL,
  SSE_MAX_RECONNECT_ATTEMPTS,
  SSE_RECONNECT_DELAY,
} from "./constants.js";

export {
  type DiagnosticAction,
  type DiagnosticLevel,
  type UserscriptDiagnostic,
  type UserscriptEnvironmentStatus,
  type UserscriptNextStep,
  type UserscriptWorkspaceStatus,
  createUserscriptDiagnostic,
  deriveUserscriptNextStep,
} from "./userscript-status.js";

export { type RuntimePathOptions, type RuntimePaths, getRuntimePaths } from "./runtime-paths.js";
