import { Transformer, TransformationType } from '../transformer';

describe('Transformer', () => {
  // 测试数据
  const testData2D = [
    [1, 10, 100],
    [2, 20, 200],
    [3, 30, 300],
    [4, 40, 400],
    [5, 50, 500]
  ];

  describe('Polynomial Transform', () => {
    const transformer = new Transformer({
      type: TransformationType.POLYNOMIAL,
      degree: 2
    });

    test('should transform data with polynomial features', () => {
      const result = transformer.fitTransform(testData2D);
      
      // 验证维度
      expect(result.length).toBe(testData2D.length);
      expect(result[0].length).toBe(testData2D[0].length * 2); // 2次多项式

      // 验证转换结果
      result.forEach(row => {
        row.forEach(value => {
          expect(Number.isFinite(value)).toBe(true);
        });
      });
    });

    test('should handle custom degree', () => {
      const customTransformer = new Transformer({
        type: TransformationType.POLYNOMIAL,
        degree: 3
      });
      const result = customTransformer.fitTransform(testData2D);

      // 验证维度
      expect(result[0].length).toBe(testData2D[0].length * 3); // 3次多项式
    });
  });

  describe('Exponential Transform', () => {
    const transformer = new Transformer({
      type: TransformationType.EXPONENTIAL,
      alpha: 1.0
    });

    test('should transform data with exponential function', () => {
      const result = transformer.fitTransform(testData2D);
      
      // 验证维度
      expect(result.length).toBe(testData2D.length);
      expect(result[0].length).toBe(testData2D[0].length);

      // 验证转换结果
      result.forEach(row => {
        row.forEach(value => {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(value)).toBe(true);
        });
      });
    });

    test('should handle custom alpha', () => {
      const customTransformer = new Transformer({
        type: TransformationType.EXPONENTIAL,
        alpha: 0.5
      });
      const result = customTransformer.fitTransform(testData2D);

      // 验证转换结果较小
      result.forEach(row => {
        row.forEach(value => {
          expect(value).toBeLessThan(Math.E);
        });
      });
    });
  });

  describe('Fourier Transform', () => {
    const transformer = new Transformer({
      type: TransformationType.FOURIER,
      components: 5
    });

    test('should transform data with Fourier transform', () => {
      const result = transformer.fitTransform(testData2D);
      
      // 验证维度
      expect(result.length).toBe(testData2D.length);
      expect(result[0].length).toBe(testData2D[0].length);

      // 验证转换结果
      result.forEach(row => {
        row.forEach(value => {
          expect(Number.isFinite(value)).toBe(true);
        });
      });
    });

    test('should handle custom components', () => {
      const customTransformer = new Transformer({
        type: TransformationType.FOURIER,
        components: 3
      });
      const result = customTransformer.fitTransform(testData2D);

      // 验证结果的平滑性
      for (let j = 0; j < result[0].length; j++) {
        const column = result.map(row => row[j]);
        const diff = column.slice(1).map((v, i) => Math.abs(v - column[i]));
        const maxDiff = Math.max(...diff);
        expect(maxDiff).toBeLessThan(1000); // 平滑性检查
      }
    });
  });

  describe('Wavelet Transform', () => {
    const transformer = new Transformer({
      type: TransformationType.WAVELET,
      waveletType: 'db4'
    });

    test('should transform data with wavelet transform', () => {
      const result = transformer.fitTransform(testData2D);
      
      // 验证维度
      expect(result.length).toBe(testData2D.length);
      expect(result[0].length).toBe(testData2D[0].length);

      // 验证转换结果
      result.forEach(row => {
        row.forEach(value => {
          expect(Number.isFinite(value)).toBe(true);
        });
      });
    });

    test('should handle different wavelet types', () => {
      const customTransformer = new Transformer({
        type: TransformationType.WAVELET,
        waveletType: 'haar'
      });
      const result = customTransformer.fitTransform(testData2D);

      // 验证结果的有效性
      result.forEach(row => {
        row.forEach(value => {
          expect(Number.isFinite(value)).toBe(true);
        });
      });
    });
  });

  describe('Error Handling', () => {
    test('should throw error when transforming without fitting', () => {
      const transformer = new Transformer({
        type: TransformationType.POLYNOMIAL
      });
      expect(() => transformer.transform([[1, 2, 3]])).toThrow();
    });

    test('should handle empty input array', () => {
      const transformer = new Transformer({
        type: TransformationType.POLYNOMIAL
      });
      expect(() => transformer.fit([])).toThrow();
    });

    test('should handle invalid transform type', () => {
      const transformer = new Transformer({
        type: 'invalid' as TransformationType
      });
      expect(() => transformer.fit([[1, 2, 3]])).toThrow();
    });

    test('should handle invalid wavelet type', () => {
      const transformer = new Transformer({
        type: TransformationType.WAVELET,
        waveletType: 'invalid'
      });
      expect(() => transformer.fit([[1, 2, 3]])).toThrow();
    });
  });

  describe('Feature Names', () => {
    test('should handle custom feature names', () => {
      const transformer = new Transformer({
        type: TransformationType.POLYNOMIAL
      });
      const featureNames = ['A', 'B', 'C'];
      transformer.fit(testData2D, featureNames);
      
      // 验证参数映射
      const params = transformer.getParams();
      featureNames.forEach(name => {
        expect(params.has(name)).toBe(true);
      });
    });

    test('should generate default feature names', () => {
      const transformer = new Transformer({
        type: TransformationType.POLYNOMIAL
      });
      transformer.fit(testData2D);
      
      // 验证参数映射
      const params = transformer.getParams();
      expect(params.size).toBe(testData2D[0].length);
      for (let i = 0; i < testData2D[0].length; i++) {
        expect(params.has(`feature_${i}`)).toBe(true);
      }
    });
  });
}); 