import { Normalizer, NormalizationType } from '../normalizer';

describe('Normalizer', () => {
  // 测试数据
  const testData1D = [1, 2, 3, 4, 5];
  const testData2D = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9]
  ];

  describe('L1 Normalization', () => {
    const normalizer = new Normalizer({ type: NormalizationType.L1 });

    test('should normalize 1D array correctly', () => {
      const result = normalizer.normalize(testData1D) as number[];
      const sum = result.reduce((acc, val) => acc + Math.abs(val), 0);
      expect(sum).toBeCloseTo(1, 5);
      expect(result.length).toBe(testData1D.length);
    });

    test('should normalize 2D array by columns correctly', () => {
      const result = normalizer.normalize(testData2D) as number[][];
      
      // 检查每列的L1范数是否为1
      for (let j = 0; j < testData2D[0].length; j++) {
        const column = result.map(row => row[j]);
        const sum = column.reduce((acc, val) => acc + Math.abs(val), 0);
        expect(sum).toBeCloseTo(1, 5);
      }
    });
  });

  describe('L2 Normalization', () => {
    const normalizer = new Normalizer({ type: NormalizationType.L2 });

    test('should normalize 1D array correctly', () => {
      const result = normalizer.normalize(testData1D) as number[];
      const sumSquares = result.reduce((acc, val) => acc + val * val, 0);
      expect(Math.sqrt(sumSquares)).toBeCloseTo(1, 5);
    });

    test('should normalize 2D array by columns correctly', () => {
      const result = normalizer.normalize(testData2D) as number[][];
      
      // 检查每列的L2范数是否为1
      for (let j = 0; j < testData2D[0].length; j++) {
        const column = result.map(row => row[j]);
        const sumSquares = column.reduce((acc, val) => acc + val * val, 0);
        expect(Math.sqrt(sumSquares)).toBeCloseTo(1, 5);
      }
    });
  });

  describe('Max Normalization', () => {
    const normalizer = new Normalizer({ type: NormalizationType.MAX });

    test('should normalize 1D array correctly', () => {
      const result = normalizer.normalize(testData1D) as number[];
      const maxAbs = Math.max(...result.map(Math.abs));
      expect(maxAbs).toBeCloseTo(1, 5);
    });

    test('should normalize 2D array by columns correctly', () => {
      const result = normalizer.normalize(testData2D) as number[][];
      
      // 检查每列的最大绝对值是否为1
      for (let j = 0; j < testData2D[0].length; j++) {
        const column = result.map(row => row[j]);
        const maxAbs = Math.max(...column.map(Math.abs));
        expect(maxAbs).toBeCloseTo(1, 5);
      }
    });
  });

  describe('Vector Normalization', () => {
    const normalizer = new Normalizer({ type: NormalizationType.VECTOR });

    test('should normalize 1D array correctly', () => {
      const result = normalizer.normalize(testData1D) as number[];
      
      // 计算标准差
      const mean = result.reduce((acc, val) => acc + val, 0) / result.length;
      const variance = result.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / result.length;
      const std = Math.sqrt(variance);
      
      expect(std).toBeCloseTo(1, 5);
    });

    test('should normalize 2D array by columns correctly', () => {
      const result = normalizer.normalize(testData2D) as number[][];
      
      // 检查每列的标准差是否为1
      for (let j = 0; j < testData2D[0].length; j++) {
        const column = result.map(row => row[j]);
        const mean = column.reduce((acc, val) => acc + val, 0) / column.length;
        const variance = column.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / column.length;
        const std = Math.sqrt(variance);
        expect(std).toBeCloseTo(1, 5);
      }
    });
  });

  describe('Axis Parameter', () => {
    test('should normalize by rows when axis=1', () => {
      const normalizer = new Normalizer({ type: NormalizationType.L2, axis: 1 });
      const result = normalizer.normalize(testData2D) as number[][];
      
      // 检查每行的L2范数是否为1
      result.forEach(row => {
        const sumSquares = row.reduce((acc, val) => acc + val * val, 0);
        expect(Math.sqrt(sumSquares)).toBeCloseTo(1, 5);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle empty arrays', () => {
      const normalizer = new Normalizer({ type: NormalizationType.L2 });
      expect(() => normalizer.normalize([])).toThrow();
    });

    test('should handle arrays with zeros', () => {
      const normalizer = new Normalizer({ type: NormalizationType.L2 });
      const result = normalizer.normalize([0, 0, 0]) as number[];
      expect(result.every(val => val === 0)).toBe(true);
    });

    test('should handle invalid normalization type', () => {
      const normalizer = new Normalizer({ type: 'invalid' as NormalizationType });
      expect(() => normalizer.normalize([1, 2, 3])).toThrow();
    });
  });
}); 