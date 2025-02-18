import { CheerioAPI } from 'cheerio';
import { NewsItem } from '../../types';

export interface NewsParser {
  canParse(url: string): boolean;
  parse($: CheerioAPI): NewsItem[];
}

// CoinTelegraph 解析器
export class CoinTelegraphParser implements NewsParser {
  canParse(url: string): boolean {
    return url.includes('cointelegraph.com');
  }

  parse($: CheerioAPI): NewsItem[] {
    const news: NewsItem[] = [];
    
    $('.post-card').each((_, element) => {
      const title = $(element).find('.post-card__title').text().trim();
      const content = $(element).find('.post-card__text').text().trim();
      const url = $(element).find('.post-card__title-link').attr('href') || '';
      
      if (title && content) {
        news.push({
          id: `ct-${Buffer.from(title).toString('base64')}`,
          title,
          content,
          source: 'cointelegraph.com',
          url,
          timestamp: new Date(),
          keywords: [],
        });
      }
    });

    return news;
  }
}

// Decrypt 解析器
export class DecryptParser implements NewsParser {
  canParse(url: string): boolean {
    return url.includes('decrypt.co');
  }

  parse($: CheerioAPI): NewsItem[] {
    const news: NewsItem[] = [];
    
    $('.article-card').each((_, element) => {
      const title = $(element).find('.article-card__title').text().trim();
      const content = $(element).find('.article-card__excerpt').text().trim();
      const url = $(element).find('a').attr('href') || '';
      
      if (title && content) {
        news.push({
          id: `decrypt-${Buffer.from(title).toString('base64')}`,
          title,
          content,
          source: 'decrypt.co',
          url,
          timestamp: new Date(),
          keywords: [],
        });
      }
    });

    return news;
  }
}

// CoinDesk 解析器
export class CoinDeskParser implements NewsParser {
  canParse(url: string): boolean {
    return url.includes('coindesk.com');
  }

  parse($: CheerioAPI): NewsItem[] {
    const news: NewsItem[] = [];
    
    $('.article-card').each((_, element) => {
      const title = $(element).find('.heading').text().trim();
      const content = $(element).find('.card-text').text().trim();
      const url = $(element).find('a').attr('href') || '';
      
      if (title && content) {
        news.push({
          id: `cd-${Buffer.from(title).toString('base64')}`,
          title,
          content,
          source: 'coindesk.com',
          url,
          timestamp: new Date(),
          keywords: [],
        });
      }
    });

    return news;
  }
}

// 解析器工厂
export class NewsParserFactory {
  private static parsers: NewsParser[] = [
    new CoinTelegraphParser(),
    new DecryptParser(),
    new CoinDeskParser(),
  ];

  static getParser(url: string): NewsParser | null {
    return this.parsers.find(parser => parser.canParse(url)) || null;
  }

  static registerParser(parser: NewsParser) {
    this.parsers.push(parser);
  }
} 