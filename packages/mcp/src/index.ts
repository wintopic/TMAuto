import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  COMMAND_TIMEOUT,
  DAEMON_BASE_URL,
  generateId,
  type BrowserCapabilities,
  type DaemonStatus,
  type Request,
  type Response,
} from "@bb-browser/shared";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

declare const __BB_BROWSER_VERSION__: string;

const EXT_HINT = [
  "Chrome extension not connected.",
  "",
  "1. 下载扩展压缩包: https://github.com/wintopic/TMAuto/releases/latest",
  "2. Unzip the downloaded file",
  "3. Open chrome://extensions/ and enable Developer Mode",
  "4. Click \"Load unpacked\" and select the unzipped folder",
].join("\n");

function getDaemonPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const sameDirPath = resolve(currentDir, "daemon.js");
  if (existsSync(sameDirPath)) return sameDirPath;
  return resolve(currentDir, "../../daemon/dist/index.js");
}

async function isDaemonRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${DAEMON_BASE_URL}/status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureDaemon(): Promise<void> {
  if (await isDaemonRunning()) return;

  const child = spawn(process.execPath, [getDaemonPath()], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  for (let index = 0; index < 25; index += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    if (await isDaemonRunning()) return;
  }
}

async function fetchDaemonStatus(): Promise<DaemonStatus | null> {
  try {
    await ensureDaemon();
    const response = await fetch(`${DAEMON_BASE_URL}/status`);
    if (!response.ok) return null;
    return (await response.json()) as DaemonStatus;
  } catch {
    return null;
  }
}

async function sendCommand(request: Request): Promise<Response> {
  await ensureDaemon();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COMMAND_TIMEOUT);

  try {
    const response = await fetch(`${DAEMON_BASE_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 503) {
      return { id: request.id, success: false, error: EXT_HINT };
    }

    return (await response.json()) as Response;
  } catch {
    clearTimeout(timeoutId);
    return {
      id: request.id,
      success: false,
      error: "Failed to start daemon. Run manually: bb-browser daemon",
    };
  }
}

async function runCommand(request: Omit<Request, "id">): Promise<Response> {
  return sendCommand({ id: generateId(), ...request });
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function responseError(response: Response) {
  return errorResult(response.error || "Unknown error");
}

function textResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function imageResult(dataUrl: string) {
  return {
    content: [
      {
        type: "image" as const,
        data: dataUrl.replace(/^data:image\/png;base64,/, ""),
        mimeType: "image/png",
      },
    ],
  };
}

function parseKey(key: string): { mainKey: string; modifiers?: string[] } | null {
  const parts = key.split("+");
  const modifierNames = new Set(["Control", "Alt", "Shift", "Meta"]);
  const modifiers = parts.filter((part) => modifierNames.has(part));
  const mainKey = parts.find((part) => !modifierNames.has(part));
  if (!mainKey) return null;
  return { mainKey, modifiers };
}

function buildFetchScript(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): string {
  const method = (options.method || "GET").toUpperCase();
  const hasBody = typeof options.body === "string" && method !== "GET" && method !== "HEAD";
  const headers = options.headers || {};

  return `(async () => {
    try {
      const response = await fetch(${JSON.stringify(url)}, {
        method: ${JSON.stringify(method)},
        credentials: "include",
        headers: ${JSON.stringify(headers)}${hasBody ? `,\n        body: ${JSON.stringify(options.body)}` : ""}
      });
      const contentType = response.headers.get("content-type") || "";
      let body;
      if (contentType.includes("application/json") && response.status !== 204) {
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }
      } else {
        body = await response.text();
      }
      return JSON.stringify({
        status: response.status,
        ok: response.ok,
        finalUrl: response.url,
        contentType,
        body
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })()`;
}

function matchTabOrigin(tabUrl: string, targetHostname: string): boolean {
  try {
    const tabHostname = new URL(tabUrl).hostname;
    return tabHostname === targetHostname || tabHostname.endsWith(`.${targetHostname}`);
  } catch {
    return false;
  }
}

async function ensureTabForOrigin(origin: string, hostname: string): Promise<number | string | undefined> {
  const listResponse = await runCommand({ action: "tab_list" });
  if (listResponse.success && listResponse.data?.tabs) {
    const matchingTab = listResponse.data.tabs.find((tab) => matchTabOrigin(tab.url, hostname));
    if (matchingTab) {
      return matchingTab.tabId;
    }
  }

  const newTabResponse = await runCommand({ action: "tab_new", url: origin });
  if (!newTabResponse.success) {
    throw new Error(newTabResponse.error || `Unable to open ${origin}`);
  }

  return newTabResponse.data?.tabId;
}

async function runFetchCommand(args: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  tab?: number | string;
}) {
  let targetTab = args.tab;
  const isAbsolute = args.url.startsWith("http://") || args.url.startsWith("https://");

  if (isAbsolute && targetTab === undefined) {
    const parsed = new URL(args.url);
    targetTab = await ensureTabForOrigin(parsed.origin, parsed.hostname);
  }

  const response = await runCommand({
    action: "eval",
    script: buildFetchScript(args.url, {
      method: args.method,
      headers: args.headers,
      body: args.body,
    }),
    tabId: targetTab,
  });

  if (!response.success) return responseError(response);

  const rawResult = response.data?.result;
  if (typeof rawResult !== "string") {
    return textResult(rawResult ?? null);
  }

  try {
    const parsed = JSON.parse(rawResult) as {
      error?: string;
      status?: number;
      ok?: boolean;
      finalUrl?: string;
      contentType?: string;
      body?: unknown;
    };

    if (parsed.error) {
      return errorResult(parsed.error);
    }

    return textResult(parsed);
  } catch {
    return textResult(rawResult);
  }
}

async function getCapabilities(): Promise<BrowserCapabilities> {
  const status = await fetchDaemonStatus();
  if (!status || !status.extensionConnected) {
    return {
      extensionConnected: false,
      userScriptsAvailable: false,
      minimumRequirementsMet: false,
    };
  }

  const response = await runCommand({ action: "capabilities" });
  if (!response.success || !response.data?.capabilities) {
    return {
      extensionConnected: true,
      userScriptsAvailable: false,
      minimumRequirementsMet: false,
    };
  }

  return response.data.capabilities;
}

const server = new McpServer(
  { name: "bb-browser", version: __BB_BROWSER_VERSION__ },
  {
    instructions: `bb-browser lets you control the user's real Chrome browser with their login state, cookies, and sessions.

Core tools:
- browser_capabilities: Detect browser/runtime support such as chrome.userScripts
- browser_snapshot: Read page content via the accessibility tree and get refs for interaction
- browser_click/fill/type/check/uncheck/select/press/scroll: Interact with real DOM elements
- browser_eval and browser_cdp_call: Escape hatches for DOM and raw CDP access
- browser_network/browser_console/browser_errors/browser_trace: Reverse engineering and debugging
- browser_fetch: Run authenticated fetch() in page context
- browser_frame_select/browser_frame_main/browser_dialog_handle: Handle complex frame/dialog flows
- browser_history/browser_tab_list/browser_tab_new/browser_close: Inspect history and manage tabs

Site adapters:
- Run via CLI: bb-browser site <name> [args]
- Update adapters: bb-browser site update
- List all adapters: bb-browser site list`,
  }
);

server.tool("browser_capabilities", "Inspect browser automation and userscript runtime support", {}, async () =>
  textResult(await getCapabilities())
);

server.tool(
  "browser_snapshot",
  "Get accessibility tree snapshot of the current page",
  {
    tab: z.number().optional().describe("Tab ID to target (omit for active tab)"),
    interactive: z.boolean().optional().describe("Only show interactive elements"),
  },
  async ({ tab, interactive }) => {
    const response = await runCommand({ action: "snapshot", interactive, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data?.snapshotData?.snapshot || "(empty)");
  }
);

server.tool(
  "browser_click",
  "Click an element by ref",
  {
    ref: z.string().describe("Element ref from snapshot"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, tab }) => {
    const response = await runCommand({ action: "click", ref, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Clicked");
  }
);

server.tool(
  "browser_hover",
  "Hover over an element by ref",
  {
    ref: z.string().describe("Element ref from snapshot"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, tab }) => {
    const response = await runCommand({ action: "hover", ref, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Hovered");
  }
);

server.tool(
  "browser_fill",
  "Fill text into an input after clearing it",
  {
    ref: z.string().describe("Element ref from snapshot"),
    text: z.string().describe("Text to fill"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, text, tab }) => {
    const response = await runCommand({ action: "fill", ref, text, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Filled");
  }
);

server.tool(
  "browser_type",
  "Type text into an input without clearing it",
  {
    ref: z.string().describe("Element ref from snapshot"),
    text: z.string().describe("Text to type"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, text, tab }) => {
    const response = await runCommand({ action: "type", ref, text, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Typed");
  }
);

server.tool(
  "browser_check",
  "Check a checkbox element by ref",
  {
    ref: z.string().describe("Element ref from snapshot"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, tab }) => {
    const response = await runCommand({ action: "check", ref, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Checked");
  }
);

server.tool(
  "browser_uncheck",
  "Uncheck a checkbox element by ref",
  {
    ref: z.string().describe("Element ref from snapshot"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, tab }) => {
    const response = await runCommand({ action: "uncheck", ref, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Unchecked");
  }
);

server.tool(
  "browser_select",
  "Select an option in a select element by ref",
  {
    ref: z.string().describe("Element ref from snapshot"),
    value: z.string().describe("Option value or label to select"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ ref, value, tab }) => {
    const response = await runCommand({ action: "select", ref, value, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Selected");
  }
);

server.tool(
  "browser_open",
  "Navigate to a URL",
  {
    url: z.string().describe("URL to open"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ url, tab }) => {
    const response = await runCommand({ action: "open", url, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || `Opened ${url}`);
  }
);

server.tool("browser_tab_list", "List all tabs", {}, async () => {
  const response = await runCommand({ action: "tab_list" });
  if (!response.success) return responseError(response);
  return textResult(response.data?.tabs || []);
});

server.tool(
  "browser_tab_new",
  "Open a new tab",
  {
    url: z.string().optional().describe("Optional URL to open"),
  },
  async ({ url }) => {
    const response = await runCommand({ action: "tab_new", url });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Opened new tab");
  }
);

server.tool(
  "browser_press",
  "Press a keyboard key",
  {
    key: z.string().describe("Key name to press, for example Enter or Control+a"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ key, tab }) => {
    const parsed = parseKey(key);
    if (!parsed) return errorResult("Invalid key format");
    const response = await runCommand({
      action: "press",
      key: parsed.mainKey,
      modifiers: parsed.modifiers,
      tabId: tab,
    });
    if (!response.success) return responseError(response);
    return textResult(response.data || `Pressed ${key}`);
  }
);

server.tool(
  "browser_scroll",
  "Scroll the page",
  {
    direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
    pixels: z.number().optional().default(500).describe("Scroll distance in pixels"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ direction, pixels, tab }) => {
    const response = await runCommand({ action: "scroll", direction, pixels, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || `Scrolled ${direction} ${pixels}px`);
  }
);

server.tool(
  "browser_eval",
  "Execute JavaScript in page context",
  {
    script: z.string().describe("JavaScript source to execute"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ script, tab }) => {
    const response = await runCommand({ action: "eval", script, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data?.result ?? null);
  }
);

server.tool(
  "browser_fetch",
  "Run authenticated fetch() in browser page context",
  {
    url: z.string().describe("Absolute or relative URL to fetch"),
    method: z.string().optional().describe("HTTP method, defaults to GET"),
    headers: z.record(z.string()).optional().describe("Optional headers"),
    body: z.string().optional().describe("Optional request body"),
    tab: z.number().optional().describe("Optional tab ID to target"),
  },
  async ({ url, method, headers, body, tab }) => runFetchCommand({ url, method, headers, body, tab })
);

server.tool(
  "browser_network",
  "Inspect or clear recorded network activity",
  {
    command: z.enum(["requests", "clear"]).describe("Network command"),
    filter: z.string().optional().describe("Optional URL substring filter"),
    withBody: z.boolean().optional().describe("Include request and response bodies"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ command, filter, withBody, tab }) => {
    const response = await runCommand({
      action: "network",
      networkCommand: command,
      filter,
      withBody,
      tabId: tab,
    });
    if (!response.success) return responseError(response);
    return textResult(command === "requests" ? response.data?.networkRequests || [] : response.data || "Cleared");
  }
);

server.tool(
  "browser_network_route",
  "Add a network route/mock rule for the current tab",
  {
    pattern: z.string().describe("URL substring or wildcard pattern"),
    abort: z.boolean().optional().describe("Abort matching requests"),
    body: z.string().optional().describe("Mock response body"),
    status: z.number().optional().describe("Mock response status"),
    headers: z.record(z.string()).optional().describe("Mock response headers"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ pattern, abort, body, status, headers, tab }) => {
    const response = await runCommand({
      action: "network",
      networkCommand: "route",
      url: pattern,
      routeOptions: { abort, body, status, headers },
      tabId: tab,
    });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Route added");
  }
);

server.tool(
  "browser_network_unroute",
  "Remove a network route/mock rule",
  {
    pattern: z.string().optional().describe("Optional pattern to remove; omit to remove all"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ pattern, tab }) => {
    const response = await runCommand({
      action: "network",
      networkCommand: "unroute",
      url: pattern,
      tabId: tab,
    });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Route removed");
  }
);

server.tool(
  "browser_screenshot",
  "Take a screenshot",
  {
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ tab }) => {
    const response = await runCommand({ action: "screenshot", tabId: tab });
    if (!response.success) return responseError(response);
    const dataUrl = response.data?.dataUrl;
    if (typeof dataUrl !== "string") return errorResult("Screenshot data missing");
    return imageResult(dataUrl);
  }
);

server.tool(
  "browser_get",
  "Get element text or attribute",
  {
    attribute: z.enum(["text", "url", "title", "value", "html"]).describe("Attribute to retrieve"),
    ref: z.string().optional().describe("Optional element ref"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ attribute, ref, tab }) => {
    const response = await runCommand({ action: "get", attribute, ref, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data?.value ?? "");
  }
);

server.tool(
  "browser_close",
  "Close the current or specified tab",
  {
    tab: z.number().optional().describe("Tab ID to close"),
  },
  async ({ tab }) => {
    const response = await runCommand({ action: tab === undefined ? "close" : "tab_close", tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || "Closed tab");
  }
);

server.tool(
  "browser_wait",
  "Wait for a number of milliseconds",
  {
    time: z.number().describe("Time to wait in milliseconds"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ time, tab }) => {
    const response = await runCommand({ action: "wait", waitType: "time", ms: time, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data || `Waited ${time}ms`);
  }
);

server.tool(
  "browser_frame_select",
  "Switch to an iframe by CSS selector",
  {
    selector: z.string().describe("CSS selector used to find the iframe"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ selector, tab }) => {
    const response = await runCommand({ action: "frame", selector, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data?.frameInfo || "Switched frame");
  }
);

server.tool(
  "browser_frame_main",
  "Return to the main frame",
  {
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ tab }) => {
    const response = await runCommand({ action: "frame_main", tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(response.data?.frameInfo || "Switched to main frame");
  }
);

server.tool(
  "browser_dialog_handle",
  "Accept or dismiss a JavaScript dialog",
  {
    action: z.enum(["accept", "dismiss"]).describe("Dialog action"),
    promptText: z.string().optional().describe("Optional prompt input when accepting"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ action, promptText, tab }) => {
    const response = await runCommand({
      action: "dialog",
      dialogResponse: action,
      promptText,
      tabId: tab,
    });
    if (!response.success) return responseError(response);
    return textResult(response.data?.dialogInfo || "Dialog handled");
  }
);

server.tool(
  "browser_console",
  "Read or clear console messages captured for a tab",
  {
    command: z.enum(["get", "clear"]).describe("Console command"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ command, tab }) => {
    const response = await runCommand({ action: "console", consoleCommand: command, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(command === "get" ? response.data?.consoleMessages || [] : response.data || "Cleared");
  }
);

server.tool(
  "browser_errors",
  "Read or clear JavaScript errors captured for a tab",
  {
    command: z.enum(["get", "clear"]).describe("Errors command"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ command, tab }) => {
    const response = await runCommand({ action: "errors", errorsCommand: command, tabId: tab });
    if (!response.success) return responseError(response);
    return textResult(command === "get" ? response.data?.jsErrors || [] : response.data || "Cleared");
  }
);

server.tool(
  "browser_trace",
  "Start, stop, or inspect trace recording for a tab",
  {
    command: z.enum(["start", "stop", "status"]).describe("Trace command"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ command, tab }) => {
    const response = await runCommand({ action: "trace", traceCommand: command, tabId: tab });
    if (!response.success) return responseError(response);
    if (command === "stop") {
      return textResult({
        traceStatus: response.data?.traceStatus,
        traceEvents: response.data?.traceEvents || [],
      });
    }
    return textResult(response.data?.traceStatus || {});
  }
);

server.tool(
  "browser_history",
  "Search browser history or inspect top domains",
  {
    command: z.enum(["search", "domains"]).describe("History command"),
    query: z.string().optional().describe("Search query for history search"),
    days: z.number().optional().default(30).describe("Look back this many days"),
    limit: z.number().optional().default(100).describe("Maximum results for history search"),
  },
  async ({ command, query, days, limit }) => {
    const response = await runCommand({
      action: "history",
      historyCommand: command,
      text: query,
      ms: days,
      maxResults: limit,
    });
    if (!response.success) return responseError(response);
    return textResult(command === "search" ? response.data?.historyItems || [] : response.data?.historyDomains || []);
  }
);

server.tool(
  "browser_cdp_call",
  "Call a raw Chrome DevTools Protocol method on the current tab",
  {
    method: z.string().describe("CDP method name, for example DOM.getDocument"),
    params: z.record(z.unknown()).optional().describe("Optional CDP params"),
    tab: z.number().optional().describe("Tab ID to target"),
  },
  async ({ method, params, tab }) => {
    const response = await runCommand({
      action: "cdp_call",
      cdpMethod: method,
      cdpParams: params,
      tabId: tab,
    });
    if (!response.success) return responseError(response);
    return textResult(response.data?.cdpResult ?? null);
  }
);

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startMcpServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
