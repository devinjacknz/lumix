import { Tool } from "langchain/tools";
import { logger } from "@lumix/core";
import { ChainType } from "../types";

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: number;
  summary: string;
  sentiment: {
    score: number;
    label: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    confidence: number;
  };
  impact: {
    score: number;
    level: "HIGH" | "MEDIUM" | "LOW";
    factors: string[];
  };
  categories: string[];
  entities: {
    name: string;
    type: string;
    sentiment: number;
  }[];
  keywords: string[];
}

export interface NewsMetrics {
  coverage: {
    total: number;
    sources: {
      name: string;
      articles: number;
      credibilityScore: number;
    }[];
    distribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  sentiment: {
    overall: number;
    trend: number;
    confidence: number;
    breakdown: {
      category: string;
      sentiment: number;
      articles: number;
    }[];
  };
  impact: {
    score: number;
    majorEvents: {
      date: string;
      title: string;
      impact: number;
      sentiment: number;
    }[];
    riskFactors: {
      factor: string;
      severity: number;
      trend: number;
    }[];
  };
}

export interface NewsAnalyzerConfig {
  sources: string[];
  apiKeys: Record<string, string>;
  updateInterval: number;
  maxArticles: number;
  minConfidence: number;
  categoryWeights: Record<string, number>;
  credibilityThresholds: {
    high: number;
    medium: number;
  };
}

export class NewsAnalyzerTool extends Tool {
  name = "news_analyzer";
  description = "Analyzes news articles and their impact on token sentiment";
  
  private config: NewsAnalyzerConfig;
  private cache: Map<string, {
    articles: NewsArticle[];
    metrics: NewsMetrics;
    timestamp: number;
  }>;

