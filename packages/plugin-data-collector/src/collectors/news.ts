import axios from 'axios';
import * as cheerio from 'cheerio';
import { NewsItem } from '../types';
import natural from 'natural';
import { NewsParserFactory } from './parsers';
import { backOff } from 'exponential-backoff';
import { logger } from '../utils/logger';

const tokenizer = new natural.WordTokenizer();
const sentiment = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');

export class NewsCollector {
  private sources: string[];
  private keywords: string[];

  constructor(sources: string[], keywords: string[]) {
    this.sources = sources;
    this.keywords = keywords;
  }

  async collectNews(): Promise<NewsItem[]> {
    const allNews: NewsItem[] = [];

    for (const source of this.sources) {
      try {
        const news = await this.scrapeSource(source);
        const filteredNews = this.filterAndEnrichNews(news);
        allNews.push(...filteredNews);
      } catch (error) {
        logger.error(`Error collecting news from ${source}:`, error);
      }
    }

    return allNews;
  }

  private async scrapeSource(source: string): Promise<NewsItem[]> {
    try {
      return await backOff(async () => {
        const response = await axios.get(source, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LumixBot/1.0; +http://lumix.io)'
          }
        });
        
        const $ = cheerio.load(response.data);
        const parser = NewsParserFactory.getParser(source);

        if (parser) {
          return parser.parse($);
        } else {
          return this.parseWithGenericParser($, source);
        }
      }, {
        numOfAttempts: 3,
        startingDelay: 1000
      });
    } catch (error) {
      logger.error(`Error scraping source ${source}:`, error);
      return [];
    }
  }

  private parseWithGenericParser($: cheerio.CheerioAPI, source: string): NewsItem[] {
    const news: NewsItem[] = [];

    $('article, .article, .post').each((_, element) => {
      const title = $(element).find('h1, h2, .title').first().text().trim();
      const content = $(element).find('p, .content, .description').text().trim();
      const url = $(element).find('a').attr('href') || '';
      
      if (title && content) {
        news.push({
          id: this.generateId(title, source),
          title,
          content,
          source,
          url: this.normalizeUrl(url, source),
          timestamp: new Date(),
          keywords: [],
        });
      }
    });

    return news;
  }

  private filterAndEnrichNews(news: NewsItem[]): NewsItem[] {
    return news
      .filter(item => this.containsKeywords(item.title) || this.containsKeywords(item.content))
      .map(item => ({
        ...item,
        sentiment: this.analyzeSentiment(item.content),
        keywords: this.extractKeywords(item.content)
      }));
  }

  private containsKeywords(text: string): boolean {
    return this.keywords.some(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private generateId(title: string, source: string): string {
    return Buffer.from(`${title}-${source}-${Date.now()}`).toString('base64');
  }

  private normalizeUrl(url: string, source: string): string {
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) {
      const baseUrl = new URL(source).origin;
      return `${baseUrl}${url}`;
    }
    return `${source.replace(/\/$/, '')}/${url}`;
  }

  private analyzeSentiment(text: string): number {
    const words = tokenizer.tokenize(text);
    if (!words) return 0;
    return sentiment.getSentiment(words);
  }

  private extractKeywords(text: string): string[] {
    const words = tokenizer.tokenize(text) || [];
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to']);
    
    return words
      .map(word => word.toLowerCase())
      .filter(word => !stopWords.has(word))
      .filter(word => word.length > 3)
      .slice(0, 10);
  }
} 