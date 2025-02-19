import { BaseTool } from './base';
import { MarketAnalyzer } from '../analysis/analyzer';
import { ChainType } from '../types/chain';
import { MarketDataToolConfig, ToolResult } from './types';
import { z } from 'zod';

export class MarketDataTool extends BaseTool {
  private analyzer: MarketAnalyzer;
  private chain: ChainType;
  private timeframe: string;

  constructor(config: MarketDataToolConfig) {
    super({
      name: config.name || 'market_data',
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

  async execute(input: any): Promise<ToolResult> {
    try {
      const params = typeof input === 'string' ? JSON.parse(input) : input;
      const asset = params.asset || params.input;
      const timeframe = params.timeframe || this.timeframe;

      if (!asset) {
        return {
          success: false,
          error: 'Asset parameter is required'
        };
      }

      const result = await this.analyzer.analyzeMarket({
        chain: this.chain,
        asset,
        timeframe
      });

      return {
        success: true,
        data: {
          metrics: result.metrics,
          trend: result.trend,
          signals: result.signals,
          condition: result.condition
        },
        metadata: {
          chain: this.chain,
          timeframe,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          chain: this.chain,
          timestamp: Date.now()
        }
      };
    }
  }
} 