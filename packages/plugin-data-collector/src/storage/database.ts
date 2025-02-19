import mongoose from 'mongoose';
import { createClient } from 'redis';
import { News, SocialMedia, Project } from './models';
import { NewsItem, SocialMediaPost, ProjectInfo } from '../types';
import { backOff } from 'exponential-backoff';
import { logger } from '../utils/logger';

export class Database {
  private redisClient;

  constructor() {
    this.redisClient = createClient();
    this.redisClient.on('error', err => logger.error('Redis Client Error', err));
  }

  async connect(mongoUrl: string, redisUrl: string) {
    try {
      // MongoDB 连接
      await mongoose.connect(mongoUrl);
      logger.info('MongoDB connected successfully');

      // Redis 连接
      await this.redisClient.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Database connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      await this.redisClient.disconnect();
      logger.info('Database connections closed');
    } catch (error) {
      logger.error('Error disconnecting from databases:', error);
      throw error;
    }
  }

  // 新闻数据操作
  async saveNews(newsItems: NewsItem[]) {
    return await backOff(async () => {
      try {
        const operations = newsItems.map(item => ({
          updateOne: {
            filter: { id: item.id },
            update: { $set: item },
            upsert: true
          }
        }));

        const result = await News.bulkWrite(operations);
        logger.info(`Saved ${result.upsertedCount} new news items`);
        
        // 缓存最新的新闻
        await this.cacheLatestNews(newsItems);
        
        return result;
      } catch (error) {
        logger.error('Error saving news:', error);
        throw error;
      }
    });
  }

  // 社交媒体数据操作
  async saveSocialPosts(posts: SocialMediaPost[]) {
    return await backOff(async () => {
      try {
        const operations = posts.map(post => ({
          updateOne: {
            filter: { id: post.id },
            update: { $set: post },
            upsert: true
          }
        }));

        const result = await SocialMedia.bulkWrite(operations);
        logger.info(`Saved ${result.upsertedCount} new social media posts`);
        return result;
      } catch (error) {
        logger.error('Error saving social posts:', error);
        throw error;
      }
    });
  }

  // 项目信息操作
  async saveProject(project: ProjectInfo) {
    return await backOff(async () => {
      try {
        const result = await Project.findOneAndUpdate(
          { name: project.name },
          project,
          { upsert: true, new: true }
        );
        logger.info(`Project ${project.name} saved/updated`);
        return result;
      } catch (error) {
        logger.error('Error saving project:', error);
        throw error;
      }
    });
  }

  // 缓存操作
  private async cacheLatestNews(newsItems: NewsItem[]) {
    try {
      const pipeline = this.redisClient.multi();
      
      // 按来源分组缓存最新新闻
      const newsBySource = new Map<string, NewsItem[]>();
      newsItems.forEach(item => {
        const items = newsBySource.get(item.source) || [];
        items.push(item);
        newsBySource.set(item.source, items);
      });

      // 为每个来源缓存最新的10条新闻
      for (const [source, items] of newsBySource.entries()) {
        const key = `latest_news:${source}`;
        const sortedItems = items
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, 10);
        
        pipeline.del(key);
        pipeline.rPush(key, ...sortedItems.map(item => JSON.stringify(item)));
        pipeline.expire(key, 3600); // 1小时过期
      }

      await pipeline.exec();
    } catch (error) {
      logger.error('Error caching latest news:', error);
    }
  }

  // 查询方法
  async getLatestNews(source?: string, limit = 10): Promise<NewsItem[]> {
    try {
      if (source) {
        const key = `latest_news:${source}`;
        const cachedNews = await this.redisClient.lRange(key, 0, limit - 1);
        if (cachedNews.length > 0) {
          return cachedNews.map(item => JSON.parse(item));
        }
      }

      const query = source ? { source } : {};
      return await News.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting latest news:', error);
      throw error;
    }
  }

  async getNewsByKeywords(keywords: string[], limit = 50): Promise<NewsItem[]> {
    try {
      return await News.find({
        keywords: { $in: keywords }
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting news by keywords:', error);
      throw error;
    }
  }

  async getSocialPostsByPlatform(
    platform: string,
    limit = 50
  ): Promise<SocialMediaPost[]> {
    try {
      return await SocialMedia.find({ platform })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting social posts:', error);
      throw error;
    }
  }
} 