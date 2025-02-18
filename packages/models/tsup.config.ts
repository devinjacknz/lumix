import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    resolve: true,
    entry: {
      index: "src/index.ts",
      base: "src/base.ts",
      openai: "src/openai.ts"
    }
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  bundle: true,
  external: ["@lumix/core"]
});
