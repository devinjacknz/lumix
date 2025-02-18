import { StatisticsUtils } from './types';

export class Statistics implements StatisticsUtils {
  // 计算平均值
  public mean(data: number[]): number {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, val) => acc + val, 0);
    return sum / data.length;
  }

  // 计算中位数
  public median(data: number[]): number {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  // 计算标准差
  public stdDev(data: number[]): number {
    return Math.sqrt(this.variance(data));
  }

  // 计算方差
  public variance(data: number[]): number {
    if (data.length < 2) return 0;
    const avg = this.mean(data);
    const squareDiffs = data.map(value => {
      const diff = value - avg;
      return diff * diff;
    });
    return this.mean(squareDiffs);
  }

  // 计算偏度
  public skewness(data: number[]): number {
    if (data.length < 3) return 0;
    const avg = this.mean(data);
    const std = this.stdDev(data);
    if (std === 0) return 0;

    const cubedDiffs = data.map(value => {
      const diff = (value - avg) / std;
      return diff * diff * diff;
    });
    return this.mean(cubedDiffs);
  }

  // 计算峰度
  public kurtosis(data: number[]): number {
    if (data.length < 4) return 0;
    const avg = this.mean(data);
    const std = this.stdDev(data);
    if (std === 0) return 0;

    const fourthPowerDiffs = data.map(value => {
      const diff = (value - avg) / std;
      return diff * diff * diff * diff;
    });
    return this.mean(fourthPowerDiffs) - 3; // 减去3得到超额峰度
  }

  // 计算百分位数
  public percentile(data: number[], p: number): number {
    if (data.length === 0) return 0;
    if (p <= 0) return Math.min(...data);
    if (p >= 100) return Math.max(...data);

    const sorted = [...data].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper === lower) return sorted[index];
    return (1 - weight) * sorted[lower] + weight * sorted[upper];
  }

  // 计算相关系数
  public correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const xMean = this.mean(x);
    const yMean = this.mean(y);
    const xStd = this.stdDev(x);
    const yStd = this.stdDev(y);

    if (xStd === 0 || yStd === 0) return 0;

    const n = x.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += ((x[i] - xMean) / xStd) * ((y[i] - yMean) / yStd);
    }
    return sum / (n - 1);
  }

  // 线性回归
  public linearRegression(x: number[], y: number[]): {
    slope: number;
    intercept: number;
    rSquared: number;
  } {
    if (x.length !== y.length || x.length < 2) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    const n = x.length;
    const xMean = this.mean(x);
    const yMean = this.mean(y);

    let xxSum = 0;
    let xySum = 0;
    let yySum = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - xMean;
      const yDiff = y[i] - yMean;
      xxSum += xDiff * xDiff;
      xySum += xDiff * yDiff;
      yySum += yDiff * yDiff;
    }

    const slope = xySum / xxSum;
    const intercept = yMean - slope * xMean;
    const rSquared = (xySum * xySum) / (xxSum * yySum);

    return { slope, intercept, rSquared };
  }

  // 移动平均
  public movingAverage(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const window = data.slice(i - period + 1, i + 1);
      result.push(this.mean(window));
    }
    return result;
  }

  // 指数移动平均
  public exponentialMovingAverage(data: number[], period: number): number[] {
    const result: number[] = [];
    const alpha = 2 / (period + 1);
    let ema = data[0];
    result.push(ema);

    for (let i = 1; i < data.length; i++) {
      ema = alpha * data[i] + (1 - alpha) * ema;
      result.push(ema);
    }
    return result;
  }

  // Z-Score标准化
  public standardize(data: number[]): number[] {
    const mean = this.mean(data);
    const std = this.stdDev(data);
    if (std === 0) return data.map(() => 0);
    return data.map(x => (x - mean) / std);
  }

  // Min-Max归一化
  public normalize(data: number[]): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    if (max === min) return data.map(() => 0.5);
    return data.map(x => (x - min) / (max - min));
  }

  // 计算对数收益率
  public logReturns(data: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < data.length; i++) {
      returns.push(Math.log(data[i] / data[i - 1]));
    }
    return returns;
  }

  // 计算波动率
  public volatility(data: number[], period: number): number {
    const returns = this.logReturns(data);
    return this.stdDev(returns) * Math.sqrt(period);
  }

  // 计算夏普比率
  public sharpeRatio(returns: number[], riskFreeRate: number): number {
    const meanReturn = this.mean(returns);
    const std = this.stdDev(returns);
    if (std === 0) return 0;
    return (meanReturn - riskFreeRate) / std;
  }

  // 计算最大回撤
  public maxDrawdown(data: number[]): {
    maxDrawdown: number;
    peakIndex: number;
    troughIndex: number;
  } {
    let maxDrawdown = 0;
    let peak = data[0];
    let peakIndex = 0;
    let troughIndex = 0;
    let currentPeakIndex = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i] > peak) {
        peak = data[i];
        currentPeakIndex = i;
      } else {
        const drawdown = (peak - data[i]) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          peakIndex = currentPeakIndex;
          troughIndex = i;
        }
      }
    }

    return { maxDrawdown, peakIndex, troughIndex };
  }

  // 计算Beta系数
  public beta(returns: number[], marketReturns: number[]): number {
    const covariance = this.covariance(returns, marketReturns);
    const marketVariance = this.variance(marketReturns);
    if (marketVariance === 0) return 0;
    return covariance / marketVariance;
  }

  // 计算协方差
  private covariance(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;
    const xMean = this.mean(x);
    const yMean = this.mean(y);
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      sum += (x[i] - xMean) * (y[i] - yMean);
    }
    return sum / (x.length - 1);
  }
} 