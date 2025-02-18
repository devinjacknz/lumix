import { describe, expect, test } from '@jest/globals';

// 示例函数
function add(a: number, b: number): number {
  return a + b;
}

// 示例类
class Calculator {
  private value: number = 0;

  constructor(initialValue: number = 0) {
    this.value = initialValue;
  }

  add(n: number): void {
    this.value += n;
  }

  subtract(n: number): void {
    this.value -= n;
  }

  getValue(): number {
    return this.value;
  }
}

// 测试套件
describe('示例测试套件', () => {
  // 函数测试
  describe('add函数', () => {
    test('应该正确相加两个正数', () => {
      expect(add(1, 2)).toBe(3);
    });

    test('应该正确处理负数', () => {
      expect(add(-1, 1)).toBe(0);
      expect(add(-1, -1)).toBe(-2);
    });

    test('应该正确处理0', () => {
      expect(add(0, 0)).toBe(0);
      expect(add(1, 0)).toBe(1);
      expect(add(0, 1)).toBe(1);
    });
  });

  // 类测试
  describe('Calculator类', () => {
    let calculator: Calculator;

    beforeEach(() => {
      calculator = new Calculator();
    });

    test('初始值应为0', () => {
      expect(calculator.getValue()).toBe(0);
    });

    test('可以设置自定义初始值', () => {
      const calc = new Calculator(10);
      expect(calc.getValue()).toBe(10);
    });

    test('add方法应正确工作', () => {
      calculator.add(5);
      expect(calculator.getValue()).toBe(5);
      calculator.add(3);
      expect(calculator.getValue()).toBe(8);
    });

    test('subtract方法应正确工作', () => {
      calculator.subtract(5);
      expect(calculator.getValue()).toBe(-5);
      calculator.subtract(3);
      expect(calculator.getValue()).toBe(-8);
    });

    test('连续操作应正确工作', () => {
      calculator.add(10);
      calculator.subtract(5);
      calculator.add(3);
      calculator.subtract(2);
      expect(calculator.getValue()).toBe(6);
    });
  });
}); 