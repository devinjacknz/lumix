import fetch from 'node-fetch';
import { AlertResult } from '../../types';

interface WebhookConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export class WebhookNotifier {
  private config: Required<WebhookConfig>;

  constructor(config: WebhookConfig) {
    this.config = {
      url: config.url,
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      timeout: config.timeout || 5000,
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000
    };
  }

  /**
   * 发送 Webhook 通知
   */
  async send(
    alert: AlertResult,
    template?: string
  ): Promise<{ success: boolean; error?: string }> {
    let lastError: string | undefined;

    for (let i = 0; i < this.config.retryCount; i++) {
      try {
        const payload = this.formatPayload(alert, template);
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(this.config.url, {
          method: this.config.method,
          headers: this.config.headers,
          body: this.config.method !== 'GET' ? JSON.stringify(payload) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(
            `HTTP error! status: ${response.status} ${response.statusText}`
          );
        }

        return { success: true };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // 如果不是最后一次重试，等待后继续
        if (i < this.config.retryCount - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, this.config.retryDelay)
          );
        }
      }
    }

    return {
      success: false,
      error: lastError || 'Failed to send webhook notification'
    };
  }

  /**
   * 格式化负载数据
   */
  private formatPayload(alert: AlertResult, template?: string): Record<string, any> {
    return {
      id: alert.id,
      ruleId: alert.ruleId,
      severity: alert.severity,
      message: template ? this.formatTemplate(template, alert) : alert.message,
      timestamp: alert.timestamp,
      source: alert.context.source,

      // 价格数据
      price: alert.context.price && {
        symbol: alert.context.price.symbol,
        current: alert.context.price.current,
        previous: alert.context.price.previous,
        change: alert.context.price.change
      },

      // 交易量数据
      volume: alert.context.volume && {
        current: alert.context.volume.current,
        previous: alert.context.volume.previous,
        change: alert.context.volume.change
      },

      // Gas 数据
      gas: alert.context.gas && {
        price: alert.context.gas.price,
        limit: alert.context.gas.limit,
        used: alert.context.gas.used
      },

      // 系统数据
      system: alert.context.system && {
        cpu: alert.context.system.cpu,
        memory: alert.context.system.memory,
        disk: alert.context.system.disk,
        network: {
          rx: alert.context.system.network.rx,
          tx: alert.context.system.network.tx
        }
      },

      // 元数据
      metadata: alert.metadata
    };
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