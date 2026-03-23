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

export async function isDaemonRunning(): Promise<boolean> {
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

export async function ensureDaemon(): Promise<void> {
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

export async function fetchDaemonStatus(): Promise<DaemonStatus | null> {
  try {
    await ensureDaemon();
    const response = await fetch(`${DAEMON_BASE_URL}/status`);
    if (!response.ok) return null;
    return (await response.json()) as DaemonStatus;
  } catch {
    return null;
  }
}

export async function sendCommand(request: Request): Promise<Response> {
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

export async function runCommand(request: Omit<Request, "id">): Promise<Response> {
  return sendCommand({ id: generateId(), ...request });
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function responseError(response: Response) {
  return errorResult(response.error || "Unknown error");
}

export function textResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

export async function getCapabilities(): Promise<BrowserCapabilities> {
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
