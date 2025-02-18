import { Tool } from "langchain/tools";
import { DeFiAnalyzer } from '../analyzer';
import { AnalysisReport, DeFiEvent } from '../types';
import { logger } from '@lumix/core';

export class DeFiAnalyzerTool extends Tool {
  name = 'defi-analyzer';
  description = 'Analyzes DeFi protocols and markets to provide insights and risk assessments';
  
  constructor(private analyzer: DeFiAnalyzer) {
    super();
  }

  /** @override */
  protected async _call(input: string): Promise<string> {
    try {
      const params = this.parseInput(input);
      
      switch (params.action) {
        case 'analyze-protocol':
          const report = await this.analyzer.analyzeProtocol(
            params.protocol,
            params.options
          );
          return this.formatAnalysisReport(report);

        case 'monitor-events':
          const events = await this.analyzer.monitorEvents(
            params.protocol,
            params.eventTypes,
            params.timeframe
          );
          return this.formatEvents(events);

        case 'assess-risk':
          const riskScore = await this.analyzer.assessRisk(
            params.protocol,
            params.metrics
          );
          return this.formatRiskScore(riskScore);

        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('DeFi Analyzer Tool', `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private parseInput(input: string): any {
    try {
      return JSON.parse(input);
    } catch (error) {
      throw new Error('Invalid input format. Expected JSON string.');
    }
  }

  private formatAnalysisReport(report: AnalysisReport): string {
    return JSON.stringify({
      protocol: report.protocol,
      timestamp: report.timestamp,
      metrics: {
        tvl: report.metrics.tvl,
        volume24h: report.metrics.volume24h,
        fees24h: report.metrics.fees24h,
        userCount: report.metrics.userCount
      },
      risks: report.risks,
      recommendations: report.recommendations
    }, null, 2);
  }

  private formatEvents(events: DeFiEvent[]): string {
    return JSON.stringify(events.map(event => ({
      type: event.type,
      protocol: event.protocol,
      timestamp: event.timestamp,
      data: event.data
    })), null, 2);
  }

  private formatRiskScore(score: number): string {
    return JSON.stringify({
      score,
      level: this.getRiskLevel(score),
      timestamp: new Date().toISOString()
    }, null, 2);
  }

  private getRiskLevel(score: number): string {
    if (score >= 8) return 'CRITICAL';
    if (score >= 6) return 'HIGH';
    if (score >= 4) return 'MEDIUM';
    if (score >= 2) return 'LOW';
    return 'MINIMAL';
  }
} 