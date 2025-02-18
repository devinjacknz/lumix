import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false, // Let TypeScript handle type generation
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  onSuccess: "tsc --emitDeclarationOnly --declaration --project tsconfig.json",
});
