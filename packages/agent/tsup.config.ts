import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    resolve: true,
    entry: {
      index: "src/index.ts",
      agent: "src/agent.ts"
    }
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  bundle: true,
  external: [
    "@lumix/core",
    "@lumix/models",
    "@lumix/tools",
    "@langchain/core/tools",
    "@langchain/core/messages",
    "langchain/agents",
    "zod"
  ]
});
