import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    "@aws-sdk/client-kms",
    "sqlite3",
    "zod",
    "uuid",
    "bs58"
  ],
  noExternal: ["@lumix/types"]
});
