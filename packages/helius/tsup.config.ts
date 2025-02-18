import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts"],
  format: ["cjs", "esm"],
  dts: {
    resolve: true,
    entry: {
      index: "src/index.ts",
      client: "src/client.ts"
    }
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  bundle: true,
  external: [
    "@lumix/core",
    "@solana/web3.js",
    "ws"
  ]
});