  constructor(config: Partial<NewsAnalyzerConfig> = {}) {
    super();
    this.config = {
      sources: [
        "coindesk",
        "cointelegraph",
        "theblock",
        "decrypt",
        "bloomberg",
        "reuters"
      ],
      apiKeys: {},
      updateInterval: 3600000, // 1小时
      maxArticles: 1000,
      minConfidence: 0.6,
      categoryWeights: {
        "technology": 1.0,
        "regulation": 1.2,
        "market": 1.0,
        "adoption": 1.1,
        "security": 1.3
      },
      credibilityThresholds: {
        high: 0.8,
        medium: 0.6
      },
      ...config
    };
    this.cache = new Map();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "get-articles":
          const articles = await this.getArticles(params.token, params.options);
          return JSON.stringify(articles, null, 2);
        
        case "analyze-coverage":
          const coverage = await this.analyzeCoverage(params.token);
          return JSON.stringify(coverage, null, 2);
        
        case "analyze-sentiment":
          const sentiment = await this.analyzeSentiment(params.token);
          return JSON.stringify(sentiment, null, 2);
        
        case "analyze-impact":
          const impact = await this.analyzeImpact(params.token);
          return JSON.stringify(impact, null, 2);
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("News Analyzer Tool", error.message);
      }
      throw error;
    }
  }

  private async getArticles(
    token: { address: string; chain: ChainType },
    options?: {
      startTime?: number;
      endTime?: number;
      sources?: string[];
      categories?: string[];
      minConfidence?: number;
    }
  ): Promise<NewsArticle[]> {
    // 检查缓存
    const cacheKey = `${token.chain}:${token.address}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.updateInterval) {
      return this.filterArticles(cached.articles, options);
    }

    try {
      // 获取新闻数据
      const articles = await Promise.all(
        this.config.sources.map(source => this.fetchArticles(token, source))
      );

      // 合并和排序文章
      const allArticles = articles
        .flat()
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, this.config.maxArticles);

      // 更新缓存
      if (!cached) {
        this.cache.set(cacheKey, {
          articles: allArticles,
          metrics: await this.calculateMetrics(allArticles),
          timestamp: Date.now()
        });
      } else {
        cached.articles = allArticles;
        cached.metrics = await this.calculateMetrics(allArticles);
        cached.timestamp = Date.now();
      }

      return this.filterArticles(allArticles, options);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "News Analyzer Tool",
          `Failed to get articles for token ${token.address} on ${token.chain}: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzeCoverage(token: { address: string; chain: ChainType }): Promise<NewsMetrics["coverage"]> {
    try {
      const articles = await this.getArticles(token);
      
      // 计算来源分布
      const sourceStats = new Map<string, {
        articles: number;
        credibilityScore: number;
      }>();

      articles.forEach(article => {
        const stats = sourceStats.get(article.source) || {
          articles: 0,
          credibilityScore: this.calculateSourceCredibility(article.source)
        };
        stats.articles++;
        sourceStats.set(article.source, stats);
      });

      // 计算情感分布
      const distribution = {
        positive: 0,
        neutral: 0,
        negative: 0
      };

      articles.forEach(article => {
        switch (article.sentiment.label) {
          case "POSITIVE":
            distribution.positive++;
            break;
          case "NEGATIVE":
            distribution.negative++;
            break;
          default:
            distribution.neutral++;
        }
      });

      return {
        total: articles.length,
        sources: Array.from(sourceStats.entries()).map(([name, stats]) => ({
          name,
          articles: stats.articles,
          credibilityScore: stats.credibilityScore
        })),
        distribution
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "News Analyzer Tool",
          `Failed to analyze coverage: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzeSentiment(token: { address: string; chain: ChainType }): Promise<NewsMetrics["sentiment"]> {
    try {
      const articles = await this.getArticles(token);
      
      // 计算整体情感
      let totalSentiment = 0;
      let totalConfidence = 0;

      articles.forEach(article => {
        totalSentiment += article.sentiment.score * article.sentiment.confidence;
        totalConfidence += article.sentiment.confidence;
      });

      const overallSentiment = totalConfidence === 0 ? 0 : 
        totalSentiment / totalConfidence;

      // 计算情感趋势
      const trend = this.calculateSentimentTrend(articles);

      // 按类别分析情感
      const categoryStats = new Map<string, {
        sentiment: number;
        articles: number;
      }>();

      articles.forEach(article => {
        article.categories.forEach(category => {
          const stats = categoryStats.get(category) || {
            sentiment: 0,
            articles: 0
          };
          stats.sentiment += article.sentiment.score;
          stats.articles++;
          categoryStats.set(category, stats);
        });
      });

      return {
        overall: overallSentiment,
        trend,
        confidence: totalConfidence / articles.length,
        breakdown: Array.from(categoryStats.entries()).map(([category, stats]) => ({
          category,
          sentiment: stats.sentiment / stats.articles,
          articles: stats.articles
        }))
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "News Analyzer Tool",
          `Failed to analyze sentiment: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async analyzeImpact(token: { address: string; chain: ChainType }): Promise<NewsMetrics["impact"]> {
    try {
      const articles = await this.getArticles(token);
      
      // 识别主要事件
      const majorEvents = articles
        .filter(article => article.impact.level === "HIGH")
        .map(article => ({
          date: new Date(article.publishedAt).toISOString().split("T")[0],
          title: article.title,
          impact: article.impact.score,
          sentiment: article.sentiment.score
        }))
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 5);

      // 分析风险因素
      const riskFactors = this.analyzeRiskFactors(articles);

      // 计算总体影响分数
      const impactScore = articles.reduce((sum, article) => {
        const weight = this.calculateArticleWeight(article);
        return sum + article.impact.score * weight;
      }, 0) / articles.length;

      return {
        score: impactScore,
        majorEvents,
        riskFactors
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "News Analyzer Tool",
          `Failed to analyze impact: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async fetchArticles(token: { address: string; chain: ChainType }, source: string): Promise<NewsArticle[]> {
    // TODO: 实现新闻获取逻辑
    return [];
  }

  private filterArticles(
    articles: NewsArticle[],
    options?: {
      startTime?: number;
      endTime?: number;
      sources?: string[];
      categories?: string[];
      minConfidence?: number;
    }
  ): NewsArticle[] {
    if (!options) return articles;

    return articles.filter(article => {
      // 时间过滤
      if (options.startTime && article.publishedAt < options.startTime) return false;
      if (options.endTime && article.publishedAt > options.endTime) return false;

      // 来源过滤
      if (options.sources && !options.sources.includes(article.source)) return false;

      // 类别过滤
      if (options.categories && !article.categories.some(c => options.categories.includes(c))) return false;

      // 置信度过滤
      if (options.minConfidence && article.sentiment.confidence < options.minConfidence) return false;

      return true;
    });
  }

  private async calculateMetrics(articles: NewsArticle[]): Promise<NewsMetrics> {
    const coverage = await this.analyzeCoverage({ address: "", chain: ChainType.ETH });
    const sentiment = await this.analyzeSentiment({ address: "", chain: ChainType.ETH });
    const impact = await this.analyzeImpact({ address: "", chain: ChainType.ETH });

    return {
      coverage,
      sentiment,
      impact
    };
  }

  private calculateSourceCredibility(source: string): number {
    // TODO: 实现来源可信度计算
    return 0.8;
  }

  private calculateSentimentTrend(articles: NewsArticle[]): number {
    if (articles.length < 2) return 0;

    const recentArticles = articles.slice(0, Math.min(10, articles.length));
    const oldArticles = articles.slice(-Math.min(10, articles.length));

    const recentSentiment = recentArticles.reduce((sum, a) => sum + a.sentiment.score, 0) / recentArticles.length;
    const oldSentiment = oldArticles.reduce((sum, a) => sum + a.sentiment.score, 0) / oldArticles.length;

    return recentSentiment - oldSentiment;
  }

  private analyzeRiskFactors(articles: NewsArticle[]): NewsMetrics["impact"]["riskFactors"] {
    const riskFactors = new Map<string, {
      occurrences: number;
      severity: number;
      firstSeen: number;
      lastSeen: number;
    }>();

    // 收集风险因素
    articles.forEach(article => {
      article.impact.factors.forEach(factor => {
        const stats = riskFactors.get(factor) || {
          occurrences: 0,
          severity: 0,
          firstSeen: article.publishedAt,
          lastSeen: article.publishedAt
        };

        stats.occurrences++;
        stats.severity += article.impact.score;
        stats.firstSeen = Math.min(stats.firstSeen, article.publishedAt);
        stats.lastSeen = Math.max(stats.lastSeen, article.publishedAt);

        riskFactors.set(factor, stats);
      });
    });

    // 计算风险趋势
    return Array.from(riskFactors.entries())
      .map(([factor, stats]) => ({
        factor,
        severity: stats.severity / stats.occurrences,
        trend: (stats.lastSeen - stats.firstSeen) / (7 * 24 * 60 * 60 * 1000) // 每周变化率
      }))
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 5);
  }

  private calculateArticleWeight(article: NewsArticle): number {
    let weight = 1;

    // 根据来源可信度调整权重
    const credibilityScore = this.calculateSourceCredibility(article.source);
    if (credibilityScore >= this.config.credibilityThresholds.high) {
      weight *= 1.5;
    } else if (credibilityScore < this.config.credibilityThresholds.medium) {
      weight *= 0.5;
    }

    // 根据类别重要性调整权重
    const categoryWeight = Math.max(
      ...article.categories.map(c => this.config.categoryWeights[c] || 1)
    );
    weight *= categoryWeight;

    // 根据时间衰减调整权重
    const age = (Date.now() - article.publishedAt) / (24 * 60 * 60 * 1000); // 天数
    weight *= Math.exp(-age / 30); // 30天半衰期

    return weight;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<NewsAnalyzerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 