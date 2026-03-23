import { getRuntimePaths, type RuntimePathOptions } from "@bb-browser/shared";
import { existsSync } from "node:fs";
import path from "node:path";

export interface BrowserCandidate {
  browserName: string;
  executablePath: string;
  source: "env" | "known-path" | "path";
}

export interface DiscoverBrowserCandidateOptions {
  platform?: NodeJS.Platform | string;
  env?: Record<string, string | undefined>;
  pathEntries?: string[];
  fileExists?: (candidate: string) => boolean;
}

interface BrowserPathCandidate {
  browserName: string;
  executablePath: string;
}

function resolvePlatform(options?: DiscoverBrowserCandidateOptions): string {
  return options?.platform || process.platform;
}

function resolveEnv(options?: DiscoverBrowserCandidateOptions): Record<string, string | undefined> {
  return options?.env || process.env;
}

function resolveFileExists(options?: DiscoverBrowserCandidateOptions): (candidate: string) => boolean {
  return options?.fileExists || existsSync;
}

function createKnownPathCandidates(platformName: string): BrowserPathCandidate[] {
  switch (platformName) {
    case "darwin":
      return [
        {
          browserName: "chrome",
          executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        },
        {
          browserName: "chrome-dev",
          executablePath: "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
        },
        {
          browserName: "chrome-canary",
          executablePath: "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        },
        {
          browserName: "edge",
          executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        },
        {
          browserName: "brave",
          executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        },
      ];
    case "win32":
      return [
        {
          browserName: "chrome",
          executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        },
        {
          browserName: "chrome",
          executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        },
        {
          browserName: "edge",
          executablePath: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        },
        {
          browserName: "edge",
          executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        },
        {
          browserName: "brave",
          executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        },
        {
          browserName: "brave",
          executablePath: "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        },
      ];
    default:
      return [];
  }
}

function createPathLookupNames(platformName: string): string[] {
  if (platformName === "win32") {
    return ["chrome.exe", "msedge.exe", "brave.exe", "chromium.exe"];
  }

  return ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "microsoft-edge", "brave-browser"];
}

function splitPathEntries(platformName: string, options?: DiscoverBrowserCandidateOptions): string[] {
  if (options?.pathEntries) {
    return options.pathEntries.filter(Boolean);
  }

  const rawPath = resolveEnv(options).PATH || "";
  if (!rawPath) return [];

  const separator = platformName === "win32" ? ";" : path.delimiter;
  return rawPath.split(separator).filter(Boolean);
}

function findFirstExisting(
  candidates: BrowserPathCandidate[],
  fileExists: (candidate: string) => boolean,
  source: BrowserCandidate["source"]
): BrowserCandidate | null {
  const match = candidates.find((candidate) => fileExists(candidate.executablePath));
  if (!match) return null;

  return {
    browserName: match.browserName,
    executablePath: match.executablePath,
    source,
  };
}

function fromEnvironment(options?: DiscoverBrowserCandidateOptions): BrowserCandidate | null {
  const env = resolveEnv(options);
  const fileExists = resolveFileExists(options);

  for (const key of ["BB_BROWSER_EXECUTABLE", "BB_BROWSER_PATH", "BROWSER"]) {
    const executablePath = env[key];
    if (executablePath && fileExists(executablePath)) {
      return {
        browserName: "custom",
        executablePath,
        source: "env",
      };
    }
  }

  return null;
}

function fromKnownPaths(options?: DiscoverBrowserCandidateOptions): BrowserCandidate | null {
  const platformName = resolvePlatform(options);
  return findFirstExisting(createKnownPathCandidates(platformName), resolveFileExists(options), "known-path");
}

function fromPathEntries(options?: DiscoverBrowserCandidateOptions): BrowserCandidate | null {
  const platformName = resolvePlatform(options);
  const entries = splitPathEntries(platformName, options);
  const candidates = createPathLookupNames(platformName).flatMap((fileName) =>
    entries.map((entry) => ({
      browserName: fileName.replace(/(\.exe|-browser|-stable)$/i, ""),
      executablePath: path.join(entry, fileName),
    }))
  );

  return findFirstExisting(candidates, resolveFileExists(options), "path");
}

export async function discoverBrowserCandidate(
  options?: DiscoverBrowserCandidateOptions
): Promise<BrowserCandidate | null> {
  return fromEnvironment(options) || fromKnownPaths(options) || fromPathEntries(options);
}

export function getDaemonPidFilePath(options?: RuntimePathOptions): string {
  return getRuntimePaths(options).pidFilePath;
}
