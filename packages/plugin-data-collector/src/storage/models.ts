import mongoose, { Schema, Document } from 'mongoose';
import { NewsItem, SocialMediaPost, ProjectInfo } from '../types';

// 新闻数据模型
export interface NewsDocument extends NewsItem, Document {}

const NewsSchema = new Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  source: { type: String, required: true },
  url: { type: String, required: true },
  timestamp: { type: Date, required: true },
  sentiment: { type: Number },
  keywords: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 社交媒体数据模型
export interface SocialMediaDocument extends SocialMediaPost, Document {}

const SocialMediaSchema = new Schema({
  id: { type: String, required: true, unique: true },
  platform: { type: String, required: true, enum: ['twitter', 'discord', 'telegram'] },
  content: { type: String, required: true },
  author: { type: String, required: true },
  timestamp: { type: Date, required: true },
  engagement: {
    likes: { type: Number },
    replies: { type: Number },
    shares: { type: Number }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 项目信息模型
export interface ProjectDocument extends ProjectInfo, Document {}

const ProjectSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  website: { type: String, required: true },
  socialLinks: {
    twitter: { type: String },
    discord: { type: String },
    telegram: { type: String },
    github: { type: String }
  },
  tokenAddress: { type: String },
  chainId: { type: Number },
  lastUpdated: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 创建索引
NewsSchema.index({ keywords: 1 });
NewsSchema.index({ timestamp: -1 });
SocialMediaSchema.index({ platform: 1, timestamp: -1 });
ProjectSchema.index({ tokenAddress: 1, chainId: 1 });

// 导出模型
export const News = mongoose.model<NewsDocument>('News', NewsSchema);
export const SocialMedia = mongoose.model<SocialMediaDocument>('SocialMedia', SocialMediaSchema);
export const Project = mongoose.model<ProjectDocument>('Project', ProjectSchema); 