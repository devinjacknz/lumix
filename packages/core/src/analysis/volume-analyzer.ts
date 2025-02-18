import { Statistics } from './statistics';
import { Indicators } from './indicators';

export class VolumeAnalyzer {
  private statistics: Statistics;
  private indicators: Indicators;

  constructor() {
    this.statistics = new Statistics();
    this.indicators = new Indicators();
  }

  // 分析成交量分布
  public analyzeVolumeProfile(
    prices: number[],
    volumes: number[]
  ): Array<{
    price: number;
    volume: number;
    percentage: number;
  }> {
    if (prices.length !== volumes.length) {
      throw new Error('Price and volume arrays must have the same length');
    }

    // 创建价格区间
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;
    const bucketSize = range / 50; // 将价格范围分成50个区间
    const buckets: { [key: number]: number } = {};

    // 统计每个价格区间的成交量
    for (let i = 0; i < prices.length; i++) {
      const bucketIndex = Math.floor((prices[i] - min) / bucketSize);
      const price = min + bucketIndex * bucketSize;
      buckets[price] = (buckets[price] || 0) + volumes[i];
    }

    // 计算总成交量
    const totalVolume = Object.values(buckets).reduce((sum, vol) => sum + vol, 0);

    // 格式化结果
    return Object.entries(buckets).map(([price, volume]) => ({
      price: parseFloat(price),
      volume,
      percentage: (volume / totalVolume) * 100
    })).sort((a, b) => a.price - b.price);
  }

  // 分析成交量趋势
  public analyzeVolumeTrends(
    volumes: number[],
    periods: number[] = [5, 10, 20]
  ): Array<{
    period: number;
    trend: 'increasing' | 'decreasing' | 'neutral';
    strength: number;
    averageVolume: number;
  }> {
    return periods.map(period => {
      const recentVolumes = volumes.slice(-period);
      const trend = this.calculateVolumeTrend(recentVolumes);
      const averageVolume = this.statistics.mean(recentVolumes);

      return {
        period,
        ...trend,
        averageVolume
      };
    });
  }

  // 检测异常成交量
  public detectVolumeAnomalies(
    volumes: number[],
    timestamps: Date[],
    windowSize: number = 20,
    threshold: number = 2
  ): Array<{
    timestamp: Date;
    volume: number;
    deviation: number;
    zscore: number;
  }> {
    const anomalies: Array<{
      timestamp: Date;
      volume: number;
      deviation: number;
      zscore: number;
    }> = [];

    for (let i = windowSize; i < volumes.length; i++) {
      const window = volumes.slice(i - windowSize, i);
      const mean = this.statistics.mean(window);
      const std = this.statistics.stdDev(window);
      const currentVolume = volumes[i];
      const zscore = (currentVolume - mean) / std;

      if (Math.abs(zscore) > threshold) {
        anomalies.push({
          timestamp: timestamps[i],
          volume: currentVolume,
          deviation: currentVolume - mean,
          zscore
        });
      }
    }

    return anomalies;
  }

  // 计算成交量加权平均价格 (VWAP)
  public calculateVWAP(
    prices: number[],
    volumes: number[],
    period: number = 0
  ): number[] {
    if (prices.length !== volumes.length) {
      throw new Error('Price and volume arrays must have the same length');
    }

    const vwap: number[] = [];
    const start = period > 0 ? Math.max(0, prices.length - period) : 0;

    let cumulativeTPV = 0; // 累计典型价格 * 成交量
    let cumulativeVolume = 0; // 累计成交量

    for (let i = start; i < prices.length; i++) {
      const typicalPrice = prices[i];
      cumulativeTPV += typicalPrice * volumes[i];
      cumulativeVolume += volumes[i];
      vwap.push(cumulativeTPV / cumulativeVolume);
    }

    return vwap;
  }

  // 计算成交量动量
  public calculateVolumeMomentum(
    volumes: number[],
    period: number = 14
  ): Array<{
    momentum: number;
    roc: number;
    force: number;
  }> {
    const result: Array<{
      momentum: number;
      roc: number;
      force: number;
    }> = [];

    for (let i = period; i < volumes.length; i++) {
      const currentVolume = volumes[i];
      const previousVolume = volumes[i - period];
      
      // 计算动量
      const momentum = currentVolume - previousVolume;
      
      // 计算变化率
      const roc = ((currentVolume - previousVolume) / previousVolume) * 100;
      
      // 计算力度
      const force = momentum * (currentVolume / previousVolume);

      result.push({ momentum, roc, force });
    }

    return result;
  }

