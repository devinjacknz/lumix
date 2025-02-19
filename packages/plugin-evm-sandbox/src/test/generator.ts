import { Transaction, FeeMarketEIP1559Transaction } from '@ethereumjs/tx';
import { Address, toBuffer } from '@ethereumjs/util';
import { BaseError } from '@lumix/core';
import { EVMSandbox, AccountState, SimulationResult } from '../sandbox';

export class TestGeneratorError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TestGeneratorError';
  }
}

export interface TestCase {
  id: string;
  description: string;
  type: 'basic' | 'boundary' | 'concurrent' | 'historical';
  setup: {
    accounts: Array<{
      address: string;
      state: Partial<AccountState>;
    }>;
    storage?: Array<{
      address: string;
      key: Buffer;
      value: Buffer;
    }>;
  };
  transactions: Array<{
    tx: Transaction;
    expectedResult?: Partial<SimulationResult>;
  }>;
  concurrency?: {
    parallel: boolean;
    maxThreads?: number;
  };
}

export interface TestGeneratorConfig {
  sandbox: EVMSandbox;
  historicalTxLimit?: number;
  boundaryTestsEnabled?: boolean;
  concurrentTestsEnabled?: boolean;
  maxConcurrentThreads?: number;
}

export class TestGenerator {
  private sandbox: EVMSandbox;
  private config: Required<TestGeneratorConfig>;
  private testCases: Map<string, TestCase>;

  constructor(config: TestGeneratorConfig) {
    this.sandbox = config.sandbox;
    this.config = {
      sandbox: config.sandbox,
      historicalTxLimit: config.historicalTxLimit || 1000,
      boundaryTestsEnabled: config.boundaryTestsEnabled ?? true,
      concurrentTestsEnabled: config.concurrentTestsEnabled ?? true,
      maxConcurrentThreads: config.maxConcurrentThreads || 4
    };
    this.testCases = new Map();
  }

  /**
   * 从历史交易生成测试用例
   */
  async generateFromHistorical(
    transactions: Array<{ tx: Transaction; result: SimulationResult }>,
    options: { filterSuccessful?: boolean; groupByContract?: boolean } = {}
  ): Promise<TestCase[]> {
    const testCases: TestCase[] = [];
    const txGroups = new Map<string, typeof transactions>();

    // 按合约分组
    if (options.groupByContract) {
      for (const txData of transactions) {
        const contractAddr = txData.tx.to?.toString() || 'contract-creation';
        let group = txGroups.get(contractAddr) || [];
        group.push(txData);
        txGroups.set(contractAddr, group);
      }
    } else {
      txGroups.set('default', transactions);
    }

    // 为每个组生成测试用例
    for (const [contractAddr, txGroup] of txGroups) {
      // 过滤成功/失败的交易
      const filteredTxs = options.filterSuccessful
        ? txGroup.filter(tx => tx.result.success)
        : txGroup;

      // 限制历史交易数量
      const limitedTxs = filteredTxs.slice(0, this.config.historicalTxLimit);

      // 收集账户状态
      const accounts = new Set<string>();
      for (const { tx } of limitedTxs) {
        accounts.add(tx.getSenderAddress().toString());
        if (tx.to) accounts.add(tx.to.toString());
      }

      // 创建测试用例
      const testCase: TestCase = {
        id: `historical-${contractAddr}-${Date.now()}`,
        description: `Historical transactions test for contract ${contractAddr}`,
        type: 'historical',
        setup: {
          accounts: await Promise.all(
            Array.from(accounts).map(async addr => ({
              address: addr,
              state: await this.sandbox.getAccountState(addr)
            }))
          )
        },
        transactions: limitedTxs.map(({ tx, result }) => ({
          tx,
          expectedResult: {
            success: result.success,
            gasUsed: result.gasUsed
          }
        }))
      };

      testCases.push(testCase);
      this.testCases.set(testCase.id, testCase);
    }

    return testCases;
  }

