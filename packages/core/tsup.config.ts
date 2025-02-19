import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  noExternal: [
    '@lumix/types',
    '@lumix/adapter-sqlite'
  ],
  external: [
    'redis',
    'lru-cache',
    'events',
    'react',
    'react-dom',
    '@langchain/core',
    'langchain',
    'antd',
    'echarts',
    'echarts-for-react',
    'sqlite3',
    'uuid',
    'zod',
    'ethers',
    '@solana/web3.js',
    'bs58'
  ],
});
