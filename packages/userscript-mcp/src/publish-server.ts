import type { UserscriptPublishInfo } from "@bb-browser/shared";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";

interface PublishedRecord {
  filePath: string;
  routePath: string;
}

export class LocalPublishServer {
  private server: Server | null = null;
  private host = "127.0.0.1";
  private port = 0;
  private published = new Map<string, PublishedRecord>();

  async start(host = "127.0.0.1", port = 0): Promise<void> {
    if (this.server && this.host === host && (port === 0 || this.port === port)) {
      return;
    }

    if (this.server) {
      await this.stop();
    }

    this.host = host;
    this.port = port;
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolvePromise, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, host, () => {
        const address = this.server!.address();
        if (typeof address === "object" && address) {
          this.port = address.port;
        }
        resolvePromise();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolvePromise) => this.server!.close(() => resolvePromise()));
    this.server = null;
  }

  async publish(scriptId: string, filePath: string): Promise<UserscriptPublishInfo> {
    await this.start(this.host, this.port);

    const routePath = `/userscripts/${encodeURIComponent(scriptId)}.user.js`;
    this.published.set(scriptId, { filePath, routePath });

    const baseUrl = `http://${this.host}:${this.port}`;
    const installUrl = `${baseUrl}${routePath}`;

    return {
      host: this.host,
      port: this.port,
      installUrl,
      updateUrl: installUrl,
      scriptPath: filePath,
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestPath = request.url || "/";
    const record = Array.from(this.published.values()).find((entry) => entry.routePath === requestPath);

    if (!record) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const contents = await readFile(record.filePath, "utf8");
      response.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(contents);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  }
}

export const localPublishServer = new LocalPublishServer();
