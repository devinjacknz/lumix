import { logger } from '../monitoring';
import { Statistics } from '../analysis/statistics';

/**
 * 缩放方法枚举
 */
export enum ScalingType {
  MIN_MAX = 'min_max',       // 最大最小缩放
  STANDARD = 'standard',     // 均值方差缩放
  QUANTILE = 'quantile',     // 分位数缩放
  ADAPTIVE = 'adaptive'      // 自适应缩放
}

/**
 * 缩放器配置接口
 */
export interface ScalerConfig {
  type: ScalingType;
  featureRange?: [number, number];  // 特征范围，默认 [0, 1]
  quantileRange?: [number, number]; // 分位数范围，默认 [0.25, 0.75]
  adaptiveWindow?: number;         // 自适应窗口大小
  epsilon?: number;                // 防止除零
}

/**
 * 特征缩放器
 */
export class Scaler {
  private config: Required<ScalerConfig>;
  private statistics: Statistics;
  private params: Map<string, any> = new Map();
  private isFitted: boolean = false;

  constructor(config: ScalerConfig) {
    this.config = {
      type: config.type,
      featureRange: config.featureRange ?? [0, 1],
      quantileRange: config.quantileRange ?? [0.25, 0.75],
      adaptiveWindow: config.adaptiveWindow ?? 100,
      epsilon: config.epsilon ?? 1e-10
    };
    this.statistics = new Statistics();
  }

  /**
   * 拟合缩放器
   * @param data 输入数据，每列是一个特征
   * @param featureNames 特征名称
   */
  public fit(data: number[][], featureNames?: string[]): void {
    try {
      // 验证输入
      if (!data.length || !data[0].length) {
        throw new Error('Empty input data');
      }

      const numFeatures = data[0].length;
      const names = featureNames ?? Array.from({ length: numFeatures }, (_, i) => `feature_${i}`);

      // 转置数据以按列处理
      const columns = this.transpose(data);

      // 计算并存储缩放参数
      columns.forEach((column, i) => {
        const params = this.calculateScalingParams(column);
        this.params.set(names[i], params);
      });

      this.isFitted = true;

      logger.debug('Scaler', 'Fitted scaler', {
        type: this.config.type,
        features: numFeatures
      });
    } catch (error) {
      logger.error('Scaler', 'Failed to fit scaler', { error });
      throw error;
    }
  }

  /**
   * 转换数据
   * @param data 输入数据
   * @param featureNames 特征名称
   * @returns 缩放后的数据
   */
  public transform(data: number[][], featureNames?: string[]): number[][] {
    if (!this.isFitted) {
      throw new Error('Scaler must be fitted before transform');
    }

    try {
      const numFeatures = data[0].length;
      const names = featureNames ?? Array.from({ length: numFeatures }, (_, i) => `feature_${i}`);

      // 转置数据以按列处理
      const columns = this.transpose(data);

      // 对每列应用缩放
      const scaledColumns = columns.map((column, i) => {
        const params = this.params.get(names[i]);
        if (!params) {
          throw new Error(`No scaling parameters found for feature: ${names[i]}`);
        }
        return this.scaleFeature(column, params);
      });

      // 转置回原始形状
      return this.transpose(scaledColumns);
    } catch (error) {
      logger.error('Scaler', 'Failed to transform data', { error });
      throw error;
    }
  }

  /**
   * 拟合并转换数据
   * @param data 输入数据
   * @param featureNames 特征名称
   * @returns 缩放后的数据
   */
  public fitTransform(data: number[][], featureNames?: string[]): number[][] {
    this.fit(data, featureNames);
    return this.transform(data, featureNames);
  }

  /**
   * 计算缩放参数
   */
  private calculateScalingParams(data: number[]): any {
    switch (this.config.type) {
      case ScalingType.MIN_MAX:
        return {
          min: Math.min(...data),
          max: Math.max(...data)
        };

      case ScalingType.STANDARD:
        return {
          mean: this.statistics.mean(data),
          std: this.statistics.stdDev(data)
        };

      case ScalingType.QUANTILE:
        return {
          q1: this.statistics.percentile(data, this.config.quantileRange[0] * 100),
          q3: this.statistics.percentile(data, this.config.quantileRange[1] * 100)
        };

      case ScalingType.ADAPTIVE:
        return {
          window: data.slice(-this.config.adaptiveWindow),
          mean: this.statistics.mean(data),
          std: this.statistics.stdDev(data)
        };

      default:
        throw new Error(`Unsupported scaling type: ${this.config.type}`);
    }
  }

  /**
   * 缩放特征
   */
  private scaleFeature(data: number[], params: any): number[] {
    switch (this.config.type) {
      case ScalingType.MIN_MAX:
        return this.minMaxScale(data, params);
      case ScalingType.STANDARD:
        return this.standardScale(data, params);
      case ScalingType.QUANTILE:
        return this.quantileScale(data, params);
      case ScalingType.ADAPTIVE:
        return this.adaptiveScale(data, params);
      default:
        throw new Error(`Unsupported scaling type: ${this.config.type}`);
    }
  }

  /**
   * 最大最小缩放
   */
  private minMaxScale(data: number[], params: { min: number; max: number }): number[] {
    const range = this.config.featureRange[1] - this.config.featureRange[0];
    return data.map(x => {
      const scaled = (x - params.min) / (params.max - params.min + this.config.epsilon);
      return scaled * range + this.config.featureRange[0];
    });
  }

  /**
   * 均值方差缩放
   */
  private standardScale(data: number[], params: { mean: number; std: number }): number[] {
    return data.map(x => (x - params.mean) / (params.std + this.config.epsilon));
  }

  /**
   * 分位数缩放
   */
  private quantileScale(data: number[], params: { q1: number; q3: number }): number[] {
    const iqr = params.q3 - params.q1;
    return data.map(x => (x - params.q1) / (iqr + this.config.epsilon));
  }

  /**
   * 自适应缩放
   */
  private adaptiveScale(data: number[], params: { window: number[]; mean: number; std: number }): number[] {
    // 使用滑动窗口计算局部统计量
    const window = [...params.window];
    return data.map(x => {
      // 更新窗口
      if (window.length >= this.config.adaptiveWindow) {
        window.shift();
      }
      window.push(x);

      // 计算局部统计量
      const localMean = this.statistics.mean(window);
      const localStd = this.statistics.stdDev(window);

      // 使用局部和全局统计量的加权组合
      const weight = Math.min(window.length / this.config.adaptiveWindow, 1);
      const mean = weight * localMean + (1 - weight) * params.mean;
      const std = weight * localStd + (1 - weight) * params.std;

      return (x - mean) / (std + this.config.epsilon);
    });
  }

  /**
   * 转置矩阵
   */
  private transpose(matrix: number[][]): number[][] {
    return matrix[0].map((_, i) => matrix.map(row => row[i]));
  }

  /**
   * 获取缩放参数
   */
  public getParams(): Map<string, any> {
    return new Map(this.params);
  }
} 