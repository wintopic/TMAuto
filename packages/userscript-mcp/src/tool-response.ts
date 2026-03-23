interface ToolTextContent {
  type: "text";
  text: string;
}

interface ToolResponse {
  [key: string]: unknown;
  content: ToolTextContent[];
  isError?: boolean;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function userscriptToolResult(value: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: toText(value) }],
  };
}

export function userscriptToolError(error: string, hint: string, action?: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error, hint, action }, null, 2),
      },
    ],
    isError: true,
  };
}
