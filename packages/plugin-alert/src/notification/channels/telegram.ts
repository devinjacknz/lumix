import { Telegraf } from 'telegraf';
import { AlertResult } from '../../types';

interface TelegramConfig {
  token: string;
  chatId: string | number;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
}

export class TelegramNotifier {
  private config: Required<TelegramConfig>;
  private bot: Telegraf;

  constructor(config: TelegramConfig) {
    this.config = {
      token: config.token,
      chatId: config.chatId,
      parseMode: config.parseMode || 'HTML',
      disableNotification: config.disableNotification || false,
      disableWebPagePreview: config.disableWebPagePreview || true
    };

    this.bot = new Telegraf(this.config.token);
  }

  /**
   * 发送 Telegram 通知
   */
  async send(
    alert: AlertResult,
    template?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const message = this.formatMessage(alert, template);

      await this.bot.telegram.sendMessage(
        this.config.chatId,
        message,
        {
          parse_mode: this.config.parseMode,
          disable_notification: this.config.disableNotification,
          disable_web_page_preview: this.config.disableWebPagePreview
        }
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 格式化消息
   */
  private formatMessage(alert: AlertResult, template?: string): string {
    if (template) {
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

    // 默认模板
    const sections: string[] = [];

    // 标题
    sections.push(`${this.getSeverityEmoji(alert.severity)} <b>${alert.severity.toUpperCase()} Alert</b>`);
    sections.push('');

    // 消息
    sections.push(`<b>Message:</b> ${this.escapeHtml(alert.message)}`);
    sections.push('');

    // 时间和来源
    sections.push(`<b>Time:</b> ${new Date(alert.timestamp).toLocaleString()}`);
    sections.push(`<b>Source:</b> ${this.escapeHtml(alert.context.source)}`);
    sections.push('');

    // 价格数据
    if (alert.context.price) {
      sections.push('<b>Price Data:</b>');
      sections.push(`• Symbol: ${alert.context.price.symbol}`);
      sections.push(`• Current: ${alert.context.price.current}`);
      sections.push(`• Previous: ${alert.context.price.previous}`);
      sections.push(`• Change: ${alert.context.price.change}%`);
      sections.push('');
    }

    // 交易量数据
    if (alert.context.volume) {
      sections.push('<b>Volume Data:</b>');
      sections.push(`• Current: ${alert.context.volume.current}`);
      sections.push(`• Previous: ${alert.context.volume.previous}`);
      sections.push(`• Change: ${alert.context.volume.change}%`);
      sections.push('');
    }

    // Gas 数据
    if (alert.context.gas) {
      sections.push('<b>Gas Data:</b>');
      sections.push(`• Price: ${alert.context.gas.price} Gwei`);
      sections.push(`• Limit: ${alert.context.gas.limit}`);
      sections.push(`• Used: ${alert.context.gas.used}`);
      sections.push('');
    }

    // 系统数据
    if (alert.context.system) {
      sections.push('<b>System Data:</b>');
      sections.push(`• CPU: ${alert.context.system.cpu}%`);
      sections.push(`• Memory: ${alert.context.system.memory}%`);
      sections.push(`• Disk: ${alert.context.system.disk}%`);
      sections.push(`• Network RX: ${alert.context.system.network.rx}/s`);
      sections.push(`• Network TX: ${alert.context.system.network.tx}/s`);
      sections.push('');
    }

    // 元数据
    if (alert.metadata) {
      sections.push('<b>Metadata:</b>');
      sections.push('<pre>');
      sections.push(JSON.stringify(alert.metadata, null, 2));
      sections.push('</pre>');
    }

    return sections.join('\n');
  }

  /**
   * 获取严重程度对应的表情
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  }

  /**
   * 转义 HTML 特殊字符
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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