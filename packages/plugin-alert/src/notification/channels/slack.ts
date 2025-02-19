import { WebClient } from '@slack/web-api';
import { AlertResult } from '../../types';

interface SlackConfig {
  token: string;
  channel: string;
  username?: string;
  icon?: string;
  threadTs?: string;
}

export class SlackNotifier {
  private config: Required<SlackConfig>;
  private client: WebClient;

  constructor(config: SlackConfig) {
    this.config = {
      token: config.token,
      channel: config.channel,
      username: config.username || 'Lumix Alert',
      icon: config.icon || ':warning:',
      threadTs: config.threadTs || ''
    };

    this.client = new WebClient(this.config.token);
  }

  /**
   * 发送 Slack 通知
   */
  async send(
    alert: AlertResult,
    template?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const blocks = this.formatBlocks(alert, template);

      await this.client.chat.postMessage({
        channel: this.config.channel,
        username: this.config.username,
        icon_emoji: this.config.icon,
        thread_ts: this.config.threadTs,
        blocks
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 格式化消息块
   */
  private formatBlocks(alert: AlertResult, template?: string): any[] {
    const blocks: any[] = [];

    // 标题块
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${this.getSeverityEmoji(alert.severity)} ${alert.severity.toUpperCase()} Alert`,
        emoji: true
      }
    });

    // 消息块
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: template ? this.formatTemplate(template, alert) : alert.message
      }
    });

    // 时间和来源块
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Time:* ${new Date(alert.timestamp).toLocaleString()}`
        },
        {
          type: 'mrkdwn',
          text: `*Source:* ${alert.context.source}`
        }
      ]
    });

    // 添加上下文数据
    this.addContextBlocks(blocks, alert);

    // 添加元数据
    if (alert.metadata) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Metadata:*\n```' + JSON.stringify(alert.metadata, null, 2) + '```'
        }
      });
    }

    // 添加分隔符
    blocks.push({ type: 'divider' });

    return blocks;
  }

  /**
   * 添加上下文数据块
   */
  private addContextBlocks(blocks: any[], alert: AlertResult): void {
    if (alert.context.price) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Price Data:*
• Symbol: ${alert.context.price.symbol}
• Current: ${alert.context.price.current}
• Previous: ${alert.context.price.previous}
• Change: ${alert.context.price.change}%`
        }
      });
    }

    if (alert.context.volume) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Volume Data:*
• Current: ${alert.context.volume.current}
• Previous: ${alert.context.volume.previous}
• Change: ${alert.context.volume.change}%`
        }
      });
    }

    if (alert.context.gas) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Gas Data:*
• Price: ${alert.context.gas.price} Gwei
• Limit: ${alert.context.gas.limit}
• Used: ${alert.context.gas.used}`
        }
      });
    }

    if (alert.context.system) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*System Data:*
• CPU: ${alert.context.system.cpu}%
• Memory: ${alert.context.system.memory}%
• Disk: ${alert.context.system.disk}%
• Network RX: ${alert.context.system.network.rx}/s
• Network TX: ${alert.context.system.network.tx}/s`
        }
      });
    }
  }

  /**
   * 格式化模板
   */
  private formatTemplate(template: string, alert: AlertResult): string {
    return template.replace(/\${(\w+)}/g, (_, key) => {
      const value = this.getContextValue(key, {
        alert,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
        ...alert.context,
        ...alert.metadata
      });
      return value !== undefined ? String(value) : '';
    });
  }

  /**
   * 获取严重程度对应的表情
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return ':red_circle:';
      case 'error':
        return ':x:';
      case 'warning':
        return ':warning:';
      default:
        return ':information_source:';
    }
  }

  /**
   * 获取上下文值
   */
  private getContextValue(key: string, context: Record<string, any>): any {
    const parts = key.split('.');
    let value: any = context;
    
    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }

    return value;
  }
} 