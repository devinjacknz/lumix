import { Cache } from '@lumix/core';
import {
  AlertResult,
  NotificationConfig,
  NotificationResult,
  AlertSeverity
} from '../types';
import { EmailNotifier } from './channels/email';
import { SlackNotifier } from './channels/slack';
import { TelegramNotifier } from './channels/telegram';
import { WebhookNotifier } from './channels/webhook';

interface NotificationChannel {
  send(alert: AlertResult, template?: string): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export class NotificationManager {
  private config: Required<NotificationConfig>;
  private channels: Map<string, NotificationChannel>;
  private cache: Cache;

  constructor(config: NotificationConfig) {
    this.config = {
      channels: config.channels || [],
      rules: config.rules || [],
      templates: config.templates || {},
      retry: {
        attempts: config.retry?.attempts || 3,
        delay: config.retry?.delay || 1000
      }
    };

    this.channels = new Map();
    this.cache = new Cache();
    this.initializeChannels();
  }

  /**
   * 发送通知
   */
  async notify(alert: AlertResult): Promise<NotificationResult> {
    const channels: NotificationResult['channels'] = [];

    // 获取匹配的规则
    const matchedRules = this.config.rules.filter(rule =>
      rule.severity.includes(alert.severity)
    );

    // 获取需要通知的渠道
    const targetChannels = new Set(
      matchedRules.flatMap(rule => rule.channels)
    );

    // 检查节流
    for (const rule of matchedRules) {
      if (rule.throttle && this.isThrottled(alert, rule.throttle)) {
        targetChannels.clear();
        break;
      }
    }

    // 发送通知
    for (const channelId of targetChannels) {
      const channel = this.channels.get(channelId);
      if (!channel) continue;

      const template = this.getTemplate(alert, channelId);
      const result = await this.sendWithRetry(channel, alert, template);

      channels.push({
        type: channelId,
        ...result,
        timestamp: Date.now()
      });
    }

    return {
      success: channels.every(c => c.success),
      alertId: alert.id,
      channels,
      metadata: {
        rulesMatched: matchedRules.length,
        channelsNotified: channels.length
      }
    };
  }

  /**
   * 添加通知渠道
   */
  addChannel(
    type: string,
    config: NotificationConfig['channels'][0]['config']
  ): void {
    const channel = this.createChannel(type, config);
    if (channel) {
      this.channels.set(type, channel);
    }
  }

  /**
   * 移除通知渠道
   */
  removeChannel(type: string): void {
    this.channels.delete(type);
  }

  /**
   * 更新通知规则
   */
  updateRules(rules: NotificationConfig['rules']): void {
    this.config.rules = rules;
  }

  /**
   * 更新通知模板
   */
  updateTemplates(templates: Record<string, string>): void {
    this.config.templates = templates;
  }

  /**
   * 初始化通知渠道
   */
  private initializeChannels(): void {
    for (const { type, config, enabled } of this.config.channels) {
      if (!enabled) continue;
      const channel = this.createChannel(type, config);
      if (channel) {
        this.channels.set(type, channel);
      }
    }
  }

  /**
   * 创建通知渠道
   */
  private createChannel(
    type: string,
    config: Record<string, any>
  ): NotificationChannel | null {
    switch (type) {
      case 'email':
        return new EmailNotifier(config);
      case 'slack':
        return new SlackNotifier(config);
      case 'telegram':
        return new TelegramNotifier(config);
      case 'webhook':
        return new WebhookNotifier(config);
      default:
        console.warn(`Unsupported notification channel: ${type}`);
        return null;
    }
  }

  /**
   * 获取通知模板
   */
  private getTemplate(alert: AlertResult, channelId: string): string | undefined {
    // 查找匹配的规则
    const rule = this.config.rules.find(r =>
      r.severity.includes(alert.severity) &&
      r.channels.includes(channelId)
    );

    // 使用规则指定的模板
    if (rule?.template) {
      return rule.template;
    }

    // 使用渠道默认模板
    return this.config.templates[channelId];
  }

  /**
   * 检查是否需要节流
   */
  private isThrottled(
    alert: AlertResult,
    throttle: { count: number; window: number }
  ): boolean {
    const key = `throttle:${alert.ruleId}`;
    const now = Date.now();
    const window = throttle.window;

    // 获取历史记录
    const history = this.cache.get<number[]>(key) || [];

    // 清理过期记录
    const validHistory = history.filter(t => now - t < window);

    // 检查是否超过限制
    if (validHistory.length >= throttle.count) {
      return true;
    }

    // 更新历史记录
    validHistory.push(now);
    this.cache.set(key, validHistory, window);

    return false;
  }

  /**
   * 带重试的发送通知
   */
  private async sendWithRetry(
    channel: NotificationChannel,
    alert: AlertResult,
    template?: string
  ): Promise<{ success: boolean; error?: string }> {
    let lastError: string | undefined;

    for (let i = 0; i < this.config.retry.attempts; i++) {
      try {
        const result = await channel.send(alert, template);
        if (result.success) {
          return result;
        }
        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // 等待重试
      if (i < this.config.retry.attempts - 1) {
        await new Promise(resolve =>
          setTimeout(resolve, this.config.retry.delay)
        );
      }
    }

    return {
      success: false,
      error: lastError || 'Failed to send notification after retries'
    };
  }
} 