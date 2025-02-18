import { logger } from '../monitoring';
import { Statistics } from '../analysis/statistics';

/**
 * 转换方法枚举
 */
export enum TransformationType {
  POLYNOMIAL = 'polynomial', // 多项式转换
  EXPONENTIAL = 'exponential', // 指数转换
  FOURIER = 'fourier',      // 傅里叶转换
  WAVELET = 'wavelet'       // 小波转换
}

/**
 * 转换器配置接口
 */
export interface TransformerConfig {
  type: TransformationType;
  degree?: number;          // 多项式次数
  alpha?: number;           // 指数系数
  components?: number;      // 傅里叶/小波分量数
  waveletType?: string;     // 小波类型
  epsilon?: number;         // 防止除零
}

/**
 * 数据转换器
 */
export class Transformer {
  private config: Required<TransformerConfig>;
  private statistics: Statistics;
  private params: Map<string, any> = new Map();
  private isFitted: boolean = false;

  constructor(config: TransformerConfig) {
    this.config = {
      type: config.type,
      degree: config.degree ?? 2,
      alpha: config.alpha ?? 1.0,
      components: config.components ?? 10,
      waveletType: config.waveletType ?? 'db4',
      epsilon: config.epsilon ?? 1e-10
    };
    this.statistics = new Statistics();
  }

  /**
   * 拟合转换器
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

      // 计算并存储转换参数
      columns.forEach((column, i) => {
        const params = this.calculateTransformParams(column);
        this.params.set(names[i], params);
      });

      this.isFitted = true;

      logger.debug('Transformer', 'Fitted transformer', {
        type: this.config.type,
        features: numFeatures
      });
    } catch (error) {
      logger.error('Transformer', 'Failed to fit transformer', { error });
      throw error;
    }
  }

  /**
   * 转换数据
   * @param data 输入数据
   * @param featureNames 特征名称
   * @returns 转换后的数据
   */
  public transform(data: number[][], featureNames?: string[]): number[][] {
    if (!this.isFitted) {
      throw new Error('Transformer must be fitted before transform');
    }

    try {
      const numFeatures = data[0].length;
      const names = featureNames ?? Array.from({ length: numFeatures }, (_, i) => `feature_${i}`);

      // 转置数据以按列处理
      const columns = this.transpose(data);

      // 对每列应用转换
      const transformedColumns = columns.map((column, i) => {
        const params = this.params.get(names[i]);
        if (!params) {
          throw new Error(`No transform parameters found for feature: ${names[i]}`);
        }
        return this.transformFeature(column, params);
      });

      // 转置回原始形状
      return this.transpose(transformedColumns);
    } catch (error) {
      logger.error('Transformer', 'Failed to transform data', { error });
      throw error;
    }
  }

  /**
   * 拟合并转换数据
   * @param data 输入数据
   * @param featureNames 特征名称
   * @returns 转换后的数据
   */
  public fitTransform(data: number[][], featureNames?: string[]): number[][] {
    this.fit(data, featureNames);
    return this.transform(data, featureNames);
  }

  /**
   * 计算转换参数
   */
  private calculateTransformParams(data: number[]): any {
    switch (this.config.type) {
      case TransformationType.POLYNOMIAL:
        return {
          mean: this.statistics.mean(data),
          std: this.statistics.stdDev(data)
        };

      case TransformationType.EXPONENTIAL:
        return {
          min: Math.min(...data),
          max: Math.max(...data)
        };

      case TransformationType.FOURIER:
        return {
          frequencies: this.calculateFourierFrequencies(data),
          amplitudes: this.calculateFourierAmplitudes(data)
        };

      case TransformationType.WAVELET:
        return {
          coefficients: this.calculateWaveletCoefficients(data)
        };

      default:
        throw new Error(`Unsupported transform type: ${this.config.type}`);
    }
  }

  /**
   * 转换特征
   */
  private transformFeature(data: number[], params: any): number[] {
    switch (this.config.type) {
      case TransformationType.POLYNOMIAL:
        return this.polynomialTransform(data, params);
      case TransformationType.EXPONENTIAL:
        return this.exponentialTransform(data, params);
      case TransformationType.FOURIER:
        return this.fourierTransform(data, params);
      case TransformationType.WAVELET:
        return this.waveletTransform(data, params);
      default:
        throw new Error(`Unsupported transform type: ${this.config.type}`);
    }
  }

  /**
   * 多项式转换
   */
  private polynomialTransform(data: number[], params: { mean: number; std: number }): number[] {
    // 标准化数据以提高数值稳定性
    const normalized = data.map(x => (x - params.mean) / (params.std + this.config.epsilon));
    
    // 生成多项式特征
    const transformed: number[][] = [];
    for (let i = 0; i < data.length; i++) {
      const row: number[] = [];
      for (let degree = 1; degree <= this.config.degree; degree++) {
        row.push(Math.pow(normalized[i], degree));
      }
      transformed.push(row);
    }

    // 返回展平的结果
    return transformed.flat();
  }