  // 分析买卖压力
  public analyzeVolumePressure(
    prices: number[],
    volumes: number[],
    period: number = 20
  ): Array<{
    buyPressure: number;
    sellPressure: number;
    ratio: number;
  }> {
    const result: Array<{
      buyPressure: number;
      sellPressure: number;
      ratio: number;
    }> = [];

    for (let i = 1; i < prices.length; i++) {
      const priceChange = prices[i] - prices[i - 1];
      const volume = volumes[i];

      // 根据价格变动分配成交量
      const buyVolume = priceChange >= 0 ? volume : 0;
      const sellVolume = priceChange < 0 ? volume : 0;

      // 计算一定时期内的累计买卖压力
      if (i >= period) {
        const periodBuyVolume = volumes
          .slice(i - period + 1, i + 1)
          .reduce((sum, vol, idx) => {
            const change = prices[i - period + 1 + idx] - prices[i - period + idx];
            return sum + (change >= 0 ? vol : 0);
          }, 0);

        const periodSellVolume = volumes
          .slice(i - period + 1, i + 1)
          .reduce((sum, vol, idx) => {
            const change = prices[i - period + 1 + idx] - prices[i - period + idx];
            return sum + (change < 0 ? vol : 0);
          }, 0);

        result.push({
          buyPressure: periodBuyVolume / period,
          sellPressure: periodSellVolume / period,
          ratio: periodBuyVolume / (periodSellVolume || 1)
        });
      }
    }

    return result;
  }

  // 分析成交量支撑和阻力
  public analyzeVolumeSupportsAndResistances(
    prices: number[],
    volumes: number[],
    threshold: number = 0.1
  ): {
    supports: Array<{ price: number; strength: number }>;
    resistances: Array<{ price: number; strength: number }>;
  } {
    // 计算成交量分布
    const profile = this.analyzeVolumeProfile(prices, volumes);
    const maxVolume = Math.max(...profile.map(p => p.volume));
    const volumeThreshold = maxVolume * threshold;

    // 识别支撑位和阻力位
    const supports: Array<{ price: number; strength: number }> = [];
    const resistances: Array<{ price: number; strength: number }> = [];

    for (let i = 1; i < profile.length - 1; i++) {
      const current = profile[i];
      const prev = profile[i - 1];
      const next = profile[i + 1];

      // 如果当前成交量高于阈值
      if (current.volume > volumeThreshold) {
        // 计算强度
        const strength = current.volume / maxVolume;

        // 判断是支撑还是阻力
        if (current.price < this.statistics.mean(prices)) {
          supports.push({ price: current.price, strength });
        } else {
          resistances.push({ price: current.price, strength });
        }
      }
    }

    return {
      supports: this.mergeCloseLevels(supports),
      resistances: this.mergeCloseLevels(resistances)
    };
  }

  // 分析成交量集中度
  public analyzeVolumeConcentration(
    volumes: number[],
    period: number = 20
  ): Array<{
    concentration: number;
    dominance: number;
    dispersion: number;
  }> {
    const result: Array<{
      concentration: number;
      dominance: number;
      dispersion: number;
    }> = [];

    for (let i = period; i < volumes.length; i++) {
      const window = volumes.slice(i - period, i);
      const totalVolume = window.reduce((sum, vol) => sum + vol, 0);
      const maxVolume = Math.max(...window);

      // 计算集中度（基尼系数）
      const concentration = this.calculateGiniCoefficient(window);

      // 计算主导度（最大成交量占比）
      const dominance = maxVolume / totalVolume;

      // 计算离散度（变异系数）
      const dispersion = this.statistics.stdDev(window) / this.statistics.mean(window);

      result.push({ concentration, dominance, dispersion });
    }

    return result;
  }

  // 私有辅助方法
  private calculateVolumeTrend(
    volumes: number[]
  ): {
    trend: 'increasing' | 'decreasing' | 'neutral';
    strength: number;
  } {
    const x = Array.from({ length: volumes.length }, (_, i) => i);
    const regression = this.statistics.linearRegression(x, volumes);

    // 根据斜率确定趋势
    const trend = regression.slope > 0 ? 'increasing' :
                 regression.slope < 0 ? 'decreasing' : 'neutral';

    // 计算趋势强度
    const strength = Math.min(1, Math.abs(regression.rSquared));

    return { trend, strength };
  }

  private mergeCloseLevels(
    levels: Array<{ price: number; strength: number }>
  ): Array<{ price: number; strength: number }> {
    if (levels.length === 0) return [];

    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const merged: Array<{ price: number; strength: number }> = [];
    let currentGroup: Array<{ price: number; strength: number }> = [sorted[0]];

    // 计算价格标准差作为合并阈值
    const prices = sorted.map(level => level.price);
    const threshold = this.statistics.stdDev(prices) * 0.1;

    for (let i = 1; i < sorted.length; i++) {
      const avgPrice = this.statistics.mean(currentGroup.map(l => l.price));
      if (Math.abs(sorted[i].price - avgPrice) < threshold) {
        currentGroup.push(sorted[i]);
      } else {
        // 合并当前组并计算平均价格和强度
        merged.push({
          price: this.statistics.mean(currentGroup.map(l => l.price)),
          strength: this.statistics.mean(currentGroup.map(l => l.strength))
        });
        currentGroup = [sorted[i]];
      }
    }

    // 处理最后一组
    merged.push({
      price: this.statistics.mean(currentGroup.map(l => l.price)),
      strength: this.statistics.mean(currentGroup.map(l => l.strength))
    });

    return merged;
  }

  private calculateGiniCoefficient(volumes: number[]): number {
    const sorted = [...volumes].sort((a, b) => a - b);
    const n = sorted.length;
    let numerator = 0;

    for (let i = 0; i < n; i++) {
      numerator += sorted[i] * (2 * i - n + 1);
    }

    const mean = this.statistics.mean(volumes);
    return numerator / (Math.pow(n, 2) * mean);
  }
} 