declare module "ws" {
  class WebSocket {
    _socket?: { unref?: () => void };
    constructor(url: string);
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    send(data: string): void;
    close(): void;
  }

  export default WebSocket;
}
