export interface NewsConfig {
  sources: NewsSource[];
  cacheTimeout?: number;
  maxArticles?: number;
}

export interface NewsSource {
  name: string;
  url: string;
  baseUrl: string;
  selectors: {
    article: string;
    title: string;
    description: string;
    link: string;
    date: string;
    category?: string;
  };
}

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  categories: string[];
  image?: string;
  author?: string;
}

export interface NewsFilter {
  sources?: string[];
  categories?: string[];
  keywords?: string[];
  startDate?: string;
  endDate?: string;
}

export interface NewsSearchResult {
  article: NewsArticle;
  relevance: number;
}

export interface NewsAnalysis {
  timeframe: number;
  articleCount: number;
  topTopics: Array<{
    topic: string;
    frequency: number;
  }>;
  lastUpdate: string;
}

export interface NewsError {
  code: string;
  message: string;
  details?: unknown;
}

export interface NewsResponse<T> {
  success: boolean;
  data?: T;
  error?: NewsError;
}

export interface NewsStats {
  totalArticles: number;
  sourceCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface NewsSourceStatus {
  source: string;
  status: 'active' | 'error';
  lastFetch: string;
  articleCount: number;
  error?: string;
}
