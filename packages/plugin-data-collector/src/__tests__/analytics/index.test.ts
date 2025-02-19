import { DataAnalytics } from '../../analytics';
import { NewsItem, SocialMediaPost } from '../../types';

describe('DataAnalytics', () => {
  let analytics: DataAnalytics;
  let mockNews: NewsItem[];
  let mockPosts: SocialMediaPost[];

  beforeEach(() => {
    analytics = new DataAnalytics();

    mockNews = [
      {
        id: '1',
        title: 'Bitcoin Surges',
        content: 'Bitcoin price reaches new heights as adoption grows.',
        source: 'example.com',
        url: 'https://example.com/1',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        sentiment: 0.8,
        keywords: ['bitcoin', 'price', 'adoption']
      },
      {
        id: '2',
        title: 'Market Crash',
        content: 'Crypto markets experience significant downturn.',
        source: 'example.com',
        url: 'https://example.com/2',
        timestamp: new Date('2024-01-01T11:00:00Z'),
        sentiment: -0.6,
        keywords: ['crash', 'market', 'crypto']
      }
    ];

    mockPosts = [
      {
        id: '1',
        platform: 'twitter',
        content: 'Bullish on Bitcoin! To the moon! 🚀',
        author: 'crypto_whale',
        timestamp: new Date('2024-01-01T10:30:00Z'),
        engagement: {
          likes: 1000,
          replies: 100,
          shares: 500
        }
      },
      {
        id: '2',
        platform: 'discord',
        content: 'Market looking bearish, time to be careful.',
        author: 'trader_pro',
        timestamp: new Date('2024-01-01T11:30:00Z'),
        engagement: {
          likes: 50,
          replies: 20
        }
      }
    ];
  });

  describe('sentiment analysis', () => {
    it('should calculate overall sentiment correctly', () => {
      const analysis = analytics.analyzeSentiment(mockNews, mockPosts);
      
      expect(analysis.overallSentiment).toBeDefined();
      expect(typeof analysis.overallSentiment).toBe('number');
      expect(analysis.overallSentiment).toBeGreaterThan(-1);
      expect(analysis.overallSentiment).toBeLessThan(1);
    });

    it('should generate sentiment trends', () => {
      const analysis = analytics.analyzeSentiment(mockNews, mockPosts);
      
      expect(analysis.sentimentTrend).toBeInstanceOf(Array);
      expect(analysis.sentimentTrend.length).toBeGreaterThan(0);
      expect(analysis.sentimentTrend[0]).toHaveProperty('timestamp');
      expect(analysis.sentimentTrend[0]).toHaveProperty('sentiment');
    });

    it('should identify top positive and negative keywords', () => {
      const analysis = analytics.analyzeSentiment(mockNews, mockPosts);
      
      expect(analysis.topPositiveKeywords).toBeInstanceOf(Array);
      expect(analysis.topNegativeKeywords).toBeInstanceOf(Array);
      expect(analysis.topPositiveKeywords[0]).toHaveProperty('keyword');
      expect(analysis.topPositiveKeywords[0]).toHaveProperty('count');
    });
  });

  describe('engagement analysis', () => {
    it('should calculate total engagement correctly', () => {
      const analysis = analytics.analyzeEngagement(mockPosts);
      
      const expectedTotal = 1670; // 1000 + 100 + 500 + 50 + 20
      expect(analysis.totalEngagement).toBe(expectedTotal);
    });

    it('should break down engagement by platform', () => {
      const analysis = analytics.analyzeEngagement(mockPosts);
      
      expect(analysis.engagementByPlatform).toHaveProperty('twitter');
      expect(analysis.engagementByPlatform).toHaveProperty('discord');
      expect(analysis.engagementByPlatform.twitter).toBe(1600);
      expect(analysis.engagementByPlatform.discord).toBe(70);
    });

    it('should identify top influencers', () => {
      const analysis = analytics.analyzeEngagement(mockPosts);
      
      expect(analysis.topInfluencers).toBeInstanceOf(Array);
      expect(analysis.topInfluencers.length).toBeGreaterThan(0);
      expect(analysis.topInfluencers[0]).toHaveProperty('author');
      expect(analysis.topInfluencers[0]).toHaveProperty('platform');
      expect(analysis.topInfluencers[0]).toHaveProperty('totalEngagement');
      expect(analysis.topInfluencers[0].author).toBe('crypto_whale');
    });

    it('should generate engagement trends', () => {
      const analysis = analytics.analyzeEngagement(mockPosts);
      
      expect(analysis.engagementTrend).toBeInstanceOf(Array);
      expect(analysis.engagementTrend.length).toBeGreaterThan(0);
      expect(analysis.engagementTrend[0]).toHaveProperty('timestamp');
      expect(analysis.engagementTrend[0]).toHaveProperty('engagement');
    });
  });
}); 