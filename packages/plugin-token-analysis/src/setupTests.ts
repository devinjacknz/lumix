import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// 设置全局变量
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// 禁用日志输出
jest.mock('@lumix/core', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// 设置测试超时
jest.setTimeout(30000);

// 清理所有模拟
afterEach(() => {
  jest.clearAllMocks();
});

// 添加自定义匹配器
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  }
}); 