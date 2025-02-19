import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainType } from "../types";
import { SocialAnalyzerTool } from "./social-analyzer";

export interface MarketSentiment {
  overall: {
    score: number;
    label: "BULLISH" | "NEUTRAL" | "BEARISH";
    confidence: number;
  };
  components: {
    social: {
      score: number;
      weight: number;
      confidence: number;
      factors: {
        name: string;
        impact: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        description: string;
      }[];
    };
    technical: {
      score: number;
      weight: number;
      confidence: number;
      factors: {
        name: string;
        impact: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        description: string;
      }[];
    };
    fundamental: {
      score: number;
      weight: number;
      confidence: number;
      factors: {
        name: string;
        impact: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        description: string;
      }[];
    };
  };
  trends: {
    shortTerm: {
      direction: "UP" | "DOWN" | "SIDEWAYS";
      strength: number;
      duration: number;
    };
    mediumTerm: {
      direction: "UP" | "DOWN" | "SIDEWAYS";
      strength: number;
      duration: number;
    };
    longTerm: {
      direction: "UP" | "DOWN" | "SIDEWAYS";
      strength: number;
      duration: number;
    };
  };
  signals: {
    type: "BUY" | "SELL" | "HOLD";
    strength: number;
    timeframe: "SHORT" | "MEDIUM" | "LONG";
    rationale: string;
  }[];
}

export interface SentimentAnalyzerConfig {
  weights: {
    social: number;
    technical: number;
    fundamental: number;
  };
  thresholds: {
    bullish: number;
    bearish: number;
    signalStrength: number;
  };
  timeframes: {
    shortTerm: number;
    mediumTerm: number;
    longTerm: number;
  };
  updateInterval: number;
}

export class SentimentAnalyzerTool extends Tool {
  name = "sentiment_analyzer";
  description = "Analyzes market sentiment and generates trading signals";
  
  private config: SentimentAnalyzerConfig;
  private socialAnalyzer: SocialAnalyzerTool;
  private cache: Map<string, {
    sentiment: MarketSentiment;
    timestamp: number;
  }>;

