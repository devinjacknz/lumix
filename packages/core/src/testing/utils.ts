import { LumixError } from '../errors/base';

export interface TestCase {
  name: string;
  fn: () => Promise<void>;
  timeout?: number;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
  beforeAll?: () => Promise<void>;
  afterAll?: () => Promise<void>;
  beforeEach?: () => Promise<void>;
  afterEach?: () => Promise<void>;
}

export interface TestResult {
  name: string;
  success: boolean;
  error?: Error;
  duration: number;
}

export class TestRunner {
  private suites: TestSuite[] = [];

  addSuite(suite: TestSuite): void {
    this.suites.push(suite);
  }

  async runSuite(suite: TestSuite): Promise<TestResult[]> {
    const results: TestResult[] = [];
    console.log(`\nRunning test suite: ${suite.name}`);

    try {
      if (suite.beforeAll) {
        await suite.beforeAll();
      }

      for (const test of suite.tests) {
        if (suite.beforeEach) {
          await suite.beforeEach();
        }

        const result = await this.runTest(test);
        results.push(result);

        if (suite.afterEach) {
          await suite.afterEach();
        }
      }

      if (suite.afterAll) {
        await suite.afterAll();
      }
    } catch (error) {
      console.error(`Error in test suite ${suite.name}:`, error);
    }

    return results;
  }

  private async runTest(test: TestCase): Promise<TestResult> {
    console.log(`  Running test: ${test.name}`);
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Test timed out after ${test.timeout}ms`));
        }, test.timeout ?? 5000);
      });

      await Promise.race([test.fn(), timeoutPromise]);

      return {
        name: test.name,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error(`    ❌ ${test.name} failed:`, error);
      return {
        name: test.name,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime
      };
    }
  }

  async runAll(): Promise<Map<string, TestResult[]>> {
    const allResults = new Map<string, TestResult[]>();

    for (const suite of this.suites) {
      const results = await this.runSuite(suite);
      allResults.set(suite.name, results);
    }

    this.printSummary(allResults);
    return allResults;
  }

  private printSummary(results: Map<string, TestResult[]>): void {
    console.log('\nTest Summary:');
    let totalTests = 0;
    let passedTests = 0;

    results.forEach((suiteResults, suiteName) => {
      console.log(`\n${suiteName}:`);
      suiteResults.forEach(result => {
        totalTests++;
        if (result.success) {
          passedTests++;
          console.log(`  ✅ ${result.name} (${result.duration}ms)`);
        } else {
          console.log(`  ❌ ${result.name} (${result.duration}ms)`);
          if (result.error) {
            console.log(`     Error: ${result.error.message}`);
          }
        }
      });
    });

    console.log(`\nTotal: ${totalTests}, Passed: ${passedTests}, Failed: ${totalTests - passedTests}`);
  }
}

// Test assertion utilities
export class Assertions {
  static async assertThrows(fn: () => Promise<any>, errorType?: typeof LumixError): Promise<void> {
    try {
      await fn();
      throw new Error('Expected function to throw an error');
    } catch (error) {
      if (errorType && !(error instanceof errorType)) {
        throw new Error(`Expected error to be instance of ${errorType.name}`);
      }
    }
  }

  static assertEquals<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${expected} but got ${actual}`);
    }
  }

  static assertNotEquals<T>(actual: T, expected: T, message?: string): void {
    if (actual === expected) {
      throw new Error(message ?? `Expected ${actual} to be different from ${expected}`);
    }
  }

  static assertTrue(value: boolean, message?: string): void {
    if (!value) {
      throw new Error(message ?? 'Expected value to be true');
    }
  }

  static assertFalse(value: boolean, message?: string): void {
    if (value) {
      throw new Error(message ?? 'Expected value to be false');
    }
  }

  static assertDefined<T>(value: T | undefined | null, message?: string): asserts value is T {
    if (value === undefined || value === null) {
      throw new Error(message ?? 'Expected value to be defined');
    }
  }
}
