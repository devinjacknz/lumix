import { AgentExecutor, initializeAgentExecutorWithOptions } from "langchain/agents";
import { BaseLanguageModel } from "langchain/base_language";
import { Tool } from "langchain/tools";
import { DeFiAnalyzerTool } from "../tools/defi-analyzer";
import { LiquidityAnalyzerTool } from "../tools/liquidity-analyzer";
import { DeFiEventHandlerTool } from "../tools/event-handler";
import { ProtocolAnalysisChain } from "../chains/protocol-analysis";
import { RiskAssessmentChain } from "../chains/risk-assessment";
import { LiquidityAnalysisChain } from "../chains/liquidity-analysis";
import { logger } from "@lumix/core";

export interface MarketAnalyzerConfig {
  model: BaseLanguageModel;
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  memory?: any;
}

export class MarketAnalyzer {
  private agent: AgentExecutor;
  private tools: Tool[];
  private chains: {
    protocol: ProtocolAnalysisChain;
    risk: RiskAssessmentChain;
    liquidity: LiquidityAnalysisChain;
  };

  constructor(
    private config: MarketAnalyzerConfig,
    defiAnalyzer: DeFiAnalyzerTool,
    liquidityAnalyzer: LiquidityAnalyzerTool,
    eventHandler: DeFiEventHandlerTool
  ) {
    // 初始化分析链
    this.chains = {
      protocol: new ProtocolAnalysisChain(defiAnalyzer, liquidityAnalyzer, eventHandler),
      risk: new RiskAssessmentChain(defiAnalyzer, liquidityAnalyzer, eventHandler),
      liquidity: new LiquidityAnalysisChain(liquidityAnalyzer, eventHandler)
    };

    // 创建工具
    this.tools = this.createTools();

    // 初始化代理
    this.initializeAgent();
  }

  private createTools(): Tool[] {
    return [
      new Tool({
        name: "analyze_protocol",
        description: "Analyzes a DeFi protocol's overall status and performance",
        func: async (input: string) => {
          try {
            const params = JSON.parse(input);
            const result = await this.chains.protocol._call({
              input: params
            });
            return JSON.stringify(result.output, null, 2);
          } catch (error) {
            if (error instanceof Error) {
              logger.error("Protocol Analysis", error.message);
            }
            throw error;
          }
        }
      }),
      new Tool({
        name: "assess_risk",
        description: "Performs comprehensive risk assessment for a DeFi protocol",
        func: async (input: string) => {
          try {
            const params = JSON.parse(input);
            const result = await this.chains.risk._call({
              input: params
            });
            return JSON.stringify(result.output, null, 2);
          } catch (error) {
            if (error instanceof Error) {
              logger.error("Risk Assessment", error.message);
            }
            throw error;
          }
        }
      }),
      new Tool({
        name: "analyze_liquidity",
        description: "Analyzes liquidity conditions and market depth",
        func: async (input: string) => {
          try {
            const params = JSON.parse(input);
            const result = await this.chains.liquidity._call({
              input: params
            });
            return JSON.stringify(result.output, null, 2);
          } catch (error) {
            if (error instanceof Error) {
              logger.error("Liquidity Analysis", error.message);
            }
            throw error;
          }
        }
      })
    ];
  }

  private async initializeAgent() {
    try {
      this.agent = await initializeAgentExecutorWithOptions(
        this.tools,
        this.config.model,
        {
          agentType: "zero-shot-react-description",
          maxIterations: this.config.maxIterations || 10,
          returnIntermediateSteps: this.config.returnIntermediateSteps || false,
          memory: this.config.memory,
          verbose: true
        }
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Market Analyzer", `Failed to initialize agent: ${error.message}`);
      }
      throw error;
    }
  }

  public async analyzeMarket(params: {
    protocol: string;
    options?: {
      includeRisk?: boolean;
      includeLiquidity?: boolean;
      timeframe?: {
        start: number;
        end: number;
      };
    };
  }): Promise<any> {
    try {
      const tasks = [];

      // 1. 基础协议分析
      tasks.push(
        this.agent.call({
          input: JSON.stringify({
            tool: "analyze_protocol",
            params: {
              protocol: params.protocol,
              options: params.options
            }
          })
        })
      );

      // 2. 风险评估
      if (params.options?.includeRisk) {
        tasks.push(
          this.agent.call({
            input: JSON.stringify({
              tool: "assess_risk",
              params: {
                protocol: params.protocol,
                timeframe: params.options.timeframe,
                options: {
                  includeHistoricalEvents: true
                }
              }
            })
          })
        );
      }

      // 3. 流动性分析
      if (params.options?.includeLiquidity) {
        tasks.push(
          this.agent.call({
            input: JSON.stringify({
              tool: "analyze_liquidity",
              params: {
                protocol: params.protocol,
                options: {
                  timeframe: params.options.timeframe,
                  includeHistoricalData: true,
                  includePriceImpact: true
                }
              }
            })
          })
        );
      }

      // 执行所有分析任务
      const results = await Promise.all(tasks);

      // 整合结果
      return this.aggregateResults(results);
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Market Analyzer", `Analysis failed: ${error.message}`);
      }
      throw error;
    }
  }

  private aggregateResults(results: any[]): any {
    try {
      const aggregated = {
        timestamp: Date.now(),
        protocol: null,
        analysis: null,
        risk: null,
        liquidity: null,
        recommendations: new Set()
      };

      results.forEach(result => {
        const parsed = JSON.parse(result);
        
        if (parsed.protocol) {
          aggregated.protocol = parsed.protocol;
        }

        if (parsed.analysis) {
          aggregated.analysis = parsed.analysis;
        }

        if (parsed.risk) {
          aggregated.risk = parsed.risk;
        }

        if (parsed.liquidity) {
          aggregated.liquidity = parsed.liquidity;
        }

        if (parsed.recommendations) {
          parsed.recommendations.forEach(rec => 
            aggregated.recommendations.add(rec)
          );
        }
      });

      // 转换建议集合为数组
      return {
        ...aggregated,
        recommendations: Array.from(aggregated.recommendations)
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Market Analyzer", `Failed to aggregate results: ${error.message}`);
      }
      throw error;
    }
  }
} 