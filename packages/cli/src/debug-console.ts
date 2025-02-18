import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import path from 'path';
import { EventEmitter } from 'events';
import { ChainProtocol } from '@lumix/core/src/chain/abstract';
import { MarketAnalyzer } from '@lumix/core/src/ai/market-analyzer';
import { RiskAssessor } from '@lumix/core/src/security/risk-assessor';
import { EmergencyHandler } from '@lumix/core/src/security/emergency-handler';

interface DebugConfig {
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxConnections: number;
  dataRetentionPeriod: number;
}

interface DebugMessage {
  type: 'log' | 'error' | 'metric' | 'event' | 'state';
  source: string;
  timestamp: number;
  data: any;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  network: {
    in: number;
    out: number;
  };
  transactions: {
    pending: number;
    completed: number;
    failed: number;
  };
}

class DebugConsole extends EventEmitter {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();
  private messageHistory: DebugMessage[] = [];
  private metrics: SystemMetrics;
  private isRunning: boolean = false;

  constructor(private config: DebugConfig) {
    super();
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.setupExpress();
    this.setupWebSocket();
    this.initializeMetrics();
  }

  private setupExpress() {
    // 静态文件服务
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // API路由
    this.app.get('/api/metrics', (req, res) => {
      res.json(this.metrics);
    });

    this.app.get('/api/messages', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      const filtered = this.filterMessages(req.query);
      res.json(filtered.slice(-limit));
    });

    this.app.get('/api/state', (req, res) => {
      res.json({
        isRunning: this.isRunning,
        connectedClients: this.clients.size,
        messageCount: this.messageHistory.length,
      });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      this.handleNewConnection(ws);
    });
  }

  private handleNewConnection(ws: WebSocket) {
    // 检查连接数限制
    if (this.clients.size >= this.config.maxConnections) {
      ws.close(1013, 'Maximum connections reached');
      return;
    }

    this.clients.add(ws);

    // 发送初始状态
    ws.send(JSON.stringify({
      type: 'init',
      data: {
        metrics: this.metrics,
        recentMessages: this.getRecentMessages(50),
      },
    }));

    // 处理消息
    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleClientMessage(ws, message);
      } catch (error) {
        this.sendError(ws, 'Invalid message format');
      }
    });

    // 处理关闭
    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  private handleClientMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'command':
        this.executeCommand(ws, message.data);
        break;
      case 'subscribe':
        this.handleSubscription(ws, message.data);
        break;
      case 'query':
        this.handleQuery(ws, message.data);
        break;
      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  private async executeCommand(ws: WebSocket, command: any) {
    try {
      switch (command.action) {
        case 'pause':
          await this.pauseSystem();
          break;
        case 'resume':
          await this.resumeSystem();
          break;
        case 'clear':
          this.clearHistory();
          break;
        default:
          throw new Error('Unknown command');
      }

      ws.send(JSON.stringify({
        type: 'commandResult',
        data: { success: true },
      }));
    } catch (error) {
      this.sendError(ws, error.message);
    }
  }

  private handleSubscription(ws: WebSocket, subscription: any) {
    // 实现订阅逻辑
  }

  private handleQuery(ws: WebSocket, query: any) {
    // 实现查询逻辑
  }

  private initializeMetrics() {
    this.metrics = {
      cpu: 0,
      memory: 0,
      network: {
        in: 0,
        out: 0,
      },
      transactions: {
        pending: 0,
        completed: 0,
        failed: 0,
      },
    };
  }

  private updateMetrics() {
    // 更新系统指标
    setInterval(async () => {
      // 更新CPU使用率
      this.metrics.cpu = await this.getCPUUsage();
      
      // 更新内存使用率
      this.metrics.memory = await this.getMemoryUsage();
      
      // 更新网络指标
      const networkStats = await this.getNetworkStats();
      this.metrics.network = networkStats;
      
      // 更新交易指标
      const txStats = await this.getTransactionStats();
      this.metrics.transactions = txStats;

      // 广播更新
      this.broadcast({
        type: 'metrics',
        data: this.metrics,
      });
    }, 1000);
  }

  private async getCPUUsage(): Promise<number> {
    // 实现CPU使用率计算
    return 0;
  }

  private async getMemoryUsage(): Promise<number> {
    // 实现内存使用率计算
    return 0;
  }

  private async getNetworkStats(): Promise<{ in: number; out: number }> {
    // 实现网络统计
    return { in: 0, out: 0 };
  }

  private async getTransactionStats(): Promise<{
    pending: number;
    completed: number;
    failed: number;
  }> {
    // 实现交易统计
    return {
      pending: 0,
      completed: 0,
      failed: 0,
    };
  }

  public log(message: DebugMessage) {
    // 添加消息到历史记录
    this.messageHistory.push(message);

    // 清理过期消息
    this.cleanupHistory();

    // 广播消息
    this.broadcast({
      type: 'log',
      data: message,
    });

    // 触发事件
    this.emit('message', message);
  }

  private cleanupHistory() {
    const now = Date.now();
    const cutoff = now - this.config.dataRetentionPeriod;
    this.messageHistory = this.messageHistory.filter(
      msg => msg.timestamp > cutoff
    );
  }

  private getRecentMessages(limit: number): DebugMessage[] {
    return this.messageHistory.slice(-limit);
  }

  private filterMessages(filters: any): DebugMessage[] {
    return this.messageHistory.filter(msg => {
      if (filters.type && msg.type !== filters.type) return false;
      if (filters.source && msg.source !== filters.source) return false;
      if (filters.from && msg.timestamp < parseInt(filters.from)) return false;
      if (filters.to && msg.timestamp > parseInt(filters.to)) return false;
      return true;
    });
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private sendError(ws: WebSocket, message: string) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message },
    }));
  }

  private async pauseSystem() {
    // 实现系统暂停逻辑
    this.isRunning = false;
  }

  private async resumeSystem() {
    // 实现系统恢复逻辑
    this.isRunning = true;
  }

  private clearHistory() {
    this.messageHistory = [];
    this.broadcast({
      type: 'clear',
      data: null,
    });
  }

  public async start() {
    return new Promise<void>((resolve, reject) => {
      try {
        this.server.listen(this.config.port, () => {
          console.log(`调试控制台已启动，端口: ${this.config.port}`);
          this.isRunning = true;
          this.updateMetrics();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public async stop() {
    return new Promise<void>((resolve, reject) => {
      try {
        // 关闭所有WebSocket连接
        this.clients.forEach(client => {
          client.close();
        });
        this.clients.clear();

        // 关闭服务器
        this.server.close(() => {
          this.isRunning = false;
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

export { DebugConsole, DebugConfig, DebugMessage, SystemMetrics }; 