import { Statistics } from './statistics';

export class PatternRecognizer {
  private statistics: Statistics;

  constructor() {
    this.statistics = new Statistics();
  }

  // 识别头肩顶形态
  public isHeadAndShouldersTop(prices: number[]): boolean {
    // 至少需要7个关键点
    if (prices.length < 7) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少3个峰和2个谷
    if (peaks.length < 3 || troughs.length < 2) return false;

    // 遍历所有可能的组合
    for (let i = 0; i < peaks.length - 2; i++) {
      const leftShoulder = peaks[i];
      for (let j = i + 1; j < peaks.length - 1; j++) {
        const head = peaks[j];
        for (let k = j + 1; k < peaks.length; k++) {
          const rightShoulder = peaks[k];

          // 检查是否满足头肩顶形态的条件
          if (this.validateHeadAndShouldersTop(
            prices,
            leftShoulder,
            head,
            rightShoulder,
            troughs
          )) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // 识别头肩底形态
  public isHeadAndShouldersBottom(prices: number[]): boolean {
    // 至少需要7个关键点
    if (prices.length < 7) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少3个谷和2个峰
    if (troughs.length < 3 || peaks.length < 2) return false;

    // 遍历所有可能的组合
    for (let i = 0; i < troughs.length - 2; i++) {
      const leftShoulder = troughs[i];
      for (let j = i + 1; j < troughs.length - 1; j++) {
        const head = troughs[j];
        for (let k = j + 1; k < troughs.length; k++) {
          const rightShoulder = troughs[k];

          // 检查是否满足头肩底形态的条件
          if (this.validateHeadAndShouldersBottom(
            prices,
            leftShoulder,
            head,
            rightShoulder,
            peaks
          )) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // 识别双顶形态
  public isDoubleTop(prices: number[]): boolean {
    // 至少需要5个关键点
    if (prices.length < 5) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少2个峰和1个谷
    if (peaks.length < 2 || troughs.length < 1) return false;

    // 遍历所有可能的组合
    for (let i = 0; i < peaks.length - 1; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        // 检查是否满足双顶形态的条件
        if (this.validateDoubleTop(prices, peaks[i], peaks[j], troughs)) {
          return true;
        }
      }
    }

    return false;
  }

  // 识别双底形态
  public isDoubleBottom(prices: number[]): boolean {
    // 至少需要5个关键点
    if (prices.length < 5) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少2个谷和1个峰
    if (troughs.length < 2 || peaks.length < 1) return false;

    // 遍历所有可能的组合
    for (let i = 0; i < troughs.length - 1; i++) {
      for (let j = i + 1; j < troughs.length; j++) {
        // 检查是否满足双底形态的条件
        if (this.validateDoubleBottom(prices, troughs[i], troughs[j], peaks)) {
          return true;
        }
      }
    }

    return false;
  }

  // 识别上升三角形
  public isAscendingTriangle(prices: number[]): boolean {
    // 至少需要5个关键点
    if (prices.length < 5) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少2个峰和2个谷
    if (peaks.length < 2 || troughs.length < 2) return false;

    // 计算趋势线
    const upperTrendline = this.calculateHorizontalTrendline(peaks);
    const lowerTrendline = this.calculateAscendingTrendline(troughs);

    // 验证上升三角形条件
    return this.validateAscendingTriangle(upperTrendline, lowerTrendline);
  }

  // 识别下降三角形
  public isDescendingTriangle(prices: number[]): boolean {
    // 至少需要5个关键点
    if (prices.length < 5) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少2个峰和2个谷
    if (peaks.length < 2 || troughs.length < 2) return false;

    // 计算趋势线
    const upperTrendline = this.calculateDescendingTrendline(peaks);
    const lowerTrendline = this.calculateHorizontalTrendline(troughs);

    // 验证下降三角形条件
    return this.validateDescendingTriangle(upperTrendline, lowerTrendline);
  }

  // 识别对称三角形
  public isSymmetricalTriangle(prices: number[]): boolean {
    // 至少需要5个关键点
    if (prices.length < 5) return false;

    // 找到所有局部极值点
    const peaks = this.findPeaks(prices);
    const troughs = this.findTroughs(prices);

    // 需要至少2个峰和2个谷
    if (peaks.length < 2 || troughs.length < 2) return false;

    // 计算趋势线
    const upperTrendline = this.calculateDescendingTrendline(peaks);
    const lowerTrendline = this.calculateAscendingTrendline(troughs);

    // 验证对称三角形条件
    return this.validateSymmetricalTriangle(upperTrendline, lowerTrendline);
  }

  // 识别旗形
  public isFlag(prices: number[]): boolean {
    // 至少需要10个点
    if (prices.length < 10) return false;

    // 分析前半段和后半段的趋势
    const midPoint = Math.floor(prices.length / 2);
    const firstHalf = prices.slice(0, midPoint);
    const secondHalf = prices.slice(midPoint);

    // 计算趋势
    const firstTrend = this.calculateTrend(firstHalf);
    const secondTrend = this.calculateTrend(secondHalf);

    // 验证旗形条件
    return this.validateFlag(firstTrend, secondTrend);
  }

  // 识别三角旗
  public isPennant(prices: number[]): boolean {
    // 至少需要10个点
    if (prices.length < 10) return false;

    // 分析前半段和后半段
    const midPoint = Math.floor(prices.length / 2);
    const firstHalf = prices.slice(0, midPoint);
    const secondHalf = prices.slice(midPoint);

    // 找到极值点
    const peaks = this.findPeaks(secondHalf);
    const troughs = this.findTroughs(secondHalf);

    // 计算趋势
    const firstTrend = this.calculateTrend(firstHalf);
    const convergingPattern = this.isConvergingPattern(peaks, troughs);

    // 验证三角旗条件
    return this.validatePennant(firstTrend, convergingPattern);
  }

  // 辅助方法
  private findPeaks(prices: number[]): number[] {
    const peaks: number[] = [];
    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
        peaks.push(i);
      }
    }
    return peaks;
  }

  private findTroughs(prices: number[]): number[] {
    const troughs: number[] = [];
    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
        troughs.push(i);
      }
    }
    return troughs;
  }

  private validateHeadAndShouldersTop(
    prices: number[],
    leftShoulder: number,
    head: number,
    rightShoulder: number,
    troughs: number[]
  ): boolean {
    // 验证峰值关系
    if (prices[head] <= prices[leftShoulder] || prices[head] <= prices[rightShoulder]) {
      return false;
    }

    // 验证肩部高度相似性
    const shoulderHeightDiff = Math.abs(prices[leftShoulder] - prices[rightShoulder]);
    if (shoulderHeightDiff > prices[head] * 0.1) {
      return false;
    }

    // 验证颈线水平
    const neckline = this.findNeckline(prices, troughs, leftShoulder, rightShoulder);
    return this.isNecklineHorizontal(neckline);
  }

  private validateHeadAndShouldersBottom(
    prices: number[],
    leftShoulder: number,
    head: number,
    rightShoulder: number,
    peaks: number[]
  ): boolean {
    // 验证谷值关系
    if (prices[head] >= prices[leftShoulder] || prices[head] >= prices[rightShoulder]) {
      return false;
    }

    // 验证肩部深度相似性
    const shoulderDepthDiff = Math.abs(prices[leftShoulder] - prices[rightShoulder]);
    if (shoulderDepthDiff > Math.abs(prices[head]) * 0.1) {
      return false;
    }

    // 验证颈线水平
    const neckline = this.findNeckline(prices, peaks, leftShoulder, rightShoulder);
    return this.isNecklineHorizontal(neckline);
  }

  private validateDoubleTop(
    prices: number[],
    firstPeak: number,
    secondPeak: number,
    troughs: number[]
  ): boolean {
    // 验证两个顶部高度相似性
    const peakDiff = Math.abs(prices[firstPeak] - prices[secondPeak]);
    if (peakDiff > prices[firstPeak] * 0.02) {
      return false;
    }

    // 验证两个顶部之间的距离
    const distance = secondPeak - firstPeak;
    if (distance < 10 || distance > 60) {
      return false;
    }

    // 验证中间的回调
    const middleTrough = this.findMiddleTrough(troughs, firstPeak, secondPeak);
    return middleTrough !== -1 && this.validateRetracement(prices, firstPeak, middleTrough);
  }

  private validateDoubleBottom(
    prices: number[],
    firstTrough: number,
    secondTrough: number,
    peaks: number[]
  ): boolean {
    // 验证两个底部深度相似性
    const troughDiff = Math.abs(prices[firstTrough] - prices[secondTrough]);
    if (troughDiff > Math.abs(prices[firstTrough]) * 0.02) {
      return false;
    }

    // 验证两个底部之间的距离
    const distance = secondTrough - firstTrough;
    if (distance < 10 || distance > 60) {
      return false;
    }

    // 验证中间的反弹
    const middlePeak = this.findMiddlePeak(peaks, firstTrough, secondTrough);
    return middlePeak !== -1 && this.validateRetracement(prices, firstTrough, middlePeak);
  }

  private validateAscendingTriangle(
    upperTrendline: { slope: number; intercept: number },
    lowerTrendline: { slope: number; intercept: number }
  ): boolean {
    // 验证上趋势线是否水平
    if (Math.abs(upperTrendline.slope) > 0.01) {
      return false;
    }

    // 验证下趋势线是否上升
    if (lowerTrendline.slope <= 0) {
      return false;
    }

    // 验证趋势线是否收敛
    return this.areTrendlinesConverging(upperTrendline, lowerTrendline);
  }

  private validateDescendingTriangle(
    upperTrendline: { slope: number; intercept: number },
    lowerTrendline: { slope: number; intercept: number }
  ): boolean {
    // 验证下趋势线是否水平
    if (Math.abs(lowerTrendline.slope) > 0.01) {
      return false;
    }

    // 验证上趋势线是否下降
    if (upperTrendline.slope >= 0) {
      return false;
    }

    // 验证趋势线是否收敛
    return this.areTrendlinesConverging(upperTrendline, lowerTrendline);
  }

  private validateSymmetricalTriangle(
    upperTrendline: { slope: number; intercept: number },
    lowerTrendline: { slope: number; intercept: number }
  ): boolean {
    // 验证上趋势线是否下降
    if (upperTrendline.slope >= 0) {
      return false;
    }

    // 验证下趋势线是否上升
    if (lowerTrendline.slope <= 0) {
      return false;
    }

    // 验证斜率是否近似对称
    const slopeSum = Math.abs(upperTrendline.slope) + Math.abs(lowerTrendline.slope);
    const slopeDiff = Math.abs(Math.abs(upperTrendline.slope) - Math.abs(lowerTrendline.slope));
    return slopeDiff / slopeSum < 0.2;
  }

  private validateFlag(
    firstTrend: { slope: number; strength: number },
    secondTrend: { slope: number; strength: number }
  ): boolean {
    // 验证第一段是否有强趋势
    if (firstTrend.strength < 0.7) {
      return false;
    }

    // 验证第二段是否为小幅回调
    if (Math.abs(secondTrend.slope) > Math.abs(firstTrend.slope) * 0.5) {
      return false;
    }

    // 验证两段趋势方向是否相反
    return Math.sign(firstTrend.slope) !== Math.sign(secondTrend.slope);
  }

  private validatePennant(
    firstTrend: { slope: number; strength: number },
    convergingPattern: boolean
  ): boolean {
    // 验证第一段是否有强趋势
    if (firstTrend.strength < 0.7) {
      return false;
    }

    // 验证是否存在收敛模式
    return convergingPattern;
  }

  private findNeckline(
    prices: number[],
    points: number[],
    start: number,
    end: number
  ): { slope: number; intercept: number } {
    // 找到两个肩部之间的点
    const middlePoints = points.filter(p => p > start && p < end);
    if (middlePoints.length === 0) return { slope: 0, intercept: 0 };

    // 计算颈线
    return this.calculateTrendline([start, ...middlePoints, end].map(i => ({
      x: i,
      y: prices[i]
    })));
  }

  private isNecklineHorizontal(neckline: { slope: number; intercept: number }): boolean {
    return Math.abs(neckline.slope) < 0.1;
  }

  private findMiddleTrough(troughs: number[], start: number, end: number): number {
    const middleTroughs = troughs.filter(t => t > start && t < end);
    if (middleTroughs.length === 0) return -1;
    return middleTroughs[Math.floor(middleTroughs.length / 2)];
  }

  private findMiddlePeak(peaks: number[], start: number, end: number): number {
    const middlePeaks = peaks.filter(p => p > start && p < end);
    if (middlePeaks.length === 0) return -1;
    return middlePeaks[Math.floor(middlePeaks.length / 2)];
  }

  private validateRetracement(prices: number[], extremePoint: number, middlePoint: number): boolean {
    const retracement = Math.abs(prices[middlePoint] - prices[extremePoint]) / Math.abs(prices[extremePoint]);
    return retracement >= 0.1 && retracement <= 0.6;
  }

  private calculateTrendline(points: Array<{ x: number; y: number }>): {
    slope: number;
    intercept: number;
  } {
    const x = points.map(p => p.x);
    const y = points.map(p => p.y);
    const regression = this.statistics.linearRegression(x, y);
    return {
      slope: regression.slope,
      intercept: regression.intercept
    };
  }

  private calculateHorizontalTrendline(points: number[]): {
    slope: number;
    intercept: number;
  } {
    return {
      slope: 0,
      intercept: this.statistics.mean(points)
    };
  }

  private calculateAscendingTrendline(points: number[]): {
    slope: number;
    intercept: number;
  } {
    return this.calculateTrendline(points.map((p, i) => ({ x: i, y: p })));
  }

  private calculateDescendingTrendline(points: number[]): {
    slope: number;
    intercept: number;
  } {
    return this.calculateTrendline(points.map((p, i) => ({ x: i, y: p })));
  }

  private calculateTrend(prices: number[]): {
    slope: number;
    strength: number;
  } {
    const x = Array.from({ length: prices.length }, (_, i) => i);
    const regression = this.statistics.linearRegression(x, prices);
    const strength = Math.abs(regression.rSquared);
    return {
      slope: regression.slope,
      strength
    };
  }

  private isConvergingPattern(peaks: number[], troughs: number[]): boolean {
    if (peaks.length < 2 || troughs.length < 2) return false;

    const upperTrendline = this.calculateDescendingTrendline(peaks);
    const lowerTrendline = this.calculateAscendingTrendline(troughs);

    return this.areTrendlinesConverging(upperTrendline, lowerTrendline);
  }

  private areTrendlinesConverging(
    line1: { slope: number; intercept: number },
    line2: { slope: number; intercept: number }
  ): boolean {
    // 计算趋势线的交点
    const intersectionX = (line2.intercept - line1.intercept) / (line1.slope - line2.slope);
    return intersectionX > 0 && intersectionX < 100; // 假设100个周期内收敛
  }
} 