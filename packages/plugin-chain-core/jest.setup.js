// 扩展 Jest 匹配器
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// 全局超时设置
jest.setTimeout(30000);

// 清理所有模拟
afterEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
}); 