  constructor(
    socialAnalyzer: SocialAnalyzerTool,
    config: Partial<SentimentAnalyzerConfig> = {}
  ) {
    super();
    this.socialAnalyzer = socialAnalyzer;
    this.config = {
      weights: {
        social: 0.3,
        technical: 0.4,
        fundamental: 0.3
      },
      thresholds: {
        bullish: 0.6,
        bearish: 0.4,
        signalStrength: 0.7
      },
      timeframes: {
        shortTerm: 24 * 60 * 60 * 1000, // 1天
        mediumTerm: 7 * 24 * 60 * 60 * 1000, // 1周
        longTerm: 30 * 24 * 60 * 60 * 1000 // 1月
      },
      updateInterval: 3600000, // 1小时
      ...config
    };
    this.cache = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "analyze-sentiment":
          const sentiment = await this.analyzeSentiment(params.token);
          return JSON.stringify(sentiment, null, 2);
        
        case "get-signals":
          const signals = await this.getSignals(params.token);
          return JSON.stringify(signals, null, 2);
        
        case "get-trends":
          const trends = await this.getTrends(params.token);
          return JSON.stringify(trends, null, 2);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Sentiment Analyzer Tool", error.message);
      }
      throw error;
    }
  }

  private async analyzeSentiment(token: { address: string; chain: ChainType }): Promise<MarketSentiment> {
    // 检查缓存
    const cacheKey = `${token.chain}:${token.address}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.updateInterval) {
      return cached.sentiment;
    }

    try {
      // 获取社交媒体情绪
      const socialSentiment = await this.analyzeSocialSentiment(token);

      // 获取技术分析情绪
      const technicalSentiment = await this.analyzeTechnicalSentiment(token);

      // 获取基本面情绪
      const fundamentalSentiment = await this.analyzeFundamentalSentiment(token);

      // 计算整体情绪
      const overallScore = 
        socialSentiment.score * this.config.weights.social +
        technicalSentiment.score * this.config.weights.technical +
        fundamentalSentiment.score * this.config.weights.fundamental;

      // 计算置信度
      const overallConfidence = 
        socialSentiment.confidence * this.config.weights.social +
        technicalSentiment.confidence * this.config.weights.technical +
        fundamentalSentiment.confidence * this.config.weights.fundamental;

      // 获取趋势
      const trends = await this.analyzeTrends(token);

      // 生成信号
      const signals = this.generateSignals(
        overallScore,
        overallConfidence,
        trends
      );

      const sentiment: MarketSentiment = {
        overall: {
          score: overallScore,
          label: this.getSentimentLabel(overallScore),
          confidence: overallConfidence
        },
        components: {
          social: {
            score: socialSentiment.score,
            weight: this.config.weights.social,
            confidence: socialSentiment.confidence,
            factors: socialSentiment.factors
          },
          technical: {
            score: technicalSentiment.score,
            weight: this.config.weights.technical,
            confidence: technicalSentiment.confidence,
            factors: technicalSentiment.factors
          },
          fundamental: {
            score: fundamentalSentiment.score,
            weight: this.config.weights.fundamental,
            confidence: fundamentalSentiment.confidence,
            factors: fundamentalSentiment.factors
          }
        },
        trends,
        signals
      };

      // 更新缓存
      this.cache.set(cacheKey, {
        sentiment,
        timestamp: Date.now()
      });

      return sentiment;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Sentiment Analyzer Tool",
          `Failed to analyze sentiment for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzeSocialSentiment(token: { address: string; chain: ChainType }): Promise<{
    score: number;
    confidence: number;
    factors: MarketSentiment["components"]["social"]["factors"];
  }> {
    try {
      // 获取社交媒体数据
      const socialMetrics = await this.socialAnalyzer._call(JSON.stringify({
        action: "get-metrics",
        token
      }));

      const metrics = JSON.parse(socialMetrics);
      const factors: MarketSentiment["components"]["social"]["factors"] = [];

      // 评估提及度
      if (metrics.mentions.total > 1000) {
        factors.push({
          name: "mention_volume",
          impact: "POSITIVE",
          description: "High social media mention volume"
        });
      } else if (metrics.mentions.total < 100) {
        factors.push({
          name: "mention_volume",
          impact: "NEGATIVE",
          description: "Low social media mention volume"
        });
      }

      // 评估情感比例
      const positiveRatio = metrics.mentions.positive / metrics.mentions.total;
      if (positiveRatio > 0.7) {
        factors.push({
          name: "sentiment_ratio",
          impact: "POSITIVE",
          description: "Strong positive sentiment dominance"
        });
      } else if (positiveRatio < 0.3) {
        factors.push({
          name: "sentiment_ratio",
          impact: "NEGATIVE",
          description: "High negative sentiment presence"
        });
      }

      // 评估参与度
      const engagementRate = metrics.engagement.totalEngagement / metrics.reach.uniqueUsers;
      if (engagementRate > 0.1) {
        factors.push({
          name: "engagement_rate",
          impact: "POSITIVE",
          description: "High user engagement rate"
        });
      } else if (engagementRate < 0.01) {
        factors.push({
          name: "engagement_rate",
          impact: "NEGATIVE",
          description: "Low user engagement rate"
        });
      }

      // 计算总分
      const score = factors.reduce((sum, factor) => {
        switch (factor.impact) {
          case "POSITIVE": return sum + 1;
          case "NEGATIVE": return sum - 1;
          default: return sum;
        }
      }, 0) / (factors.length || 1);

      // 计算置信度
      const confidence = Math.min(
        1,
        metrics.mentions.total / 1000 * 0.5 + // 基于提及量
        Math.abs(positiveRatio - 0.5) * 2 * 0.3 + // 基于情感极性
        engagementRate * 10 * 0.2 // 基于参与度
      );

      return {
        score: (score + 1) / 2, // 归一化到 0-1
        confidence,
        factors
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Sentiment Analyzer Tool",
          `Failed to analyze social sentiment: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzeTechnicalSentiment(token: { address: string; chain: ChainType }): Promise<{
    score: number;
    confidence: number;
    factors: MarketSentiment["components"]["technical"]["factors"];
  }> {
    // TODO: 实现技术分析
    return {
      score: 0.5,
      confidence: 0.5,
      factors: []
    };
  }

  private async analyzeFundamentalSentiment(token: { address: string; chain: ChainType }): Promise<{
    score: number;
    confidence: number;
    factors: MarketSentiment["components"]["fundamental"]["factors"];
  }> {
    // TODO: 实现基本面分析
    return {
      score: 0.5,
      confidence: 0.5,
      factors: []
    };
  }

  private async analyzeTrends(token: { address: string; chain: ChainType }): Promise<MarketSentiment["trends"]> {
    try {
      // 获取社交趋势数据
      const socialTrends = await this.socialAnalyzer._call(JSON.stringify({
        action: "analyze-trends",
        token
      }));

      const trends = JSON.parse(socialTrends);

      // 分析不同时间周期的趋势
      return {
        shortTerm: this.analyzeTrendPeriod(trends.daily.slice(-1)),
        mediumTerm: this.analyzeTrendPeriod(trends.daily.slice(-7)),
        longTerm: this.analyzeTrendPeriod(trends.daily.slice(-30))
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Sentiment Analyzer Tool",
          `Failed to analyze trends: ${error.message}`
        );
      }
      throw error;
    }
  }

  private analyzeTrendPeriod(data: any[]): MarketSentiment["trends"]["shortTerm"] {
    if (!data || data.length === 0) {
      return {
        direction: "SIDEWAYS",
        strength: 0,
        duration: 0
      };
    }

    // 计算趋势方向
    const sentiments = data.map(d => d.sentiment);
    const avgSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    const lastSentiment = sentiments[sentiments.length - 1];

    let direction: "UP" | "DOWN" | "SIDEWAYS";
    if (Math.abs(lastSentiment - avgSentiment) < 0.1) {
      direction = "SIDEWAYS";
    } else {
      direction = lastSentiment > avgSentiment ? "UP" : "DOWN";
    }

    // 计算趋势强度
    const strength = Math.min(
      1,
      Math.abs(lastSentiment - avgSentiment) * 2
    );

    // 计算趋势持续时间
    const duration = data.length;

    return {
      direction,
      strength,
      duration
    };
  }

  private generateSignals(
    score: number,
    confidence: number,
    trends: MarketSentiment["trends"]
  ): MarketSentiment["signals"] {
    const signals: MarketSentiment["signals"] = [];

    // 生成短期信号
    if (confidence >= this.config.thresholds.signalStrength) {
      if (score >= this.config.thresholds.bullish && trends.shortTerm.direction === "UP") {
        signals.push({
          type: "BUY",
          strength: Math.min(score * confidence, 1),
          timeframe: "SHORT",
          rationale: "Strong bullish sentiment with upward trend"
        });
      } else if (score <= this.config.thresholds.bearish && trends.shortTerm.direction === "DOWN") {
        signals.push({
          type: "SELL",
          strength: Math.min((1 - score) * confidence, 1),
          timeframe: "SHORT",
          rationale: "Strong bearish sentiment with downward trend"
        });
      }
    }

    // 生成中期信号
    if (
      trends.mediumTerm.strength >= this.config.thresholds.signalStrength &&
      trends.mediumTerm.duration >= 5
    ) {
      if (trends.mediumTerm.direction === "UP") {
        signals.push({
          type: "BUY",
          strength: trends.mediumTerm.strength,
          timeframe: "MEDIUM",
          rationale: "Sustained upward trend in medium term"
        });
      } else if (trends.mediumTerm.direction === "DOWN") {
        signals.push({
          type: "SELL",
          strength: trends.mediumTerm.strength,
          timeframe: "MEDIUM",
          rationale: "Sustained downward trend in medium term"
        });
      }
    }

    // 生成长期信号
    if (
      trends.longTerm.strength >= this.config.thresholds.signalStrength &&
      trends.longTerm.duration >= 20
    ) {
      if (trends.longTerm.direction === "UP") {
        signals.push({
          type: "BUY",
          strength: trends.longTerm.strength,
          timeframe: "LONG",
          rationale: "Strong long-term upward trend"
        });
      } else if (trends.longTerm.direction === "DOWN") {
        signals.push({
          type: "SELL",
          strength: trends.longTerm.strength,
          timeframe: "LONG",
          rationale: "Strong long-term downward trend"
        });
      }
    }

    // 如果没有明确信号，添加观望建议
    if (signals.length === 0) {
      signals.push({
        type: "HOLD",
        strength: Math.max(0.5, confidence),
        timeframe: "SHORT",
        rationale: "No clear directional signals present"
      });
    }

    return signals;
  }

  private async getSignals(token: { address: string; chain: ChainType }): Promise<MarketSentiment["signals"]> {
    const sentiment = await this.analyzeSentiment(token);
    return sentiment.signals;
  }

  private async getTrends(token: { address: string; chain: ChainType }): Promise<MarketSentiment["trends"]> {
    const sentiment = await this.analyzeSentiment(token);
    return sentiment.trends;
  }

  private getSentimentLabel(score: number): MarketSentiment["overall"]["label"] {
    if (score >= this.config.thresholds.bullish) {
      return "BULLISH";
    } else if (score <= this.config.thresholds.bearish) {
      return "BEARISH";
    }
    return "NEUTRAL";
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<SentimentAnalyzerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 