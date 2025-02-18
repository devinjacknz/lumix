import { TwitterApi } from 'twitter-api-v2';
import { Client as DiscordClient } from 'discord.js';
import { SocialMediaPost } from '../types';

export class SocialMediaCollector {
  private twitterClient?: TwitterApi;
  private discordClient?: DiscordClient;
  private keywords: string[];

  constructor(
    apiKeys: { twitter?: string; discord?: string },
    keywords: string[]
  ) {
    if (apiKeys.twitter) {
      this.twitterClient = new TwitterApi(apiKeys.twitter);
    }

    if (apiKeys.discord) {
      this.discordClient = new DiscordClient({
        intents: ['GuildMessages', 'MessageContent']
      });
      this.discordClient.login(apiKeys.discord);
    }

    this.keywords = keywords;
  }

  async collectPosts(): Promise<SocialMediaPost[]> {
    const posts: SocialMediaPost[] = [];

    if (this.twitterClient) {
      const twitterPosts = await this.collectTwitterPosts();
      posts.push(...twitterPosts);
    }

    if (this.discordClient) {
      const discordPosts = await this.collectDiscordPosts();
      posts.push(...discordPosts);
    }

    return posts;
  }

  private async collectTwitterPosts(): Promise<SocialMediaPost[]> {
    if (!this.twitterClient) return [];

    const posts: SocialMediaPost[] = [];
    
    for (const keyword of this.keywords) {
      try {
        const result = await this.twitterClient.v2.search(keyword);
        
        for (const tweet of result.data.data || []) {
          posts.push({
            id: tweet.id,
            platform: 'twitter',
            content: tweet.text,
            author: tweet.author_id,
            timestamp: new Date(tweet.created_at),
            engagement: {
              likes: tweet.public_metrics?.like_count,
              replies: tweet.public_metrics?.reply_count,
              shares: tweet.public_metrics?.retweet_count
            }
          });
        }
      } catch (error) {
        console.error(`Error collecting Twitter posts for keyword ${keyword}:`, error);
      }
    }

    return posts;
  }

  private async collectDiscordPosts(): Promise<SocialMediaPost[]> {
    if (!this.discordClient) return [];

    const posts: SocialMediaPost[] = [];
    
    // 监听新消息
    this.discordClient.on('messageCreate', message => {
      if (this.keywords.some(keyword => 
        message.content.toLowerCase().includes(keyword.toLowerCase())
      )) {
        posts.push({
          id: message.id,
          platform: 'discord',
          content: message.content,
          author: message.author.tag,
          timestamp: message.createdAt,
          engagement: {
            likes: message.reactions.cache.size
          }
        });
      }
    });

    // 等待一段时间收集消息
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return posts;
  }

  async cleanup() {
    if (this.discordClient) {
      await this.discordClient.destroy();
    }
  }
} 