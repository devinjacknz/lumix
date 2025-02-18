import { PluginRegistry } from '@lumix/core';
import { PriceOraclePlugin } from '@lumix/plugin-price-oracle';
import { DeFiCrawlerPlugin } from '@lumix/plugin-defi-crawler';
import { TokenAnalyzerPlugin } from '@lumix/plugin-token-analyzer';
import { NebulaPlugin } from '@lumix/plugin-nebula';
import { ChainType, PriceSourceType } from '@lumix/plugin-price-oracle';

async function main() {
  try {
    // 获取插件注册表实例
    const registry = PluginRegistry.getInstance();

    // 初始化插件系统
    await registry.initialize({
      heliusApiKey: process.env.HELIUS_API_KEY,
      ethRpcUrl: process.env.ETH_RPC_URL,
      solanaRpcUrl: process.env.SOLANA_RPC_URL,
      baseRpcUrl: process.env.BASE_RPC_URL,
      openAiApiKey: process.env.OPENAI_API_KEY
    });

    // 获取各个插件实例
    const priceOracle = registry.getPlugin<PriceOraclePlugin>('price-oracle');
    const defiCrawler = registry.getPlugin<DeFiCrawlerPlugin>('defi-crawler');
    const tokenAnalyzer = registry.getPlugin<TokenAnalyzerPlugin>('token-analyzer');
    const nebula = registry.getPlugin<NebulaPlugin>('nebula');

    if (!priceOracle || !defiCrawler || !tokenAnalyzer || !nebula) {
      throw new Error('Failed to get plugin instances');
    }

    // 使用价格预言机获取价格
    const ethPrice = await priceOracle.getPrice({
      chain: ChainType.ETH,
      baseToken: 'ETH',
      quoteToken: 'USD'
    });
    console.log('ETH Price:', ethPrice);

    const solPrice = await priceOracle.getPrice({
      chain: ChainType.SOLANA,
      baseToken: 'SOL',
      quoteToken: 'USD'
    });
    console.log('SOL Price:', solPrice);

    // 使用 DeFi 爬虫分析合约
    const contractAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Uniswap V2 Router
    const contractAnalysis = await defiCrawler.analyzeContract(contractAddress);
    console.log('Contract Analysis:', contractAnalysis);

    // 使用 Token 分析器分析代币
    const tokenAddress = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
    const tokenMetrics = await tokenAnalyzer.getTokenMetrics(tokenAddress);
    console.log('Token Metrics:', tokenMetrics);

    // 使用 Nebula 进行智能分析
    const analysis = await nebula.chat({
      messages: [{
        role: 'user',
        content: `分析以下合约: ${contractAddress}`
      }]
    });
    console.log('Nebula Analysis:', analysis);

    // 获取聚合价格数据
    const aggregatedPrice = await priceOracle.getAggregatedPrice({
      chain: ChainType.ETH,
      baseToken: 'ETH',
      quoteToken: 'USD'
    });
    console.log('Aggregated ETH Price:', aggregatedPrice);

    // 分析流动性
    const liquidityAnalysis = await defiCrawler.analyzeLiquidity(contractAddress, 1); // chainId 1 for Ethereum
    console.log('Liquidity Analysis:', liquidityAnalysis);

    // 生成 DeFi 报告
    const report = await defiCrawler.generateReport('uniswap');
    console.log('DeFi Report:', report);

    // 关闭插件系统
    await registry.shutdown();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// 运行示例
main().catch(console.error); 