  /**
   * 指数转换
   */
  private exponentialTransform(data: number[], params: { min: number; max: number }): number[] {
    // 归一化到 [0, 1] 范围
    const normalized = data.map(x => 
      (x - params.min) / (params.max - params.min + this.config.epsilon)
    );
    
    // 应用指数转换
    return normalized.map(x => Math.exp(this.config.alpha * x) - 1);
  }

  /**
   * 傅里叶转换
   */
  private fourierTransform(
    data: number[],
    params: { frequencies: number[]; amplitudes: number[] }
  ): number[] {
    const n = data.length;
    const transformed: number[] = new Array(n).fill(0);

    // 应用傅里叶变换
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < this.config.components; j++) {
        const freq = params.frequencies[j];
        const amp = params.amplitudes[j];
        transformed[i] += amp * Math.cos(2 * Math.PI * freq * i / n);
      }
    }

    return transformed;
  }

  /**
   * 小波转换
   */
  private waveletTransform(
    data: number[],
    params: { coefficients: number[] }
  ): number[] {
    // 实现离散小波变换
    const n = data.length;
    const transformed: number[] = new Array(n).fill(0);
    const { coefficients } = params;

    // 应用小波变换
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < coefficients.length; j++) {
        const coef = coefficients[j];
        const scale = Math.pow(2, Math.floor(j / 2));
        const shift = i - scale;
        if (shift >= 0 && shift < n) {
          transformed[i] += coef * data[shift];
        }
      }
    }

    return transformed;
  }

  /**
   * 计算傅里叶频率
   */
  private calculateFourierFrequencies(data: number[]): number[] {
    const n = data.length;
    const frequencies: number[] = [];

    // 使用FFT计算主要频率
    for (let i = 0; i < this.config.components; i++) {
      frequencies.push(i / n);
    }

    return frequencies;
  }

  /**
   * 计算傅里叶振幅
   */
  private calculateFourierAmplitudes(data: number[]): number[] {
    const n = data.length;
    const amplitudes: number[] = [];

    // 计算FFT
    const fft = this.computeFFT(data);

    // 提取主要分量
    for (let i = 0; i < this.config.components; i++) {
      amplitudes.push(Math.sqrt(
        Math.pow(fft[i].real, 2) + Math.pow(fft[i].imag, 2)
      ) / n);
    }

    return amplitudes;
  }

  /**
   * 计算小波系数
   */
  private calculateWaveletCoefficients(data: number[]): number[] {
    // 根据小波类型选择系数
    switch (this.config.waveletType) {
      case 'db4':
        return [
          0.482962913145, 0.836516303738,
          0.224143868042, -0.129409522551
        ];
      case 'haar':
        return [0.7071067811865475, 0.7071067811865475];
      default:
        throw new Error(`Unsupported wavelet type: ${this.config.waveletType}`);
    }
  }

  /**
   * 计算FFT（快速傅里叶变换）
   */
  private computeFFT(data: number[]): Array<{ real: number; imag: number }> {
    const n = data.length;
    
    // 如果长度为1，直接返回
    if (n === 1) {
      return [{ real: data[0], imag: 0 }];
    }

    // 分解为偶数和奇数部分
    const even = data.filter((_, i) => i % 2 === 0);
    const odd = data.filter((_, i) => i % 2 === 1);

    // 递归计算
    const evenFFT = this.computeFFT(even);
    const oddFFT = this.computeFFT(odd);

    // 合并结果
    const result: Array<{ real: number; imag: number }> = new Array(n);
    for (let k = 0; k < n / 2; k++) {
      const angle = -2 * Math.PI * k / n;
      const t = {
        real: Math.cos(angle),
        imag: Math.sin(angle)
      };
      
      // 计算k处的值
      const p = evenFFT[k];
      const q = {
        real: t.real * oddFFT[k].real - t.imag * oddFFT[k].imag,
        imag: t.real * oddFFT[k].imag + t.imag * oddFFT[k].real
      };
      
      result[k] = {
        real: p.real + q.real,
        imag: p.imag + q.imag
      };
      
      result[k + n/2] = {
        real: p.real - q.real,
        imag: p.imag - q.imag
      };
    }

    return result;
  }

  /**
   * 转置矩阵
   */
  private transpose(matrix: number[][]): number[][] {
    return matrix[0].map((_, i) => matrix.map(row => row[i]));
  }

  /**
   * 获取转换参数
   */
  public getParams(): Map<string, any> {
    return new Map(this.params);
  }
} 