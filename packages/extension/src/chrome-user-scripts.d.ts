declare namespace chrome {
  const userScripts: {
    configureWorld?: (options: { csp?: string; messaging?: boolean }) => Promise<void>;
    register: (scripts: Array<Record<string, unknown>>) => Promise<void>;
    unregister: (filter?: { ids?: string[] }) => Promise<void>;
    getScripts?: (filter?: { ids?: string[] }) => Promise<Array<Record<string, unknown>>>;
  };

  namespace runtime {
    const onUserScriptMessage:
      | chrome.events.Event<
          (
            message: unknown,
            sender: MessageSender,
            sendResponse: (response?: unknown) => void
          ) => void
        >
      | undefined;
  }
}

export {};
