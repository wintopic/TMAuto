export interface RuntimePathOptions {
  homeDir?: string;
  tmpDir?: string;
  platform?: string;
}

export interface RuntimePaths {
  runtimeDir: string;
  managedBrowserDir: string;
  managedUserDataDir: string;
  managedPortFile: string;
  pidFilePath: string;
}

function resolvePlatform(options?: RuntimePathOptions): string {
  if (options?.platform) return options.platform;
  if (typeof process !== "undefined" && process.platform) {
    return process.platform;
  }
  return "linux";
}

function resolveHomeDir(options?: RuntimePathOptions): string {
  if (options?.homeDir) return options.homeDir;
  if (typeof process !== "undefined") {
    return process.env.USERPROFILE || process.env.HOME || ".";
  }
  return ".";
}

function resolveTmpDir(options?: RuntimePathOptions): string {
  if (options?.tmpDir) return options.tmpDir;
  if (typeof process !== "undefined") {
    return process.env.TMPDIR || process.env.TEMP || process.env.TMP || resolveHomeDir(options);
  }
  return resolveHomeDir(options);
}

function joinPath(platform: string, ...parts: string[]): string {
  const separator = platform === "win32" ? "\\" : "/";
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return "";

  const [first, ...rest] = filtered;
  const normalizedFirst = first.replace(/[\\/]+$/g, "");

  return rest.reduce((current, part) => {
    const normalizedPart = part.replace(/^[\\/]+|[\\/]+$/g, "");
    return `${current}${separator}${normalizedPart}`;
  }, normalizedFirst);
}

export function getRuntimePaths(options?: RuntimePathOptions): RuntimePaths {
  const platform = resolvePlatform(options);
  const homeDir = resolveHomeDir(options);
  const tmpDir = resolveTmpDir(options);
  const runtimeDir = joinPath(platform, homeDir, ".bb-browser");
  const managedBrowserDir = joinPath(platform, runtimeDir, "browser");

  return {
    runtimeDir,
    managedBrowserDir,
    managedUserDataDir: joinPath(platform, managedBrowserDir, "user-data"),
    managedPortFile: joinPath(platform, managedBrowserDir, "cdp-port"),
    pidFilePath: joinPath(platform, tmpDir, "bb-browser", "bb-browser.pid"),
  };
}
