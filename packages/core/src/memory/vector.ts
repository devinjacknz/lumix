import { Vector, DistanceMetric } from '@lumix/types';

/**
 * 向量操作错误类
 */
export class VectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorError';
  }
}

/**
 * 向量操作工具类
 */
export class VectorOps {
  /**
   * 计算余弦相似度
   */
  static cosineSimilarity(a: Vector, b: Vector): number {
    if (a.values.length !== b.values.length) {
      throw new VectorError('向量维度不匹配');
    }

    const dotProduct = a.values.reduce((sum, val, i) => sum + val * b.values[i], 0);
    const normA = Math.sqrt(a.values.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.values.reduce((sum, val) => sum + val * val, 0));

    if (normA === 0 || normB === 0) {
      throw new VectorError('向量范数为0');
    }

    return dotProduct / (normA * normB);
  }

  /**
   * 计算欧几里得距离
   */
  static euclideanDistance(a: Vector, b: Vector): number {
    if (a.values.length !== b.values.length) {
      throw new VectorError('向量维度不匹配');
    }

    return Math.sqrt(
      a.values.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - b.values[i], 2), 0)
    );
  }

  /**
   * 计算曼哈顿距离
   */
  static manhattanDistance(a: Vector, b: Vector): number {
    if (a.values.length !== b.values.length) {
      throw new VectorError('向量维度不匹配');
    }

    return a.values.reduce((sum: number, val: number, i: number) => sum + Math.abs(val - b.values[i]), 0);
  }

  /**
   * 计算点积
   */
  static dotProduct(a: Vector, b: Vector): number {
    if (a.values.length !== b.values.length) {
      throw new VectorError('向量维度不匹配');
    }

    return a.values.reduce((sum, val, i) => sum + val * b.values[i], 0);
  }

  /**
   * 向量归一化
   */
  static normalize(vector: Vector): Vector {
    const norm = Math.sqrt(vector.values.reduce((sum, val) => sum + val * val, 0));
    return {
      dimensions: vector.dimensions,
      values: vector.values.map(val => val / norm)
    };
  }

  /**
   * 计算向量距离
   */
  static distance(a: Vector, b: Vector, metric: DistanceMetric = 'euclidean'): number {
    switch (metric) {
      case 'euclidean':
        return this.euclideanDistance(a, b);
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'manhattan':
        return this.manhattanDistance(a, b);
      default:
        throw new Error(`Unsupported distance metric: ${metric}`);
    }
  }

  /**
   * 向量加法
   */
  static add(a: Vector, b: Vector): Vector {
    if (a.dimensions !== b.dimensions) {
      throw new Error('Vectors must have the same dimensions');
    }
    return {
      dimensions: a.dimensions,
      values: a.values.map((val, i) => val + b.values[i])
    };
  }

  /**
   * 向量减法
   */
  static subtract(a: Vector, b: Vector): Vector {
    if (a.dimensions !== b.dimensions) {
      throw new Error('Vectors must have the same dimensions');
    }
    return {
      dimensions: a.dimensions,
      values: a.values.map((val, i) => val - b.values[i])
    };
  }

  /**
   * 向量数乘
   */
  static scale(vector: Vector, scalar: number): Vector {
    return {
      dimensions: vector.dimensions,
      values: vector.values.map(val => val * scalar)
    };
  }

  /**
   * 计算向量均值
   */
  static mean(vectors: Vector[]): Vector {
    if (vectors.length === 0) {
      throw new Error('Cannot calculate mean of empty vector array');
    }
    const dim = vectors[0].dimensions;
    if (!vectors.every(v => v.dimensions === dim)) {
      throw new Error('All vectors must have the same dimensions');
    }
    const sum = vectors.reduce((acc: Vector, v: Vector) => this.add(acc, v), {
      dimensions: dim,
      values: new Array(dim).fill(0)
    });
    return this.scale(sum, 1 / vectors.length);
  }
}

export function euclideanDistance(a: Vector, b: Vector): number {
  if (a.values.length !== b.values.length) {
    throw new Error('Vectors must have the same dimensions');
  }
  return Math.sqrt(
    a.values.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - b.values[i], 2), 0)
  );
}

export function cosineDistance(a: Vector, b: Vector): number {
  if (a.values.length !== b.values.length) {
    throw new Error('Vectors must have the same dimensions');
  }
  const dotProduct = a.values.reduce((sum: number, val: number, i: number) => sum + val * b.values[i], 0);
  const normA = Math.sqrt(a.values.reduce((sum: number, val: number) => sum + val * val, 0));
  const normB = Math.sqrt(b.values.reduce((sum: number, val: number) => sum + val * val, 0));
  return 1 - (dotProduct / (normA * normB));
}

export function manhattanDistance(a: Vector, b: Vector): number {
  if (a.values.length !== b.values.length) {
    throw new Error('Vectors must have the same dimensions');
  }
  return a.values.reduce((sum: number, val: number, i: number) => sum + Math.abs(val - b.values[i]), 0);
}

export function calculateDistance(a: Vector, b: Vector, metric: DistanceMetric = 'euclidean'): number {
  switch (metric) {
    case 'euclidean':
      return euclideanDistance(a, b);
    case 'cosine':
      return cosineDistance(a, b);
    case 'manhattan':
      return manhattanDistance(a, b);
    default:
      throw new Error(`Unsupported distance metric: ${metric}`);
  }
}
