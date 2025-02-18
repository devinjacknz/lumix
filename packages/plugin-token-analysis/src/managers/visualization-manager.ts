import { logger } from "@lumix/core";

export interface VisualizationConfig {
  defaultTheme: string;
  defaultColors: string[];
  defaultFontFamily: string;
  defaultFontSize: number;
  animationDuration: number;
  responsiveBreakpoints: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  updateInterval: number;
  maxDataPoints: number;
  cacheEnabled: boolean;
  cacheTTL: number;
}

export interface ChartOptions {
  type: string;
  data: any;
  options?: Record<string, any>;
  theme?: string;
  responsive?: boolean;
  animation?: boolean;
}

export interface ChartInstance {
  id: string;
  type: string;
  data: any;
  options: Record<string, any>;
  lastUpdate: number;
  isActive: boolean;
}

export class VisualizationManager {
  private config: VisualizationConfig;
  private charts: Map<string, ChartInstance>;
  private themes: Map<string, Record<string, any>>;
  private cache: Map<string, {
    data: any;
    timestamp: number;
  }>;
  private updateTimers: Map<string, NodeJS.Timeout>;

  constructor(config: Partial<VisualizationConfig> = {}) {
    this.config = {
      defaultTheme: "light",
      defaultColors: [
        "#4e79a7",
        "#f28e2c",
        "#e15759",
        "#76b7b2",
        "#59a14f",
        "#edc949",
        "#af7aa1",
        "#ff9da7",
        "#9c755f",
        "#bab0ab"
      ],
      defaultFontFamily: "Arial, sans-serif",
      defaultFontSize: 12,
      animationDuration: 500,
      responsiveBreakpoints: {
        sm: 576,
        md: 768,
        lg: 992,
        xl: 1200
      },
      updateInterval: 5000, // 5秒
      maxDataPoints: 100,
      cacheEnabled: true,
      cacheTTL: 300000, // 5分钟
      ...config
    };
    this.charts = new Map();
    this.themes = new Map();
    this.cache = new Map();
    this.updateTimers = new Map();
    this.registerDefaultThemes();
  }

  private registerDefaultThemes(): void {
    // 亮色主题
    this.themes.set("light", {
      backgroundColor: "#ffffff",
      textColor: "#333333",
      gridColor: "#e0e0e0",
      borderColor: "#cccccc",
      tooltipBackground: "#ffffff",
      tooltipBorder: "#d9d9d9"
    });

    // 暗色主题
    this.themes.set("dark", {
      backgroundColor: "#1a1a1a",
      textColor: "#ffffff",
      gridColor: "#404040",
      borderColor: "#666666",
      tooltipBackground: "#333333",
      tooltipBorder: "#666666"
    });
  }

