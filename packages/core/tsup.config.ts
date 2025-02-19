import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  noExternal: [
    '@lumix/types',
    '@lumix/adapter-sqlite'
  ],
  external: [
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
  ]
});
