import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { join } from 'path';
import {
  DashboardConfig,
  DashboardError,
  WidgetData,
  WidgetType,
  DashboardEvent
} from './types';

export class DashboardServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: Server;
  private config: Required<DashboardConfig>;
  private widgets: Map<string, WidgetData>;
  private updateInterval: NodeJS.Timeout | null;

  constructor(config: DashboardConfig = {}) {
    // 初始化配置
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      staticDir: config.staticDir || join(__dirname, '../public'),
      apiPrefix: config.apiPrefix || '/api',
      updateInterval: config.updateInterval || 5000,
      maxHistorySize: config.maxHistorySize || 1000,
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000, // 24小时
      cacheEnabled: config.cacheEnabled ?? true,
      cacheExpiration: config.cacheExpiration || 60 * 1000, // 1分钟
      theme: config.theme || 'light',
      defaultLayout: config.defaultLayout || [],
      customCss: config.customCss || ''
    };

    // 初始化 Express 应用
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.widgets = new Map();
    this.updateInterval = null;

    // 配置中间件
    this.setupMiddleware();

    // 配置路由
    this.setupRoutes();

    // 配置 WebSocket
    this.setupWebSocket();
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.server.listen(this.config.port, this.config.host, () => {
          console.log(`Dashboard server running at http://${this.config.host}:${this.config.port}`);
          resolve();
        });

        this.server.on('error', reject);
      });

      // 启动定时更新
      this.startUpdates();
    } catch (error) {
      throw new DashboardError('Failed to start dashboard server', {
        cause: error
      });
    }
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    try {
      // 停止定时更新
      this.stopUpdates();

      // 关闭 WebSocket 连接
      await new Promise<void>(resolve => this.io.close(resolve));

      // 关闭 HTTP 服务器
      await new Promise<void>((resolve, reject) => {
        this.server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (error) {
      throw new DashboardError('Failed to stop dashboard server', {
        cause: error
      });
    }
  }

  /**
   * 更新小部件数据
   */
  updateWidget(data: WidgetData): void {
    try {
      // 验证数据
      this.validateWidgetData(data);

      // 存储数据
      this.widgets.set(data.id, data);

      // 广播更新
      this.broadcastUpdate('widget_update', data);
    } catch (error) {
      throw new DashboardError('Failed to update widget', { cause: error });
    }
  }

  /**
   * 获取小部件数据
   */
  getWidget(id: string): WidgetData | undefined {
    return this.widgets.get(id);
  }

  /**
   * 获取所有小部件数据
   */
  getAllWidgets(): WidgetData[] {
    return Array.from(this.widgets.values());
  }

  /**
   * 删除小部件数据
   */
  deleteWidget(id: string): boolean {
    const deleted = this.widgets.delete(id);
    if (deleted) {
      this.broadcastUpdate('widget_update', { id, deleted: true });
    }
    return deleted;
  }

  /**
   * 清理过期数据
   */
  private cleanupExpiredData(): void {
    const now = Date.now();
    const expiry = now - this.config.retentionPeriod;

    for (const [id, data] of this.widgets.entries()) {
      if (data.timestamp < expiry) {
        this.widgets.delete(id);
      }
    }
  }

  /**
   * 配置中间件
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(this.config.staticDir));
  }

  /**
   * 配置路由
   */
  private setupRoutes(): void {
    // API 路由
    const router = express.Router();

    // 获取配置
    router.get('/config', (req, res) => {
      res.json({
        theme: this.config.theme,
        defaultLayout: this.config.defaultLayout,
        customCss: this.config.customCss
      });
    });

    // 获取所有小部件
    router.get('/widgets', (req, res) => {
      res.json(this.getAllWidgets());
    });

    // 获取单个小部件
    router.get('/widgets/:id', (req, res) => {
      const widget = this.getWidget(req.params.id);
      if (widget) {
        res.json(widget);
      } else {
        res.status(404).json({ error: 'Widget not found' });
      }
    });

    // 更新小部件
    router.post('/widgets/:id', (req, res) => {
      try {
        const data = {
          id: req.params.id,
          ...req.body
        };
        this.updateWidget(data);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // 删除小部件
    router.delete('/widgets/:id', (req, res) => {
      const deleted = this.deleteWidget(req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Widget not found' });
      }
    });

    this.app.use(this.config.apiPrefix, router);
  }

  /**
   * 配置 WebSocket
   */
  private setupWebSocket(): void {
    this.io.on('connection', socket => {
      console.log('Client connected:', socket.id);

      // 发送初始数据
      socket.emit('init', {
        widgets: this.getAllWidgets(),
        config: {
          theme: this.config.theme,
          defaultLayout: this.config.defaultLayout,
          customCss: this.config.customCss
        }
      });

      // 处理更新请求
      socket.on('widget_update', (data: WidgetData) => {
        try {
          this.updateWidget(data);
        } catch (error) {
          socket.emit('error', {
            message: error.message,
            data
          });
        }
      });

      // 处理布局更新
      socket.on('layout_change', layout => {
        this.config.defaultLayout = layout;
        this.broadcastUpdate('layout_change', layout);
      });

      // 处理主题更新
      socket.on('theme_change', theme => {
        this.config.theme = theme;
        this.broadcastUpdate('theme_change', theme);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  /**
   * 启动定时更新
   */
  private startUpdates(): void {
    if (this.updateInterval) {
      return;
    }

    this.updateInterval = setInterval(() => {
      try {
        // 清理过期数据
        this.cleanupExpiredData();

        // 更新小部件数据
        this.updateAllWidgets();
      } catch (error) {
        console.error('Failed to update widgets:', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * 停止定时更新
   */
  private stopUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 更新所有小部件
   */
  private async updateAllWidgets(): Promise<void> {
    for (const widget of this.widgets.values()) {
      try {
        // 根据小部件类型更新数据
        const updatedData = await this.fetchWidgetData(widget.type);
        if (updatedData) {
          this.updateWidget({
            ...widget,
            data: updatedData,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error(`Failed to update widget ${widget.id}:`, error);
      }
    }
  }

  /**
   * 获取小部件数据
   */
  private async fetchWidgetData(type: WidgetType): Promise<any> {
    // TODO: 实现各类型小部件的数据获取逻辑
    return null;
  }

  /**
   * 广播更新
   */
  private broadcastUpdate(type: DashboardEvent['type'], data: any): void {
    const event: DashboardEvent = {
      type,
      timestamp: Date.now(),
      data
    };
    this.io.emit(type, event);
  }

  /**
   * 验证小部件数据
   */
  private validateWidgetData(data: WidgetData): void {
    if (!data.id) {
      throw new DashboardError('Widget ID is required');
    }
    if (!data.type) {
      throw new DashboardError('Widget type is required');
    }
    if (!Object.values(WidgetType).includes(data.type)) {
      throw new DashboardError(`Invalid widget type: ${data.type}`);
    }
    if (!data.timestamp) {
      throw new DashboardError('Widget timestamp is required');
    }
    if (data.timestamp > Date.now()) {
      throw new DashboardError('Widget timestamp cannot be in the future');
    }
  }
} 