  async createChart(options: ChartOptions): Promise<string> {
    try {
      // 验证选项
      this.validateChartOptions(options);

      // 创建图表实例
      const chartId = this.generateId();
      const chart: ChartInstance = {
        id: chartId,
        type: options.type,
        data: options.data,
        options: {
          ...this.getThemeOptions(options.theme || this.config.defaultTheme),
          ...options.options,
          responsive: options.responsive !== false,
          animation: {
            duration: options.animation ? this.config.animationDuration : 0
          }
        },
        lastUpdate: Date.now(),
        isActive: true
      };

      // 存储图表
      this.charts.set(chartId, chart);

      // 设置自动更新
      if (options.options?.realtime) {
        this.startChartUpdates(chartId);
      }

      logger.info(
        "Visualization Manager",
        `Created chart: ${chartId}`
      );

      return chartId;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Visualization Manager",
          `Failed to create chart: ${error.message}`
        );
      }
      throw error;
    }
  }

  async updateChart(
    chartId: string,
    data: any,
    options?: Record<string, any>
  ): Promise<void> {
    try {
      const chart = this.getChart(chartId);

      // 更新数据
      chart.data = this.processChartData(data, chart.type);
      
      // 更新选项
      if (options) {
        chart.options = {
          ...chart.options,
          ...options
        };
      }

      chart.lastUpdate = Date.now();

      logger.info(
        "Visualization Manager",
        `Updated chart: ${chartId}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Visualization Manager",
          `Failed to update chart: ${error.message}`
        );
      }
      throw error;
    }
  }

  async deleteChart(chartId: string): Promise<void> {
    try {
      const chart = this.getChart(chartId);
      
      // 停止更新
      this.stopChartUpdates(chartId);
      
      // 删除图表
      this.charts.delete(chartId);

      logger.info(
        "Visualization Manager",
        `Deleted chart: ${chartId}`
      );
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Visualization Manager",
          `Failed to delete chart: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getChartData(chartId: string): Promise<any> {
    try {
      const chart = this.getChart(chartId);
      
      // 检查缓存
      const cacheKey = `chart:${chartId}`;
      const cached = this.checkCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 处理数据
      const processedData = this.processChartData(
        chart.data,
        chart.type
      );

      // 缓存结果
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          data: processedData,
          timestamp: Date.now()
        });
      }

      return processedData;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Visualization Manager",
          `Failed to get chart data: ${error.message}`
        );
      }
      throw error;
    }
  }

  private validateChartOptions(options: ChartOptions): void {
    if (!options.type) {
      throw new Error("Chart type is required");
    }
    if (!options.data) {
      throw new Error("Chart data is required");
    }
  }

  private getChart(id: string): ChartInstance {
    const chart = this.charts.get(id);
    if (!chart) {
      throw new Error(`Chart not found: ${id}`);
    }
    return chart;
  }

  private processChartData(data: any, type: string): any {
    try {
      switch (type) {
        case "line":
          return this.processLineChartData(data);
        case "bar":
          return this.processBarChartData(data);
        case "pie":
          return this.processPieChartData(data);
        case "scatter":
          return this.processScatterChartData(data);
        default:
          return data;
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Visualization Manager",
          `Failed to process chart data: ${error.message}`
        );
      }
      throw error;
    }
  }

  private processLineChartData(data: any): any {
    // 限制数据点数量
    if (Array.isArray(data)) {
      return data.slice(-this.config.maxDataPoints);
    }
    return data;
  }

  private processBarChartData(data: any): any {
    // 处理条形图数据
    return data;
  }

  private processPieChartData(data: any): any {
    // 处理饼图数据
    return data;
  }

  private processScatterChartData(data: any): any {
    // 处理散点图数据
    return data;
  }

  private getThemeOptions(theme: string): Record<string, any> {
    const themeOptions = this.themes.get(theme);
    if (!themeOptions) {
      return this.themes.get(this.config.defaultTheme);
    }
    return themeOptions;
  }

  private startChartUpdates(chartId: string): void {
    const timer = setInterval(async () => {
      try {
        const chart = this.getChart(chartId);
        if (!chart.isActive) {
          this.stopChartUpdates(chartId);
          return;
        }

        // 获取新数据
        const newData = await this.fetchChartData(chartId);
        
        // 更新图表
        await this.updateChart(chartId, newData);
      } catch (error) {
        if (error instanceof Error) {
          logger.error(
            "Visualization Manager",
            `Failed to update chart ${chartId}: ${error.message}`
          );
        }
      }
    }, this.config.updateInterval);

    this.updateTimers.set(chartId, timer);
  }

  private stopChartUpdates(chartId: string): void {
    const timer = this.updateTimers.get(chartId);
    if (timer) {
      clearInterval(timer);
      this.updateTimers.delete(chartId);
    }
  }

  private async fetchChartData(chartId: string): Promise<any> {
    // TODO: 实现数据获取逻辑
    return null;
  }

  private checkCache(key: string): any {
    if (!this.config.cacheEnabled) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  public registerTheme(name: string, options: Record<string, any>): void {
    this.themes.set(name, options);
  }

  public getActiveChartCount(): number {
    return Array.from(this.charts.values()).filter(
      chart => chart.isActive
    ).length;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 