  /**
   * 生成边界条件测试
   */
  async generateBoundaryTests(
    baseCase: TestCase
  ): Promise<TestCase[]> {
    if (!this.config.boundaryTestsEnabled) {
      return [];
    }

    const boundaryTests: TestCase[] = [];

    // 1. Gas 限制边界测试
    const gasLimitTest = this.createBoundaryTest(baseCase, 'gas-limit', tx => {
      const gasLimit = tx.gasLimit;
      return [
        { ...tx, gasLimit: gasLimit - 1000n }, // 略低于预期
        { ...tx, gasLimit: gasLimit + 1000n }, // 略高于预期
        { ...tx, gasLimit: 21000n }  // 最小值
      ];
    });
    boundaryTests.push(gasLimitTest);

    // 2. 余额边界测试
    const balanceTest = this.createBoundaryTest(baseCase, 'balance', tx => {
      const value = tx.value || 0n;
      return [
        { ...tx, value: value - 1n }, // 略低于转账值
        { ...tx, value: value + 1n }, // 略高于转账值
        { ...tx, value: 0n }  // 零值转账
      ];
    });
    boundaryTests.push(balanceTest);

    // 3. 数据大小边界测试
    const dataTest = this.createBoundaryTest(baseCase, 'data-size', tx => {
      const data = tx.data;
      return [
        { ...tx, data: Buffer.alloc(0) }, // 空数据
        { ...tx, data: Buffer.concat([data, Buffer.alloc(100)]) }, // 较大数据
        { ...tx, data: data.slice(0, Math.max(4, data.length - 1)) } // 截断数据
      ];
    });
    boundaryTests.push(dataTest);

    // 保存并返回边界测试
    for (const test of boundaryTests) {
      this.testCases.set(test.id, test);
    }

    return boundaryTests;
  }

  /**
   * 生成并发测试用例
   */
  async generateConcurrentTests(
    baseCase: TestCase
  ): Promise<TestCase[]> {
    if (!this.config.concurrentTestsEnabled) {
      return [];
    }

    const concurrentTests: TestCase[] = [];

    // 1. 相同合约并发调用测试
    const sameContractTest: TestCase = {
      id: `concurrent-same-contract-${baseCase.id}`,
      description: 'Concurrent calls to the same contract',
      type: 'concurrent',
      setup: baseCase.setup,
      transactions: baseCase.transactions,
      concurrency: {
        parallel: true,
        maxThreads: this.config.maxConcurrentThreads
      }
    };
    concurrentTests.push(sameContractTest);

    // 2. 状态依赖并发测试
    const stateDependentTest: TestCase = {
      id: `concurrent-state-dependent-${baseCase.id}`,
      description: 'Concurrent state-dependent transactions',
      type: 'concurrent',
      setup: baseCase.setup,
      transactions: this.generateStateDependentTxs(baseCase.transactions),
      concurrency: {
        parallel: true,
        maxThreads: 2 // 限制线程数以增加状态冲突概率
      }
    };
    concurrentTests.push(stateDependentTest);

    // 保存并返回并发测试
    for (const test of concurrentTests) {
      this.testCases.set(test.id, test);
    }

    return concurrentTests;
  }

  /**
   * 获取测试用例
   */
  getTestCase(id: string): TestCase | undefined {
    return this.testCases.get(id);
  }

  /**
   * 获取所有测试用例
   */
  getAllTestCases(): TestCase[] {
    return Array.from(this.testCases.values());
  }

  private createBoundaryTest(
    baseCase: TestCase,
    type: string,
    txModifier: (tx: Transaction) => Transaction[]
  ): TestCase {
    return {
      id: `boundary-${type}-${baseCase.id}`,
      description: `Boundary test for ${type}`,
      type: 'boundary',
      setup: baseCase.setup,
      transactions: baseCase.transactions.flatMap(({ tx }) => 
        txModifier(tx).map(modifiedTx => ({
          tx: modifiedTx,
          expectedResult: undefined // 边界测试的预期结果需要运行时确定
        }))
      )
    };
  }

  private generateStateDependentTxs(
    originalTxs: TestCase['transactions']
  ): TestCase['transactions'] {
    const result: TestCase['transactions'] = [];
    
    for (const { tx } of originalTxs) {
      // 创建一个读取状态的交易
      result.push({
        tx: tx, // 原始交易
        expectedResult: undefined
      });

      // 创建一个修改状态的交易
      if (tx.to && tx.data.length >= 4) {
        const modifiedTx = {
          ...tx,
          data: Buffer.concat([
            tx.data.slice(0, 4), // 保持方法签名不变
            Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex') // 修改参数
          ])
        };
        result.push({
          tx: modifiedTx as Transaction,
          expectedResult: undefined
        });
      }
    }

    return result;
  }
} 