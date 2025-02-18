import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    'react',
    'react-dom',
    '@lumix/types',
    '@lumix/adapter-sqlite',
    '@langchain/core',
    'langchain',
    'antd',
    'echarts',
    'echarts-for-react',
    'sqlite3',
    'uuid',
    'zod'
  ]
});
