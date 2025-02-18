import { Scaler, ScalingType } from '../scaler';

describe('Scaler', () => {
  // 测试数据
  const testData1D = [1, 2, 3, 4, 5];
  const testData2D = [
    [1, 10, 100],
    [2, 20, 200],
    [3, 30, 300],
    [4, 40, 400],
    [5, 50, 500]
  ];

  describe('Min-Max Scaling', () => {
    const scaler = new Scaler({ type: ScalingType.MIN_MAX });

    test('should scale 1D array correctly', () => {
      const result = scaler.fitTransform(testData1D) as number[];
      
      // 验证范围在[0,1]之间
      expect(Math.min(...result)).toBeCloseTo(0);
      expect(Math.max(...result)).toBeCloseTo(1);
      
      // 验证保持相对顺序
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThan(result[i-1]);
      }
    });

    test('should scale 2D array correctly', () => {
      const result = scaler.fitTransform(testData2D) as number[][];
      
      // 验证每列的缩放
      for (let j = 0; j < testData2D[0].length; j++) {
        const column = result.map(row => row[j]);
        expect(Math.min(...column)).toBeCloseTo(0);
        expect(Math.max(...column)).toBeCloseTo(1);
      }
    });

    test('should handle custom feature range', () => {
      const customScaler = new Scaler({
        type: ScalingType.MIN_MAX,
        featureRange: [-1, 1]
      });
      const result = customScaler.fitTransform(testData1D) as number[];
      
      expect(Math.min(...result)).toBeCloseTo(-1);
      expect(Math.max(...result)).toBeCloseTo(1);
    });
  });

  describe('Standard Scaling', () => {
    const scaler = new Scaler({ type: ScalingType.STANDARD });

    test('should scale 1D array correctly', () => {
      const result = scaler.fitTransform(testData1D) as number[];
      
      // 验证均值接近0，标准差接近1
      const mean = result.reduce((a, b) => a + b) / result.length;
      const std = Math.sqrt(
        result.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / result.length
      );
      
      expect(mean).toBeCloseTo(0, 1);
      expect(std).toBeCloseTo(1, 1);
    });

    test('should scale 2D array correctly', () => {
      const result = scaler.fitTransform(testData2D) as number[][];
      
      // 验证每列的标准化
      for (let j = 0; j < testData2D[0].length; j++) {
        const column = result.map(row => row[j]);
        const mean = column.reduce((a, b) => a + b) / column.length;
        const std = Math.sqrt(
          column.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / column.length
        );
        
        expect(mean).toBeCloseTo(0, 1);
        expect(std).toBeCloseTo(1, 1);
      }
    });
  });

  describe('Quantile Scaling', () => {
    const scaler = new Scaler({ type: ScalingType.QUANTILE });

    test('should scale 1D array correctly', () => {
      const result = scaler.fitTransform(testData1D) as number[];
      
      // 验证四分位数范围
      const sorted = [...result].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(result.length * 0.25)];
      const q3 = sorted[Math.floor(result.length * 0.75)];
      
      expect(q1).toBeCloseTo(0.25, 1);
      expect(q3).toBeCloseTo(0.75, 1);
    });

    test('should handle custom quantile range', () => {
      const customScaler = new Scaler({
        type: ScalingType.QUANTILE,
        quantileRange: [0.1, 0.9]
      });
      const result = customScaler.fitTransform(testData1D) as number[];
      
      const sorted = [...result].sort((a, b) => a - b);
      const q10 = sorted[Math.floor(result.length * 0.1)];
      const q90 = sorted[Math.floor(result.length * 0.9)];
      
      expect(q10).toBeCloseTo(0.1, 1);
      expect(q90).toBeCloseTo(0.9, 1);
    });
  });

  describe('Adaptive Scaling', () => {
    const scaler = new Scaler({ type: ScalingType.ADAPTIVE });

    test('should scale 1D array correctly', () => {
      const result = scaler.fitTransform(testData1D) as number[];
      
      // 验证自适应缩放结果
      expect(result.length).toBe(testData1D.length);
      result.forEach(value => {
        expect(Number.isFinite(value)).toBe(true);
      });
    });

    test('should handle custom window size', () => {
      const customScaler = new Scaler({
        type: ScalingType.ADAPTIVE,
        adaptiveWindow: 3
      });
      const result = customScaler.fitTransform(testData1D) as number[];
      
      // 验证窗口大小影响
      expect(result.length).toBe(testData1D.length);
      result.forEach(value => {
        expect(Number.isFinite(value)).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    test('should throw error when scaling without fitting', () => {
      const scaler = new Scaler({ type: ScalingType.MIN_MAX });
      expect(() => scaler.transform([[1, 2, 3]])).toThrow();
    });

    test('should handle empty input array', () => {
      const scaler = new Scaler({ type: ScalingType.MIN_MAX });
      expect(() => scaler.fit([])).toThrow();
    });

    test('should handle invalid scaling type', () => {
      const scaler = new Scaler({ type: 'invalid' as ScalingType });
      expect(() => scaler.fit([[1, 2, 3]])).toThrow();
    });

    test('should handle arrays with zeros', () => {
      const scaler = new Scaler({ type: ScalingType.STANDARD });
      const result = scaler.fitTransform([0, 0, 0]) as number[];
      expect(result.every(val => val === 0)).toBe(true);
    });
  });

  describe('Feature Names', () => {
    test('should handle custom feature names', () => {
      const scaler = new Scaler({ type: ScalingType.MIN_MAX });
      const featureNames = ['A', 'B', 'C'];
      scaler.fit(testData2D, featureNames);
      
      // 验证参数映射
      const params = scaler.getParams();
      featureNames.forEach(name => {
        expect(params.has(name)).toBe(true);
      });
    });

    test('should generate default feature names', () => {
      const scaler = new Scaler({ type: ScalingType.MIN_MAX });
      scaler.fit(testData2D);
      
      // 验证参数映射
      const params = scaler.getParams();
      expect(params.size).toBe(testData2D[0].length);
      for (let i = 0; i < testData2D[0].length; i++) {
        expect(params.has(`feature_${i}`)).toBe(true);
      }
    });
  });
}); 