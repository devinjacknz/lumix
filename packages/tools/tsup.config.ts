import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    entry: {
      index: "src/index.ts"
    },
    resolve: true
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  bundle: true,
  external: [
    "@lumix/core",
    "@lumix/helius",
    "@langchain/core/tools",
    "zod"
  ]
});
