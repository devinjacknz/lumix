import { BaseTool } from './base';
import { MarketAnalyzer } from '../ai/market-analyzer';
import { ChainProtocol } from '@lumix/types';
import { z } from 'zod';

export interface MarketDataToolConfig {
  name: string;
  description: string;
  analyzer: MarketAnalyzer;
  chain: ChainProtocol;
  timeframe?: string;
  parameters?: Record<string, string>;
}

export class MarketDataTool extends BaseTool {
  private analyzer: MarketAnalyzer;
  private chain: ChainProtocol;
  private timeframe: string;

  constructor(config: MarketDataToolConfig) {
    super({
      name: config.name || 'market-data',
      description: config.description || 'Analyzes market data for a given asset',
      parameters: {
        asset: 'The asset to analyze',
        timeframe: 'The timeframe to analyze (optional)'
      }
    });

    this.analyzer = config.analyzer;
    this.chain = config.chain;
    this.timeframe = config.timeframe || '1h';
  }

  async execute(input: string): Promise<unknown> {
    try {
      const params = JSON.parse(input);
      const asset = params.asset || params.input;
      const timeframe = params.timeframe || this.timeframe;

      if (!asset) {
        throw new Error('Asset parameter is required');
      }

      const result = await this.analyzer.analyzeMarket(
        asset,
        this.chain,
        timeframe
      );

      return {
        metrics: result.metrics,
        trend: result.trend,
        signals: result.signals,
        condition: result.condition
      };
    } catch (error) {
      throw new Error(`Market analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 