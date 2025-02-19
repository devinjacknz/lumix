import { createTransport } from 'nodemailer';
import { AlertResult } from '../../types';

interface EmailConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
}

export class EmailNotifier {
  private config: Required<EmailConfig>;
  private transporter: ReturnType<typeof createTransport>;

  constructor(config: EmailConfig) {
    this.config = {
      host: config.host,
      port: config.port,
      secure: config.secure ?? true,
      auth: config.auth,
      from: config.from || config.auth.user,
      to: config.to,
      cc: config.cc || [],
      bcc: config.bcc || []
    };

    this.transporter = createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth
    });
  }

  /**
   * 发送邮件通知
   */
  async send(
    alert: AlertResult,
    template?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const html = this.formatMessage(alert, template);

      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to.join(','),
        cc: this.config.cc.join(','),
        bcc: this.config.bcc.join(','),
        subject: `[${alert.severity.toUpperCase()}] ${alert.message}`,
        html
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
    return `
      <div style="font-family: Arial, sans-serif;">
        <h2 style="color: ${this.getSeverityColor(alert.severity)};">
          ${alert.severity.toUpperCase()} Alert
        </h2>
        
        <div style="margin: 16px 0;">
          <strong>Message:</strong> ${alert.message}
        </div>
        
        <div style="margin: 16px 0;">
          <strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}
        </div>
        
        <div style="margin: 16px 0;">
          <strong>Source:</strong> ${alert.context.source}
        </div>
        
        ${this.formatContextData(alert)}
        
        ${alert.metadata ? `
          <div style="margin: 16px 0;">
            <strong>Metadata:</strong>
            <pre style="background: #f5f5f5; padding: 8px; border-radius: 4px;">
              ${JSON.stringify(alert.metadata, null, 2)}
            </pre>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 格式化上下文数据
   */
  private formatContextData(alert: AlertResult): string {
    const sections: string[] = [];

    if (alert.context.price) {
      sections.push(`
        <div style="margin: 16px 0;">
          <strong>Price Data:</strong>
          <ul>
            <li>Symbol: ${alert.context.price.symbol}</li>
            <li>Current: ${alert.context.price.current}</li>
            <li>Previous: ${alert.context.price.previous}</li>
            <li>Change: ${alert.context.price.change}%</li>
          </ul>
        </div>
      `);
    }

    if (alert.context.volume) {
      sections.push(`
        <div style="margin: 16px 0;">
          <strong>Volume Data:</strong>
          <ul>
            <li>Current: ${alert.context.volume.current}</li>
            <li>Previous: ${alert.context.volume.previous}</li>
            <li>Change: ${alert.context.volume.change}%</li>
          </ul>
        </div>
      `);
    }

    if (alert.context.gas) {
      sections.push(`
        <div style="margin: 16px 0;">
          <strong>Gas Data:</strong>
          <ul>
            <li>Price: ${alert.context.gas.price} Gwei</li>
            <li>Limit: ${alert.context.gas.limit}</li>
            <li>Used: ${alert.context.gas.used}</li>
          </ul>
        </div>
      `);
    }

    if (alert.context.system) {
      sections.push(`
        <div style="margin: 16px 0;">
          <strong>System Data:</strong>
          <ul>
            <li>CPU: ${alert.context.system.cpu}%</li>
            <li>Memory: ${alert.context.system.memory}%</li>
            <li>Disk: ${alert.context.system.disk}%</li>
            <li>Network RX: ${alert.context.system.network.rx}/s</li>
            <li>Network TX: ${alert.context.system.network.tx}/s</li>
          </ul>
        </div>
      `);
    }

    return sections.join('\n');
  }

  /**
   * 获取严重程度对应的颜色
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#dc3545';
      case 'error':
        return '#dc3545';
      case 'warning':
        return '#ffc107';
      default:
        return '#17a2b8';
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