import { NewsItem, SocialMediaPost } from '../types';
import { scaleTime, scaleLinear } from 'd3-scale';
import { line, curveMonotoneX } from 'd3-shape';
import { timeDay } from 'd3-time';
import { extent, max, mean, group, sum } from 'd3-array';

export interface SentimentAnalysis {
  overallSentiment: number;
  sentimentTrend: Array<{
    timestamp: Date;
    sentiment: number;
  }>;
  topPositiveKeywords: Array<{
    keyword: string;
    count: number;
  }>;
  topNegativeKeywords: Array<{
    keyword: string;
    count: number;
  }>;
}

export interface EngagementAnalysis {
  totalEngagement: number;
  engagementByPlatform: Record<string, number>;
  topInfluencers: Array<{
    author: string;
    platform: string;
    totalEngagement: number;
  }>;
  engagementTrend: Array<{
    timestamp: Date;
    engagement: number;
  }>;
}

export class DataAnalytics {
  analyzeSentiment(news: NewsItem[], posts: SocialMediaPost[]): SentimentAnalysis {
    // 计算整体情感得分
    const allSentiments = [
      ...news.map(item => item.sentiment || 0),
      ...posts.map(post => this.analyzeSocialPostSentiment(post))
    ];
    
    const overallSentiment = mean(allSentiments) || 0;

    // 计算情感趋势
    const sentimentTrend = this.calculateSentimentTrend([...news, ...posts]);

    // 分析关键词情感
    const keywordSentiment = this.analyzeKeywordSentiment(news);

    return {
      overallSentiment,
      sentimentTrend,
      topPositiveKeywords: keywordSentiment.positive,
      topNegativeKeywords: keywordSentiment.negative
    };
  }

  analyzeEngagement(posts: SocialMediaPost[]): EngagementAnalysis {
    // 计算总互动量
    const totalEngagement = posts.reduce((sum, post) => {
      const engagement = (post.engagement.likes || 0) +
        (post.engagement.replies || 0) +
        (post.engagement.shares || 0);
      return sum + engagement;
    }, 0);

    // 按平台分组
    const engagementByPlatform = posts.reduce((acc, post) => {
      const engagement = (post.engagement.likes || 0) +
        (post.engagement.replies || 0) +
        (post.engagement.shares || 0);
      acc[post.platform] = (acc[post.platform] || 0) + engagement;
      return acc;
    }, {} as Record<string, number>);

    // 分析影响力者
    const influencers = this.analyzeInfluencers(posts);

    // 计算互动趋势
    const engagementTrend = this.calculateEngagementTrend(posts);

    return {
      totalEngagement,
      engagementByPlatform,
      topInfluencers: influencers,
      engagementTrend
    };
  }

  private analyzeSocialPostSentiment(post: SocialMediaPost): number {
    // 简单的情感分析实现
    const positiveWords = ['good', 'great', 'awesome', 'bullish', 'moon'];
    const negativeWords = ['bad', 'poor', 'bearish', 'crash', 'dump'];

    const content = post.content.toLowerCase();
    const positiveCount = positiveWords.filter(word => content.includes(word)).length;
    const negativeCount = negativeWords.filter(word => content.includes(word)).length;

    return (positiveCount - negativeCount) / (positiveCount + negativeCount + 1);
  }

  private calculateSentimentTrend(items: (NewsItem | SocialMediaPost)[]): Array<{timestamp: Date; sentiment: number}> {
    // 按时间排序
    const sorted = [...items].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 按小时分组
    const hourlyGroups = group(sorted, d => 
      new Date(d.timestamp.getFullYear(), d.timestamp.getMonth(), d.timestamp.getDate(), d.timestamp.getHours())
    );

    return Array.from(hourlyGroups, ([timestamp, group]) => ({
      timestamp: new Date(timestamp),
      sentiment: mean(group.map(item => 
        'sentiment' in item ? item.sentiment || 0 : this.analyzeSocialPostSentiment(item)
      )) || 0
    }));
  }

  private analyzeKeywordSentiment(news: NewsItem[]): {
    positive: Array<{keyword: string; count: number}>;
    negative: Array<{keyword: string; count: number}>;
  } {
    const keywordSentiments = new Map<string, number[]>();

    // 收集每个关键词的情感得分
    news.forEach(item => {
      const sentiment = item.sentiment || 0;
      item.keywords.forEach(keyword => {
        const scores = keywordSentiments.get(keyword) || [];
        scores.push(sentiment);
        keywordSentiments.set(keyword, scores);
      });
    });

    // 计算平均情感得分
    const keywordAverageSentiments = Array.from(keywordSentiments.entries())
      .map(([keyword, scores]) => ({
        keyword,
        avgSentiment: mean(scores) || 0,
        count: scores.length
      }))
      .filter(item => item.count >= 3); // 至少出现3次

    // 分离正面和负面关键词
    const positive = keywordAverageSentiments
      .filter(item => item.avgSentiment > 0)
      .sort((a, b) => b.avgSentiment - a.avgSentiment)
      .slice(0, 10)
      .map(item => ({ keyword: item.keyword, count: item.count }));

    const negative = keywordAverageSentiments
      .filter(item => item.avgSentiment < 0)
      .sort((a, b) => a.avgSentiment - b.avgSentiment)
      .slice(0, 10)
      .map(item => ({ keyword: item.keyword, count: item.count }));

    return { positive, negative };
  }

  private analyzeInfluencers(posts: SocialMediaPost[]): Array<{
    author: string;
    platform: string;
    totalEngagement: number;
  }> {
    const influencers = posts.reduce((acc, post) => {
      const key = `${post.platform}:${post.author}`;
      const engagement = (post.engagement.likes || 0) +
        (post.engagement.replies || 0) +
        (post.engagement.shares || 0);

      if (!acc.has(key)) {
        acc.set(key, {
          author: post.author,
          platform: post.platform,
          totalEngagement: 0
        });
      }

      const current = acc.get(key)!;
      current.totalEngagement += engagement;
      return acc;
    }, new Map<string, {author: string; platform: string; totalEngagement: number}>());

    return Array.from(influencers.values())
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 10);
  }

  private calculateEngagementTrend(posts: SocialMediaPost[]): Array<{
    timestamp: Date;
    engagement: number;
  }> {
    // 按时间排序
    const sorted = [...posts].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 按小时分组
    const hourlyGroups = group(sorted, d => 
      new Date(d.timestamp.getFullYear(), d.timestamp.getMonth(), d.timestamp.getDate(), d.timestamp.getHours())
    );

    return Array.from(hourlyGroups, ([timestamp, group]) => ({
      timestamp: new Date(timestamp),
      engagement: sum(group, post => 
        (post.engagement.likes || 0) +
        (post.engagement.replies || 0) +
        (post.engagement.shares || 0)
      )
    }));
  }
} 