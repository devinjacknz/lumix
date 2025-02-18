import { Statistics } from './statistics';
import { Indicators } from './indicators';

export class PriceAnalyzer {
  private statistics: Statistics;
  private indicators: Indicators;

  constructor() {
    this.statistics = new Statistics();
    this.indicators = new Indicators();
  }

  // 识别支撑和阻力位
  public identifySupportResistance(prices: number[]): {
    support: number[];
    resistance: number[];
  } {
    const support: number[] = [];
    const resistance: number[] = [];
    const windowSize = 20; // 分析窗口大小

    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const leftWindow = prices.slice(i - windowSize, i);
      const rightWindow = prices.slice(i + 1, i + windowSize + 1);
      const currentPrice = prices[i];

      // 识别支撑位
      if (this.isLocalMinimum(currentPrice, leftWindow, rightWindow)) {
        support.push(currentPrice);
      }

      // 识别阻力位
      if (this.isLocalMaximum(currentPrice, leftWindow, rightWindow)) {
        resistance.push(currentPrice);
      }
    }

    // 合并相近的支撑位和阻力位
    return {
      support: this.mergeCloseLevels(support),
      resistance: this.mergeCloseLevels(resistance)
    };
  }

  // 识别价格模式
  public identifyPricePatterns(prices: number[]): Array<{
    type: string;
    start: number;
    end: number;
    confidence: number;
  }> {
    const patterns: Array<{
      type: string;
      start: number;
      end: number;
      confidence: number;
    }> = [];

    // 识别头肩顶/底形态
    this.identifyHeadAndShoulders(prices).forEach(pattern => patterns.push(pattern));

    // 识别双顶/双底形态
    this.identifyDoubleTopBottom(prices).forEach(pattern => patterns.push(pattern));

    // 识别三角形形态
    this.identifyTriangle(prices).forEach(pattern => patterns.push(pattern));

    // 识别旗形和三角旗形态
    this.identifyFlagsPennants(prices).forEach(pattern => patterns.push(pattern));

    // 按时间排序
    return patterns.sort((a, b) => a.start - b.start);
  }

  // 分析价格趋势
  public analyzePriceTrends(prices: number[]): Array<{
    period: string;
    direction: 'up' | 'down' | 'neutral';
    strength: number;
  }> {
    const trends: Array<{
      period: string;
      direction: 'up' | 'down' | 'neutral';
      strength: number;
    }> = [];

    // 分析不同时间周期的趋势
    const periods = [
      { name: 'short', length: 10 },
      { name: 'medium', length: 30 },
      { name: 'long', length: 90 }
    ];

    for (const period of periods) {
      const trendData = this.analyzeTrendForPeriod(prices, period.length);
      trends.push({
        period: period.name,
        ...trendData
      });
    }

    return trends;
  }

  // 计算价格动量
  public calculateMomentum(prices: number[]): {
    momentum: number[];
    roc: number[];
    acceleration: number[];
  } {
    // 计算动量指标
    const momentum = this.indicators.momentum(prices);

    // 计算变化率
    const roc = prices.slice(1).map((price, i) => 
      ((price - prices[i]) / prices[i]) * 100
    );

    // 计算加速度
    const acceleration = momentum.slice(1).map((m, i) => m - momentum[i]);

    return { momentum, roc, acceleration };
  }

  // 识别价格突破
  public identifyBreakouts(
    prices: number[],
    volumes: number[]
  ): Array<{
    type: 'support' | 'resistance';
    price: number;
    volume: number;
    strength: number;
    timestamp: number;
  }> {
    const breakouts: Array<{
      type: 'support' | 'resistance';
      price: number;
      volume: number;
      strength: number;
      timestamp: number;
    }> = [];

    // 获取支撑和阻力位
    const { support, resistance } = this.identifySupportResistance(prices);

    // 检测突破
    for (let i = 1; i < prices.length; i++) {
      const currentPrice = prices[i];
      const previousPrice = prices[i - 1];
      const currentVolume = volumes[i];
      const avgVolume = this.statistics.mean(volumes.slice(Math.max(0, i - 20), i));

      // 检测支撑位突破
      support.forEach(level => {
        if (previousPrice >= level && currentPrice < level) {
          breakouts.push({
            type: 'support',
            price: currentPrice,
            volume: currentVolume,
            strength: this.calculateBreakoutStrength(currentPrice, level, currentVolume, avgVolume),
            timestamp: i
          });
        }
      });

      // 检测阻力位突破
      resistance.forEach(level => {
        if (previousPrice <= level && currentPrice > level) {
          breakouts.push({
            type: 'resistance',
            price: currentPrice,
            volume: currentVolume,
            strength: this.calculateBreakoutStrength(currentPrice, level, currentVolume, avgVolume),
            timestamp: i
          });
        }
      });
    }

    return breakouts;
  }

  // 计算价格波动
  public calculatePriceSwings(prices: number[]): {
    swings: Array<{
      start: number;
      end: number;
      magnitude: number;
      duration: number;
    }>;
    statistics: {
      averageMagnitude: number;
      averageDuration: number;
      largestSwing: number;
    };
  } {
    const swings: Array<{
      start: number;
      end: number;
      magnitude: number;
      duration: number;
    }> = [];

    let swingStart = 0;
    let previousDirection = prices[1] > prices[0] ? 'up' : 'down';

    for (let i = 1; i < prices.length - 1; i++) {
      const currentDirection = prices[i + 1] > prices[i] ? 'up' : 'down';

      if (currentDirection !== previousDirection) {
        swings.push({
          start: swingStart,
          end: i,
          magnitude: Math.abs(prices[i] - prices[swingStart]),
          duration: i - swingStart
        });
        swingStart = i;
        previousDirection = currentDirection;
      }
    }

    // 计算统计数据
    const magnitudes = swings.map(s => s.magnitude);
    const durations = swings.map(s => s.duration);

    return {
      swings,
      statistics: {
        averageMagnitude: this.statistics.mean(magnitudes),
        averageDuration: this.statistics.mean(durations),
        largestSwing: Math.max(...magnitudes)
      }
    };
  }

  // 私有辅助方法
  private isLocalMinimum(
    price: number,
    leftWindow: number[],
    rightWindow: number[]
  ): boolean {
    return price <= Math.min(...leftWindow) && price <= Math.min(...rightWindow);
  }

  private isLocalMaximum(
    price: number,
    leftWindow: number[],
    rightWindow: number[]
  ): boolean {
    return price >= Math.max(...leftWindow) && price >= Math.max(...rightWindow);
  }

  private mergeCloseLevels(levels: number[]): number[] {
    if (levels.length === 0) return [];

    const threshold = this.statistics.stdDev(levels) * 0.5;
    const merged: number[] = [];
    let currentGroup: number[] = [levels[0]];

    for (let i = 1; i < levels.length; i++) {
      if (Math.abs(levels[i] - this.statistics.mean(currentGroup)) < threshold) {
        currentGroup.push(levels[i]);
      } else {
        merged.push(this.statistics.mean(currentGroup));
        currentGroup = [levels[i]];
      }
    }

    merged.push(this.statistics.mean(currentGroup));
    return merged;
  }

  private analyzeTrendForPeriod(
    prices: number[],
    period: number
  ): {
    direction: 'up' | 'down' | 'neutral';
    strength: number;
  } {
    if (prices.length < period) {
      return { direction: 'neutral', strength: 0 };
    }

    const recentPrices = prices.slice(-period);
    const linearRegression = this.statistics.linearRegression(
      Array.from({ length: period }, (_, i) => i),
      recentPrices
    );

    // 根据斜率确定方向
    const direction = linearRegression.slope > 0 ? 'up' :
                     linearRegression.slope < 0 ? 'down' : 'neutral';

    // 计算趋势强度
    const strength = Math.min(
      1,
      Math.abs(linearRegression.slope) * period / this.statistics.stdDev(recentPrices)
    );

    return { direction, strength };
  }

  private identifyHeadAndShoulders(prices: number[]): Array<{
    type: string;
    start: number;
    end: number;
    confidence: number;
  }> {
    const patterns: Array<{
      type: string;
      start: number;
      end: number;
      confidence: number;
    }> = [];

    const windowSize = 30;
    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const window = prices.slice(i - windowSize, i + windowSize);
      
      // 检测头肩顶形态
      if (this.isHeadAndShouldersTop(window)) {
        patterns.push({
          type: 'head_and_shoulders_top',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }

      // 检测头肩底形态
      if (this.isHeadAndShouldersBottom(window)) {
        patterns.push({
          type: 'head_and_shoulders_bottom',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }
    }

    return patterns;
  }

  private identifyDoubleTopBottom(prices: number[]): Array<{
    type: string;
    start: number;
    end: number;
    confidence: number;
  }> {
    const patterns: Array<{
      type: string;
      start: number;
      end: number;
      confidence: number;
    }> = [];

    const windowSize = 20;
    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const window = prices.slice(i - windowSize, i + windowSize);

      // 检测双顶形态
      if (this.isDoubleTop(window)) {
        patterns.push({
          type: 'double_top',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }

      // 检测双底形态
      if (this.isDoubleBottom(window)) {
        patterns.push({
          type: 'double_bottom',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }
    }

    return patterns;
  }

  private identifyTriangle(prices: number[]): Array<{
    type: string;
    start: number;
    end: number;
    confidence: number;
  }> {
    const patterns: Array<{
      type: string;
      start: number;
      end: number;
      confidence: number;
    }> = [];

    const windowSize = 20;
    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const window = prices.slice(i - windowSize, i + windowSize);

      // 检测上升三角形
      if (this.isAscendingTriangle(window)) {
        patterns.push({
          type: 'ascending_triangle',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }

      // 检测下降三角形
      if (this.isDescendingTriangle(window)) {
        patterns.push({
          type: 'descending_triangle',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }

      // 检测对称三角形
      if (this.isSymmetricalTriangle(window)) {
        patterns.push({
          type: 'symmetrical_triangle',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }
    }

    return patterns;
  }

  private identifyFlagsPennants(prices: number[]): Array<{
    type: string;
    start: number;
    end: number;
    confidence: number;
  }> {
    const patterns: Array<{
      type: string;
      start: number;
      end: number;
      confidence: number;
    }> = [];

    const windowSize = 15;
    for (let i = windowSize; i < prices.length - windowSize; i++) {
      const window = prices.slice(i - windowSize, i + windowSize);

      // 检测旗形
      if (this.isFlag(window)) {
        patterns.push({
          type: 'flag',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }

      // 检测三角旗
      if (this.isPennant(window)) {
        patterns.push({
          type: 'pennant',
          start: i - windowSize,
          end: i + windowSize,
          confidence: this.calculatePatternConfidence(window)
        });
      }
    }

    return patterns;
  }

  private calculateBreakoutStrength(
    price: number,
    level: number,
    volume: number,
    avgVolume: number
  ): number {
    const priceDistance = Math.abs(price - level) / level;
    const volumeStrength = volume / avgVolume;
    return Math.min(1, (priceDistance * volumeStrength) / 2);
  }

  private calculatePatternConfidence(prices: number[]): number {
    // 计算模式的可信度
    const volatility = this.statistics.stdDev(prices);
    const trend = this.analyzeTrendForPeriod(prices, prices.length);
    const volume = this.statistics.mean(prices);

    // 综合考虑多个因素
    return Math.min(1, (
      (1 - volatility / volume) * 0.4 +
      trend.strength * 0.4 +
      0.2
    ));
  }

  // 形态识别辅助方法
  private isHeadAndShouldersTop(prices: number[]): boolean {
    // TODO: 实现头肩顶形态识别逻辑
    return false;
  }

  private isHeadAndShouldersBottom(prices: number[]): boolean {
    // TODO: 实现头肩底形态识别逻辑
    return false;
  }

  private isDoubleTop(prices: number[]): boolean {
    // TODO: 实现双顶形态识别逻辑
    return false;
  }

  private isDoubleBottom(prices: number[]): boolean {
    // TODO: 实现双底形态识别逻辑
    return false;
  }

  private isAscendingTriangle(prices: number[]): boolean {
    // TODO: 实现上升三角形识别逻辑
    return false;
  }

  private isDescendingTriangle(prices: number[]): boolean {
    // TODO: 实现下降三角形识别逻辑
    return false;
  }

  private isSymmetricalTriangle(prices: number[]): boolean {
    // TODO: 实现对称三角形识别逻辑
    return false;
  }

  private isFlag(prices: number[]): boolean {
    // TODO: 实现旗形识别逻辑
    return false;
  }

  private isPennant(prices: number[]): boolean {
    // TODO: 实现三角旗识别逻辑
    return false;
  }
} 