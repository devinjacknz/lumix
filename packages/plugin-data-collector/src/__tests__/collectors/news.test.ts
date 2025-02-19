import { NewsCollector } from '../../collectors/news';
import axios from 'axios';
import { NewsItem } from '../../types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('NewsCollector', () => {
  let collector: NewsCollector;

  beforeEach(() => {
    collector = new NewsCollector(
      ['https://example.com'],
      ['bitcoin', 'ethereum']
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should collect and filter news based on keywords', async () => {
    const mockHtml = `
      <article>
        <h1>Bitcoin Price Surges</h1>
        <p>The price of Bitcoin has reached new heights.</p>
        <a href="/article/1">Read more</a>
      </article>
      <article>
        <h1>Stock Market Update</h1>
        <p>Traditional markets show mixed results.</p>
        <a href="/article/2">Read more</a>
      </article>
    `;

    mockedAxios.get.mockResolvedValueOnce({
      data: mockHtml
    });

    const news = await collector.collectNews();

    expect(news.length).toBe(1);
    expect(news[0].title).toContain('Bitcoin');
    expect(news[0].url).toContain('/article/1');
  });

  it('should handle network errors gracefully', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const news = await collector.collectNews();

    expect(news).toEqual([]);
  });

  it('should normalize URLs correctly', async () => {
    const mockHtml = `
      <article>
        <h1>Ethereum News</h1>
        <p>Ethereum related content.</p>
        <a href="//example.com/article">Read more</a>
      </article>
    `;

    mockedAxios.get.mockResolvedValueOnce({
      data: mockHtml
    });

    const news = await collector.collectNews();

    expect(news[0].url).toBe('https://example.com/article');
  });

  it('should extract keywords and calculate sentiment', async () => {
    const mockHtml = `
      <article>
        <h1>Bitcoin Adoption Growing</h1>
        <p>The adoption of Bitcoin is increasing rapidly as more institutions show interest.</p>
        <a href="/article">Read more</a>
      </article>
    `;

    mockedAxios.get.mockResolvedValueOnce({
      data: mockHtml
    });

    const news = await collector.collectNews();

    expect(news[0].keywords).toContain('adoption');
    expect(news[0].keywords).toContain('bitcoin');
    expect(news[0].sentiment).toBeDefined();
    expect(typeof news[0].sentiment).toBe('number');
  });
}); 