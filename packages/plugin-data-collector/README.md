# @lumix/plugin-data-collector

数据收集和分析插件，用于收集和分析加密货币和 DeFi 项目相关的新闻和社交媒体数据。

## 功能特点

- 新闻数据收集
  - 支持多个新闻源
  - 关键词过滤
  - 自动提取关键信息
  - 情感分析

- 社交媒体监控
  - Twitter 数据收集
  - Discord 消息监控
  - 互动数据分析

## 安装

```bash
pnpm add @lumix/plugin-data-collector
```

## 使用方法

```typescript
import { DataCollectorPlugin } from '@lumix/plugin-data-collector';

const config = {
  sources: {
    news: [
      'https://cointelegraph.com',
      'https://decrypt.co',
      // 添加更多新闻源
    ],
    social: ['twitter', 'discord']
  },
  keywords: [
    'bitcoin',
    'ethereum',
    'defi',
    // 添加更多关键词
  ],
  updateInterval: 300000, // 5分钟
  apiKeys: {
    twitter: 'YOUR_TWITTER_API_KEY',
    discord: 'YOUR_DISCORD_BOT_TOKEN'
  }
};

const collector = new DataCollectorPlugin(config);

// 启动数据收集
await collector.start();

// 停止数据收集
await collector.stop();
```

## 配置选项

### DataCollectorConfig

| 选项 | 类型 | 描述 |
|------|------|------|
| sources.news | string[] | 新闻源 URL 列表 |
| sources.social | string[] | 要监控的社交媒体平台 |
| keywords | string[] | 关键词列表 |
| updateInterval | number | 数据更新间隔（毫秒） |
| apiKeys | object | API 密钥配置 |

## 数据类型

### NewsItem

```typescript
interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  timestamp: Date;
  sentiment?: number;
  keywords: string[];
}
```

### SocialMediaPost

```typescript
interface SocialMediaPost {
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
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test
```

## 注意事项

1. 请确保在使用前配置正确的 API 密钥
2. 遵守各平台的 API 使用限制
3. 建议适当设置 updateInterval 以避免超出 API 限制
4. 收集到的数据建议及时处理和存储 