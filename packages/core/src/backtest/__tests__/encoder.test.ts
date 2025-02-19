import { Encoder, EncodingType } from '../encoder';

describe('Encoder', () => {
  // 测试数据
  const testData = ['A', 'B', 'C', 'A', 'B', 'A', 'C', 'B', 'A', 'C'];

  describe('One-Hot Encoding', () => {
    const encoder = new Encoder({ type: EncodingType.ONE_HOT });

    test('should encode categories correctly', () => {
      const result = encoder.fitTransform(testData);
      
      // 验证维度
      expect(result.length).toBe(testData.length);
      expect(result[0].length).toBe(3); // 3个唯一类别

      // 验证编码
      const categories = encoder.getCategories();
      expect(categories.size).toBe(3);
      
      // 验证每行只有一个1
      result.forEach(row => {
        expect(row.reduce((a, b) => a + b)).toBe(1);
      });
    });

    test('should handle dropFirst option', () => {
      const encoderWithDrop = new Encoder({ 
        type: EncodingType.ONE_HOT, 
        dropFirst: true 
      });
      const result = encoderWithDrop.fitTransform(testData);
      
      // 验证维度减少了1
      expect(result[0].length).toBe(2);
    });
  });

  describe('Label Encoding', () => {
    const encoder = new Encoder({ type: EncodingType.LABEL });

    test('should encode categories correctly', () => {
      const result = encoder.fitTransform(testData);
      
      // 验证维度
      expect(result.length).toBe(testData.length);
      expect(result[0].length).toBe(1);

      // 验证编码值
      const categories = encoder.getCategories();
      result.forEach((encoded, i) => {
        expect(encoded[0]).toBe(categories.get(testData[i]));
      });
    });

    test('should handle unknown categories', () => {
      encoder.fit(testData);
      const result = encoder.transform(['D']);
      expect(result[0][0]).toBe(-1);
    });
  });

  describe('Binary Encoding', () => {
    const encoder = new Encoder({ type: EncodingType.BINARY });

    test('should encode categories correctly', () => {
      const result = encoder.fitTransform(testData);
      
      // 验证维度
      expect(result.length).toBe(testData.length);
      const expectedBits = Math.ceil(Math.log2(3)); // 3个类别需要2位二进制
      expect(result[0].length).toBe(expectedBits);

      // 验证编码值
      result.forEach(row => {
        expect(row.every(bit => bit === 0 || bit === 1)).toBe(true);
      });
    });

    test('should handle unknown categories', () => {
      encoder.fit(testData);
      const result = encoder.transform(['D']);
      expect(result[0].every(bit => bit === 0)).toBe(true);
    });
  });

  describe('Frequency Encoding', () => {
    const encoder = new Encoder({ type: EncodingType.FREQUENCY });

    test('should encode categories correctly', () => {
      const result = encoder.fitTransform(testData);
      
      // 验证维度
      expect(result.length).toBe(testData.length);
      expect(result[0].length).toBe(1);

      // 验证频率和
      const frequencies = encoder.getFrequencies();
      const totalCount = Array.from(frequencies.values()).reduce((a, b) => a + b);
      
      result.forEach(row => {
        expect(row[0]).toBeGreaterThan(0);
        expect(row[0]).toBeLessThanOrEqual(1);
      });

      // 验证相同类别有相同的频率
      const firstA = result[testData.indexOf('A')][0];
      testData.forEach((value, i) => {
        if (value === 'A') {
          expect(result[i][0]).toBe(firstA);
        }
      });
    });
  });

  describe('Error Handling', () => {
    test('should throw error when transforming without fitting', () => {
      const encoder = new Encoder({ type: EncodingType.ONE_HOT });
      expect(() => encoder.transform(['A'])).toThrow();
    });

    test('should handle empty input array', () => {
      const encoder = new Encoder({ type: EncodingType.ONE_HOT });
      expect(() => encoder.fit([])).not.toThrow();
    });

    test('should handle invalid encoding type', () => {
      const encoder = new Encoder({ type: 'invalid' as EncodingType });
      encoder.fit(['A']);
      expect(() => encoder.transform(['A'])).toThrow();
    });
  });
}); 