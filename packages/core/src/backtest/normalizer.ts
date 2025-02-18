import { logger } from '../monitoring';

/**
 * 归一化方法枚举
 */
export enum NormalizationType {
  L1 = 'l1',
  L2 = 'l2',
  MAX = 'max',
  VECTOR = 'vector'
}

/**
 * 归一化配置接口
 */
export interface NormalizerConfig {
  type: NormalizationType;
  axis?: number;  // 0: 按列归一化, 1: 按行归一化
  epsilon?: number;  // 防止除零
}

/**
 * 数据归一化器
 */
export class Normalizer {
  private config: Required<NormalizerConfig>;

  constructor(config: NormalizerConfig) {
    this.config = {
      type: config.type,
      axis: config.axis ?? 0,
      epsilon: config.epsilon ?? 1e-10
    };
  }

  /**
   * 归一化数据
   * @param data 输入数据，可以是一维或二维数组
   * @returns 归一化后的数据
   */
  public normalize(data: number[] | number[][]): number[] | number[][] {
    try {
      // 确保数据是二维数组
      const matrix = Array.isArray(data[0]) ? data as number[][] : [data as number[]];
      
      // 根据axis选择归一化方向
      const normalizedData = this.config.axis === 0 
        ? this.normalizeColumns(matrix)
        : this.normalizeRows(matrix);

      // 如果输入是一维数组，返回第一行
      return Array.isArray(data[0]) ? normalizedData : normalizedData[0];
    } catch (error) {
      logger.error('Normalizer', 'Normalization failed', { error });
      throw error;
    }
  }

  /**
   * 按列归一化
   */
  private normalizeColumns(matrix: number[][]): number[][] {
    const numRows = matrix.length;
    const numCols = matrix[0].length;
    const result = Array(numRows).fill(0).map(() => Array(numCols).fill(0));

    for (let j = 0; j < numCols; j++) {
      // 获取当前列
      const column = matrix.map(row => row[j]);
      
      // 计算归一化因子
      const factor = this.calculateNormalizationFactor(column);

      // 应用归一化
      for (let i = 0; i < numRows; i++) {
        result[i][j] = matrix[i][j] / (factor + this.config.epsilon);
      }
    }

    return result;
  }

  /**
   * 按行归一化
   */
  private normalizeRows(matrix: number[][]): number[][] {
    return matrix.map(row => {
      const factor = this.calculateNormalizationFactor(row);
      return row.map(value => value / (factor + this.config.epsilon));
    });
  }

  /**
   * 计算归一化因子
   */
  private calculateNormalizationFactor(data: number[]): number {
    switch (this.config.type) {
      case NormalizationType.L1:
        return this.calculateL1Norm(data);
      case NormalizationType.L2:
        return this.calculateL2Norm(data);
      case NormalizationType.MAX:
        return this.calculateMaxNorm(data);
      case NormalizationType.VECTOR:
        return this.calculateVectorNorm(data);
      default:
        throw new Error(`Unsupported normalization type: ${this.config.type}`);
    }
  }

  /**
   * 计算L1范数（曼哈顿范数）
   */
  private calculateL1Norm(data: number[]): number {
    return data.reduce((sum, value) => sum + Math.abs(value), 0);
  }

  /**
   * 计算L2范数（欧几里得范数）
   */
  private calculateL2Norm(data: number[]): number {
    return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0));
  }

  /**
   * 计算最大范数
   */
  private calculateMaxNorm(data: number[]): number {
    return Math.max(...data.map(Math.abs));
  }

  /**
   * 计算向量范数
   */
  private calculateVectorNorm(data: number[]): number {
    const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
    const variance = data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
} 