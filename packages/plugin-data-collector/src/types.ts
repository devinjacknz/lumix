export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  timestamp: Date;
  sentiment?: number;
  keywords: string[];
}

export interface SocialMediaPost {
  id: string;
  platform: 'twitter' | 'discord' | 'telegram';
  content: string;
  author: string;
  timestamp: Date;
  engagement: {
    likes?: number;
    replies?: number;
    shares?: number;
  };
}

export interface ProjectInfo {
  name: string;
  description: string;
  website: string;
  socialLinks: {
    twitter?: string;
    discord?: string;
    telegram?: string;
    github?: string;
  };
  tokenAddress?: string;
  chainId?: number;
  lastUpdated: Date;
}

export interface DataCollectorConfig {
  sources: {
    news: string[];
    social: ('twitter' | 'discord' | 'telegram')[];
  };
  keywords: string[];
  updateInterval: number;
  apiKeys: {
    twitter?: string;
    discord?: string;
    telegram?: string;
  };
} 