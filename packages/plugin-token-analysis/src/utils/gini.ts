import { logger } from "@lumix/core";

export interface GiniOptions {
  useWeights?: boolean;
  normalize?: boolean;
  precision?: number;
  minSamples?: number;
  maxSamples?: number;
  sampleMethod?: "random" | "stratified" | "systematic";
}

export class GiniCalculator {
  private static instance: GiniCalculator;
  private cache: Map<string, {
    coefficient: number;
    timestamp: number;
    samples: number;
  }>;

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): GiniCalculator {
    if (!GiniCalculator.instance) {
      GiniCalculator.instance = new GiniCalculator();
    }
    return GiniCalculator.instance;
  }

  /**
   * 计算 Gini 系数
   * @param values 数值数组
   * @param weights 权重数组（可选）
   * @param options 计算选项
   * @returns Gini 系数（0-1之间）
   */
  public calculate(
    values: (number | string | bigint)[],
    weights?: number[],
    options: GiniOptions = {}
  ): number {
    try {
      // 参数验证
      if (!values || values.length === 0) {
        throw new Error("Values array cannot be empty");
      }

      if (weights && weights.length !== values.length) {
        throw new Error("Weights array length must match values array length");
      }

      // 配置选项
      const config = {
        useWeights: options.useWeights ?? true,
        normalize: options.normalize ?? true,
        precision: options.precision ?? 6,
        minSamples: options.minSamples ?? 100,
        maxSamples: options.maxSamples ?? 10000,
        sampleMethod: options.sampleMethod ?? "stratified"
      };

      // 转换值为数字数组
      const numericValues = values.map(v => {
        if (typeof v === "string" || typeof v === "bigint") {
          return Number(v);
        }
        return v;
      });

      // 数据预处理
      const { processedValues, processedWeights } = this.preprocessData(
        numericValues,
        weights,
        config
      );

      // 计算 Gini 系数
      const gini = this.computeGiniCoefficient(
        processedValues,
        processedWeights,
        config
      );

      // 规范化结果
      const normalizedGini = config.normalize ? 
        this.normalizeGini(gini, processedValues.length) : 
        gini;

      // 四舍五入到指定精度
      return Number(normalizedGini.toFixed(config.precision));
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Gini Calculator", `Calculation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 计算带有缓存的 Gini 系数
   * @param key 缓存键
   * @param values 数值数组
   * @param weights 权重数组（可选）
   * @param options 计算选项
   * @param ttl 缓存时间（毫秒）
   * @returns Gini 系数
   */
  public calculateWithCache(
    key: string,
    values: (number | string | bigint)[],
    weights?: number[],
    options: GiniOptions = {},
    ttl: number = 3600000 // 1小时
  ): number {
    // 检查缓存
    const cached = this.cache.get(key);
    if (
      cached && 
      Date.now() - cached.timestamp < ttl &&
      cached.samples === values.length
    ) {
      return cached.coefficient;
    }

    // 计算新值
    const coefficient = this.calculate(values, weights, options);

    // 更新缓存
    this.cache.set(key, {
      coefficient,
      timestamp: Date.now(),
      samples: values.length
    });

    return coefficient;
  }

  private preprocessData(
    values: number[],
    weights?: number[],
    config: Required<GiniOptions>
  ): {
    processedValues: number[];
    processedWeights: number[];
  } {
    // 移除无效值
    const validIndices = values.map((v, i) => ({
      value: v,
      weight: weights?.[i] ?? 1,
      index: i
    })).filter(item => 
      !isNaN(item.value) && 
      isFinite(item.value) && 
      item.value >= 0 &&
      (!config.useWeights || (item.weight > 0 && isFinite(item.weight)))
    );

    if (validIndices.length === 0) {
      throw new Error("No valid values after preprocessing");
    }

    // 采样处理
    const sampledIndices = this.sampleData(
      validIndices,
      config.minSamples,
      config.maxSamples,
      config.sampleMethod
    );

    // 提取处理后的值和权重
    return {
      processedValues: sampledIndices.map(item => item.value),
      processedWeights: sampledIndices.map(item => item.weight)
    };
  }

  private sampleData(
    data: { value: number; weight: number; index: number }[],
    minSamples: number,
    maxSamples: number,
    method: "random" | "stratified" | "systematic"
  ): { value: number; weight: number; index: number }[] {
    // 如果数据量在范围内，直接返回
    if (data.length >= minSamples && data.length <= maxSamples) {
      return data;
    }

    // 确定采样大小
    const sampleSize = Math.min(maxSamples, Math.max(minSamples, data.length));

    switch (method) {
      case "random":
        return this.randomSample(data, sampleSize);
      case "stratified":
        return this.stratifiedSample(data, sampleSize);
      case "systematic":
        return this.systematicSample(data, sampleSize);
      default:
        return this.stratifiedSample(data, sampleSize);
    }
  }

  private randomSample(
    data: { value: number; weight: number; index: number }[],
    sampleSize: number
  ): { value: number; weight: number; index: number }[] {
    const shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
  }

  private stratifiedSample(
    data: { value: number; weight: number; index: number }[],
    sampleSize: number
  ): { value: number; weight: number; index: number }[] {
    // 按值大小排序
    const sorted = [...data].sort((a, b) => a.value - b.value);

    // 分层
    const numStrata = Math.min(10, Math.floor(sampleSize / 10));
    const strataSize = Math.ceil(sorted.length / numStrata);
    const strata: typeof data[] = [];

    for (let i = 0; i < numStrata; i++) {
      const start = i * strataSize;
      const end = Math.min(start + strataSize, sorted.length);
      strata.push(sorted.slice(start, end));
    }

    // 从每层采样
    const samplesPerStratum = Math.ceil(sampleSize / numStrata);
    const result: typeof data = [];

    strata.forEach(stratum => {
      result.push(...this.randomSample(stratum, samplesPerStratum));
    });

    return result.slice(0, sampleSize);
  }

  private systematicSample(
    data: { value: number; weight: number; index: number }[],
    sampleSize: number
  ): { value: number; weight: number; index: number }[] {
    const interval = data.length / sampleSize;
    const result: typeof data = [];

    for (let i = 0; i < sampleSize; i++) {
      const index = Math.min(Math.floor(i * interval), data.length - 1);
      result.push(data[index]);
    }

    return result;
  }

  private computeGiniCoefficient(
    values: number[],
    weights: number[],
    config: Required<GiniOptions>
  ): number {
    const n = values.length;
    if (n < 2) return 0;

    // 计算加权和
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedValues = values.map((v, i) => ({
      value: v,
      weight: weights[i] / totalWeight
    }));

    // 排序
    weightedValues.sort((a, b) => a.value - b.value);

    // 计算洛伦兹曲线下的面积
    let sumNumerator = 0;
    let sumDenominator = 0;
    let cumulativeWeight = 0;

    for (let i = 0; i < n; i++) {
      const { value, weight } = weightedValues[i];
      cumulativeWeight += weight;
      
      sumNumerator += value * weight * cumulativeWeight;
      sumDenominator += value * weight;
    }

    // 计算 Gini 系数
    if (sumDenominator === 0) return 0;
    return (2 * sumNumerator) / sumDenominator - 1;
  }

  private normalizeGini(gini: number, n: number): number {
    // 对于小样本量进行修正
    if (n <= 1) return 0;
    return gini * (n / (n - 1));
  }

  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * 计算 Gini 系数的置信区间
   * @param values 数值数组
   * @param weights 权重数组（可选）
   * @param options 计算选项
   * @param confidence 置信水平（0-1之间）
   * @returns 置信区间 [下限, 上限]
   */
  public calculateConfidenceInterval(
    values: (number | string | bigint)[],
    weights?: number[],
    options: GiniOptions = {},
    confidence: number = 0.95
  ): [number, number] {
    try {
      const gini = this.calculate(values, weights, options);
      const n = values.length;

      // 使用 jackknife 重采样估计标准误差
      const jackknifeSamples: number[] = [];
      
      for (let i = 0; i < n; i++) {
        const sampledValues = [...values];
        const sampledWeights = weights ? [...weights] : undefined;
        
        sampledValues.splice(i, 1);
        if (sampledWeights) sampledWeights.splice(i, 1);

        jackknifeSamples.push(
          this.calculate(sampledValues, sampledWeights, options)
        );
      }

      // 计算标准误差
      const mean = jackknifeSamples.reduce((sum, x) => sum + x, 0) / n;
      const variance = jackknifeSamples.reduce(
        (sum, x) => sum + Math.pow(x - mean, 2),
        0
      ) / (n - 1);
      const standardError = Math.sqrt(variance);

      // 计算置信区间
      const zScore = this.getZScore(confidence);
      const margin = zScore * standardError;

      return [
        Math.max(0, gini - margin),
        Math.min(1, gini + margin)
      ];
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Gini Calculator",
          `Failed to calculate confidence interval: ${error.message}`
        );
      }
      throw error;
    }
  }

  private getZScore(confidence: number): number {
    // 常用置信水平的 z 值
    const zScores: Record<number, number> = {
      0.99: 2.576,
      0.95: 1.96,
      0.90: 1.645,
      0.85: 1.44,
      0.80: 1.28
    };

    // 找到最接近的置信水平
    const levels = Object.keys(zScores).map(Number);
    const closest = levels.reduce((prev, curr) => 
      Math.abs(curr - confidence) < Math.abs(prev - confidence) ? curr : prev
    );

    return zScores[closest];
  }
} 