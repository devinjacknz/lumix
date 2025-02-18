import { logger } from '../monitoring';

/**
 * 编码方法枚举
 */
export enum EncodingType {
  ONE_HOT = 'one_hot',
  LABEL = 'label',
  BINARY = 'binary',
  FREQUENCY = 'frequency'
}

/**
 * 编码器配置接口
 */
export interface EncoderConfig {
  type: EncodingType;
  unknownValue?: string | number;  // 处理未知类别的值
  dropFirst?: boolean;  // 是否删除第一个编码列（避免共线性）
}

/**
 * 类别编码器
 */
export class Encoder {
  private config: Required<EncoderConfig>;
  private categories: Map<string, number> = new Map();
  private frequencies: Map<string, number> = new Map();
  private isFitted: boolean = false;

  constructor(config: EncoderConfig) {
    this.config = {
      type: config.type,
      unknownValue: config.unknownValue ?? 'unknown',
      dropFirst: config.dropFirst ?? false
    };
  }

  /**
   * 拟合编码器
   * @param data 输入数据
   */
  public fit(data: string[]): void {
    try {
      // 重置状态
      this.categories.clear();
      this.frequencies.clear();
      
      // 计算频率
      for (const value of data) {
        this.frequencies.set(value, (this.frequencies.get(value) || 0) + 1);
      }

      // 获取唯一类别
      const uniqueCategories = Array.from(new Set(data)).sort();
      
      // 构建类别映射
      uniqueCategories.forEach((category, index) => {
        this.categories.set(category, index);
      });

      this.isFitted = true;
      
      logger.debug('Encoder', 'Fitted encoder', {
        type: this.config.type,
        categories: this.categories.size
      });
    } catch (error) {
      logger.error('Encoder', 'Failed to fit encoder', { error });
      throw error;
    }
  }

  /**
   * 转换数据
   * @param data 输入数据
   * @returns 编码后的数据
   */
  public transform(data: string[]): number[][] {
    if (!this.isFitted) {
      throw new Error('Encoder must be fitted before transform');
    }

    try {
      switch (this.config.type) {
        case EncodingType.ONE_HOT:
          return this.oneHotEncode(data);
        case EncodingType.LABEL:
          return this.labelEncode(data);
        case EncodingType.BINARY:
          return this.binaryEncode(data);
        case EncodingType.FREQUENCY:
          return this.frequencyEncode(data);
        default:
          throw new Error(`Unsupported encoding type: ${this.config.type}`);
      }
    } catch (error) {
      logger.error('Encoder', 'Failed to transform data', { error });
      throw error;
    }
  }

  /**
   * 拟合并转换数据
   * @param data 输入数据
   * @returns 编码后的数据
   */
  public fitTransform(data: string[]): number[][] {
    this.fit(data);
    return this.transform(data);
  }

  /**
   * 独热编码
   */
  private oneHotEncode(data: string[]): number[][] {
    const numCategories = this.categories.size;
    const startIndex = this.config.dropFirst ? 1 : 0;
    const encodedData: number[][] = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      const encoded = new Array(numCategories - startIndex).fill(0);
      const categoryIndex = this.categories.get(data[i]);
      
      if (categoryIndex !== undefined && categoryIndex >= startIndex) {
        encoded[categoryIndex - startIndex] = 1;
      }
      
      encodedData[i] = encoded;
    }

    return encodedData;
  }

  /**
   * 标签编码
   */
  private labelEncode(data: string[]): number[][] {
    return data.map(value => {
      const encoded = this.categories.get(value);
      return [encoded !== undefined ? encoded : -1];
    });
  }

  /**
   * 二进制编码
   */
  private binaryEncode(data: string[]): number[][] {
    const numCategories = this.categories.size;
    const numBits = Math.ceil(Math.log2(numCategories));
    
    return data.map(value => {
      const categoryIndex = this.categories.get(value);
      if (categoryIndex === undefined) {
        return new Array(numBits).fill(0);
      }
      
      // 转换为二进制数组
      const binary = categoryIndex.toString(2).padStart(numBits, '0');
      return Array.from(binary).map(Number);
    });
  }

  /**
   * 频率编码
   */
  private frequencyEncode(data: string[]): number[][] {
    const totalCount = Array.from(this.frequencies.values()).reduce((a, b) => a + b, 0);
    
    return data.map(value => {
      const frequency = this.frequencies.get(value) || 0;
      return [frequency / totalCount];
    });
  }

  /**
   * 获取类别映射
   */
  public getCategories(): Map<string, number> {
    return new Map(this.categories);
  }

  /**
   * 获取类别频率
   */
  public getFrequencies(): Map<string, number> {
    return new Map(this.frequencies);
  }
} 