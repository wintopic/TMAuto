import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDaemonRunning } from "../daemon-manager.js";

export interface DaemonOptions {
  json?: boolean;
  host?: string;
}

function getDaemonEntryPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const bundledPath = resolve(currentDir, "../daemon.js");
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(currentDir, "../../daemon/dist/index.js");
}

export async function daemonCommand(args: string[] = []): Promise<void> {
  const daemonEntryPath = getDaemonEntryPath();
  const child = spawn(process.execPath, [daemonEntryPath, ...args], {
    stdio: "inherit",
  });

  await new Promise<void>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`bb-browser daemon exited with code ${code ?? 1}`));
    });
  });
}

export async function statusCommand(
  options: DaemonOptions = {}
): Promise<void> {
  const running = await isDaemonRunning();

  if (options.json) {
    console.log(JSON.stringify({ running }));
  } else {
    console.log(running ? "浏览器运行中" : "浏览器未运行");
  }
}
