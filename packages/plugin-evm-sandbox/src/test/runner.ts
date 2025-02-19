import { BaseError } from '@lumix/core';
import { EVMSandbox } from '../sandbox';
import { TestCase } from './generator';

export class TestRunnerError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TestRunnerError';
  }
}

export interface TestResult {
  testId: string;
  success: boolean;
  error?: Error;
  duration: number;
  transactions: Array<{
    success: boolean;
    gasUsed: bigint;
    error?: Error;
    matchedExpected: boolean;
  }>;
}

export interface TestRunnerConfig {
  sandbox: EVMSandbox;
  timeout?: number; // 毫秒
  retryCount?: number;
  retryDelay?: number; // 毫秒
  parallel?: boolean;
}

export class TestRunner {
  private sandbox: EVMSandbox;
  private config: Required<TestRunnerConfig>;
  private results: Map<string, TestResult>;

  constructor(config: TestRunnerConfig) {
    this.sandbox = config.sandbox;
    this.config = {
      sandbox: config.sandbox,
      timeout: config.timeout || 30000, // 30秒
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000,
      parallel: config.parallel ?? true
    };
    this.results = new Map();
  }

  /**
   * 运行单个测试用例
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    let error: Error | undefined;
    let txResults: TestResult['transactions'] = [];

    try {
      // 创建初始快照
      const snapshotId = await this.sandbox.createSnapshot();

      // 设置初始状态
      for (const account of testCase.setup.accounts) {
        await this.sandbox.setAccountState(account.address, account.state);
      }

      if (testCase.setup.storage) {
        for (const storage of testCase.setup.storage) {
          await this.sandbox.setStorageAt(
            storage.address,
            storage.key,
            storage.value
          );
        }
      }

      // 执行交易
      if (testCase.concurrency?.parallel && this.config.parallel) {
        txResults = await this.runParallelTransactions(
          testCase.transactions,
          testCase.concurrency.maxThreads
        );
      } else {
        txResults = await this.runSequentialTransactions(testCase.transactions);
      }

      // 恢复初始状态
      await this.sandbox.revertToSnapshot(snapshotId);
      this.sandbox.deleteSnapshot(snapshotId);

    } catch (err) {
      error = err instanceof Error ? err : new TestRunnerError('Unknown error');
    }

    const result: TestResult = {
      testId: testCase.id,
      success: !error && txResults.every(r => r.success),
      error,
      duration: Date.now() - startTime,
      transactions: txResults
    };

    this.results.set(testCase.id, result);
    return result;
  }

  /**
   * 运行多个测试用例
   */
  async runTests(testCases: TestCase[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    if (this.config.parallel) {
      // 并行执行测试
      const promises = testCases.map(async testCase => {
        const result = await this.runTestWithRetry(testCase);
        results.push(result);
        return result;
      });

      await Promise.all(promises);
    } else {
      // 顺序执行测试
      for (const testCase of testCases) {
        const result = await this.runTestWithRetry(testCase);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 获取测试结果
   */
  getTestResult(testId: string): TestResult | undefined {
    return this.results.get(testId);
  }

  /**
   * 获取所有测试结果
   */
  getAllTestResults(): TestResult[] {
    return Array.from(this.results.values());
  }

  private async runTestWithRetry(
    testCase: TestCase,
    attempt: number = 1
  ): Promise<TestResult> {
    try {
      return await Promise.race([
        this.runTest(testCase),
        new Promise<TestResult>((_, reject) => {
          setTimeout(() => {
            reject(new TestRunnerError(`Test timeout after ${this.config.timeout}ms`));
          }, this.config.timeout);
        })
      ]);
    } catch (error) {
      if (attempt < this.config.retryCount) {
        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryDelay)
        );
        return this.runTestWithRetry(testCase, attempt + 1);
      }
      throw error;
    }
  }

  private async runSequentialTransactions(
    transactions: TestCase['transactions']
  ): Promise<TestResult['transactions']> {
    const results: TestResult['transactions'] = [];

    for (const { tx, expectedResult } of transactions) {
      try {
        const result = await this.sandbox.executeTx(tx);
        results.push({
          success: result.success,
          gasUsed: result.gasUsed,
          matchedExpected: this.matchesExpectedResult(result, expectedResult)
        });
      } catch (error) {
        results.push({
          success: false,
          gasUsed: 0n,
          error: error instanceof Error ? error : new TestRunnerError('Unknown error'),
          matchedExpected: false
        });
      }
    }

    return results;
  }

  private async runParallelTransactions(
    transactions: TestCase['transactions'],
    maxThreads: number = 4
  ): Promise<TestResult['transactions']> {
    const results: TestResult['transactions'] = new Array(transactions.length);
    const chunks = this.chunkArray(transactions, maxThreads);

    for (const chunk of chunks) {
      const promises = chunk.map(async ({ tx, expectedResult }, index) => {
        try {
          const result = await this.sandbox.simulateTx(tx);
          return {
            success: result.success,
            gasUsed: result.gasUsed,
            matchedExpected: this.matchesExpectedResult(result, expectedResult)
          };
        } catch (error) {
          return {
            success: false,
            gasUsed: 0n,
            error: error instanceof Error ? error : new TestRunnerError('Unknown error'),
            matchedExpected: false
          };
        }
      });

      const chunkResults = await Promise.all(promises);
      chunkResults.forEach((result, index) => {
        results[index] = result;
      });
    }

    return results;
  }

  private matchesExpectedResult(
    actual: any,
    expected?: Partial<any>
  ): boolean {
    if (!expected) return true;
    return Object.entries(expected).every(([key, value]) => 
      actual[key] === value
    );
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
} 