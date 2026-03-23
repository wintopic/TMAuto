import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    project: "src/project.ts",
    environment: "src/environment.ts",
    "workspace-status": "src/workspace-status.ts",
    "tool-response": "src/tool-response.ts",
    workflow: "src/workflow.ts"
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/@bb-browser\/.*/]
});
