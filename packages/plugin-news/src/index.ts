import axios from 'axios';
import * as cheerio from 'cheerio';
import { format, parseISO, subDays } from 'date-fns';
import { TfIdf, WordTokenizer } from 'natural';
import {
  NewsConfig,
  NewsArticle,
  NewsSource,
  NewsFilter,
  NewsAnalysis,
  NewsSearchResult
} from './types';

export class NewsPlugin {
  private config: NewsConfig;
  private tokenizer: WordTokenizer;
  private tfidf: TfIdf;

  constructor(config: NewsConfig) {
    this.config = config;
    this.tokenizer = new WordTokenizer();
    this.tfidf = new TfIdf();
  }

  /**
   * Get latest news articles
   */
  async getLatestNews(filter?: NewsFilter): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];

    // Fetch from configured sources
    for (const source of this.config.sources) {
      const sourceArticles = await this.fetchFromSource(source);
      articles.push(...sourceArticles);
    }

    // Apply filters if provided
    let filtered = articles;
    if (filter) {
      filtered = this.applyFilter(articles, filter);
    }

    // Sort by date
    return filtered.sort((a, b) => 
      parseISO(b.publishedAt).getTime() - parseISO(a.publishedAt).getTime()
    );
  }

  /**
   * Search news articles
   */
  async searchNews(query: string): Promise<NewsSearchResult[]> {
    const articles = await this.getLatestNews();
    
    // Add articles to TF-IDF
    articles.forEach(article => {
      this.tfidf.addDocument(
        `${article.title} ${article.description}`,
        article
      );
    });

    // Get relevant articles
    const results: NewsSearchResult[] = [];
    this.tfidf.tfidfs(query, (i, measure) => {
      if (measure > 0) {
        results.push({
          article: articles[i],
          relevance: measure
        });
      }
    });

    // Sort by relevance
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Analyze news sentiment and trends
   */
  async analyzeNews(timeframe: number = 7): Promise<NewsAnalysis> {
    const articles = await this.getLatestNews();
    const startDate = subDays(new Date(), timeframe);

    // Filter articles within timeframe
    const recentArticles = articles.filter(article => 
      parseISO(article.publishedAt) >= startDate
    );

    // Extract topics and calculate frequencies
    const topics = new Map<string, number>();
    recentArticles.forEach(article => {
      const tokens = this.tokenizer.tokenize(
        `${article.title} ${article.description}`
      );
      
      if (tokens) {
        tokens.forEach(token => {
          const count = topics.get(token) || 0;
          topics.set(token, count + 1);
        });
      }
    });

    // Sort topics by frequency
    const sortedTopics = Array.from(topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, frequency]) => ({ topic, frequency }));

    return {
      timeframe,
      articleCount: recentArticles.length,
      topTopics: sortedTopics,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Fetch articles from a news source
   */
  private async fetchFromSource(source: NewsSource): Promise<NewsArticle[]> {
    try {
      const response = await axios.get(source.url);
      const $ = cheerio.load(response.data);
      const articles: NewsArticle[] = [];

      // Extract articles using source-specific selectors
      $(source.selectors.article).each((_, element) => {
        const title = $(element).find(source.selectors.title).text().trim();
        const description = $(element).find(source.selectors.description).text().trim();
        const url = $(element).find(source.selectors.link).attr('href') || '';
        const publishedAt = $(element).find(source.selectors.date).text().trim();

        if (title && url) {
          articles.push({
            title,
            description,
            url: this.normalizeUrl(url, source.baseUrl),
            source: source.name,
            publishedAt: this.normalizeDate(publishedAt),
            categories: []
          });
        }
      });

      return articles;
    } catch (error) {
      console.error(`Error fetching from ${source.name}:`, error);
      return [];
    }
  }

  /**
   * Apply filters to articles
   */
  private applyFilter(articles: NewsArticle[], filter: NewsFilter): NewsArticle[] {
    return articles.filter(article => {
      if (filter.sources && !filter.sources.includes(article.source)) {
        return false;
      }

      if (filter.categories && !article.categories.some(c => filter.categories?.includes(c))) {
        return false;
      }

      if (filter.startDate && parseISO(article.publishedAt) < parseISO(filter.startDate)) {
        return false;
      }

      if (filter.endDate && parseISO(article.publishedAt) > parseISO(filter.endDate)) {
        return false;
      }

      if (filter.keywords) {
        const content = `${article.title} ${article.description}`.toLowerCase();
        return filter.keywords.some(keyword => content.includes(keyword.toLowerCase()));
      }

      return true;
    });
  }

  /**
   * Normalize relative URLs to absolute URLs
   */
  private normalizeUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http')) {
      return url;
    }
    return new URL(url, baseUrl).toString();
  }

  /**
   * Normalize date strings to ISO format
   */
  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}

export * from './types';
