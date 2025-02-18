import NodeEnvironment from 'jest-environment-node';
import type { Config } from '@jest/types';
import { TestEnvironment } from '@jest/environment';

class IntegrationEnvironment extends NodeEnvironment implements TestEnvironment {
  constructor(config: Config.ProjectConfig) {
    super(config);
  }

  async setup() {
    await super.setup();
    
    // 设置全局变量
    this.global.testConfig = {
      apiUrl: process.env.TEST_API_URL || 'http://localhost:3000',
      apiKey: process.env.TEST_API_KEY || 'test-key',
      timeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
      retryAttempts: parseInt(process.env.TEST_RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.TEST_RETRY_DELAY || '1000')
    };

    // 设置测试助手函数
    this.global.waitForCondition = async (
      condition: () => Promise<boolean> | boolean,
      timeout: number = 5000,
      interval: number = 100
    ): Promise<void> => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (await condition()) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      throw new Error('Condition not met within timeout');
    };

    this.global.retryOperation = async <T>(
      operation: () => Promise<T>,
      maxAttempts: number = 3,
      delay: number = 1000
    ): Promise<T> => {
      let lastError: Error;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
          }
        }
      }
      throw lastError;
    };
  }

  async teardown() {
    // 清理全局变量
    delete this.global.testConfig;
    delete this.global.waitForCondition;
    delete this.global.retryOperation;

    await super.teardown();
  }

  getVmContext() {
    return super.getVmContext();
  }
}

export default IntegrationEnvironment; 