import { VM } from '@ethereumjs/vm';
import { Common } from '@ethereumjs/common';
import { Transaction } from '@ethereumjs/tx';
import { Block } from '@ethereumjs/block';
import { Address, toBuffer } from '@ethereumjs/util';
import { DefaultStateManager } from '@ethereumjs/statemanager';
import { BaseError } from '@lumix/core';
import { GasPredictor, GasEstimationResult, GasUsageStats } from './gas/predictor';

export class EVMError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EVMError';
  }
}

export interface EVMSandboxConfig {
  chainId: number;
  hardfork?: string;
  stateRoot?: Buffer;
  debug?: boolean;
}

export interface TransactionResult {
  success: boolean;
  gasUsed: bigint;
  returnValue: Buffer;
  logs: any[];
  error?: Error;
}

export interface AccountState {
  nonce: bigint;
  balance: bigint;
  codeHash: Buffer;
  storageRoot: Buffer;
}

export interface StateSnapshot {
  id: string;
  timestamp: number;
  stateRoot: Buffer;
  accounts: Map<string, AccountState>;
}

export interface SimulationResult extends TransactionResult {
  stateChanges: {
    address: string;
    beforeState: AccountState;
    afterState: AccountState;
  }[];
  storageChanges: {
    address: string;
    key: Buffer;
    beforeValue: Buffer;
    afterValue: Buffer;
  }[];
}

export class EVMSandbox {
  private vm!: VM;
  private common: Common;
  private config: Required<EVMSandboxConfig>;
  private gasPredictor: GasPredictor;
  private snapshots: Map<string, StateSnapshot>;
  private currentSnapshotId: string | null;

  constructor(config: EVMSandboxConfig) {
    this.config = {
      chainId: config.chainId,
      hardfork: config.hardfork || 'london',
      stateRoot: config.stateRoot || Buffer.alloc(32),
      debug: config.debug || false
    };

    this.common = new Common({ chain: this.config.chainId, hardfork: this.config.hardfork });
    this.snapshots = new Map();
    this.currentSnapshotId = null;
    this.gasPredictor = new GasPredictor(this);

    if (this.config.debug) {
      this.setupDebugHooks();
    }
  }

  async initialize(): Promise<void> {
    const stateManager = new DefaultStateManager();
    this.vm = await VM.create({
      common: this.common,
      stateManager,
      hardfork: this.config.hardfork
    });
  }

  /**
   * 预测交易的 gas 消耗
   */
  async estimateGas(
    txData: string | Buffer | Transaction,
    contractAddress?: string | Address
  ): Promise<GasEstimationResult> {
    try {
      let tx: Transaction;
      
      if (typeof txData === 'string') {
        tx = Transaction.fromSerializedTx(toBuffer(txData), { common: this.common });
      } else if (Buffer.isBuffer(txData)) {
        tx = Transaction.fromSerializedTx(txData, { common: this.common });
      } else {
        tx = txData;
      }

      return await this.gasPredictor.predictGasUsage(tx, contractAddress);
    } catch (error) {
      throw new EVMError(`Failed to estimate gas: ${error.message}`);
    }
  }

  /**
   * 执行交易
   */
  async executeTx(
    txData: string | Buffer | Transaction
  ): Promise<TransactionResult> {
    try {
      let tx: Transaction;
      
      if (typeof txData === 'string') {
        tx = Transaction.fromSerializedTx(toBuffer(txData), { common: this.common });
      } else if (Buffer.isBuffer(txData)) {
        tx = Transaction.fromSerializedTx(txData, { common: this.common });
      } else {
        tx = txData;
      }

      const block = Block.fromBlockData({}, { common: this.common });
      const result = await this.vm.runTx({ tx, block });

      // 收集操作码统计
      const opcodeStats = this.collectOpcodeStats(result);

      // 更新 gas 预测器
      if (tx.to) {
        const methodId = tx.data.slice(0, 4).toString('hex');
        this.gasPredictor.updateContractProfile(
          tx.to,
          methodId,
          result.totalGasSpent,
          opcodeStats
        );
      }

      return {
        success: !result.execResult.exceptionError,
        gasUsed: result.totalGasSpent,
        returnValue: result.execResult.returnValue,
        logs: result.execResult.logs
      };
    } catch (error) {
      return {
        success: false,
        gasUsed: 0n,
        returnValue: Buffer.alloc(0),
        logs: [],
        error: error instanceof Error ? error : new EVMError('Unknown error')
      };
    }
  }

  /**
   * 获取账户状态
   */
  async getAccountState(address: string | Address): Promise<AccountState> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      const account = await this.vm.stateManager.getAccount(addr);

      return {
        nonce: account.nonce,
        balance: account.balance,
        codeHash: account.codeHash,
        storageRoot: account.storageRoot
      };
    } catch (error) {
      throw new EVMError(`Failed to get account state: ${error.message}`);
    }
  }

  /**
   * 设置账户状态
   */
  async setAccountState(
    address: string | Address,
    state: Partial<AccountState>
  ): Promise<void> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      const account = await this.vm.stateManager.getAccount(addr);

      if (state.nonce !== undefined) account.nonce = state.nonce;
      if (state.balance !== undefined) account.balance = state.balance;
      if (state.codeHash !== undefined) account.codeHash = state.codeHash;
      if (state.storageRoot !== undefined) account.storageRoot = state.storageRoot;

      await this.vm.stateManager.putAccount(addr, account);
    } catch (error) {
      throw new EVMError(`Failed to set account state: ${error.message}`);
    }
  }

  /**
   * 设置合约代码
   */
  async setCode(address: string | Address, code: Buffer): Promise<void> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      await this.vm.stateManager.putContractCode(addr, code);
    } catch (error) {
      throw new EVMError(`Failed to set contract code: ${error.message}`);
    }
  }

  /**
   * 获取存储值
   */
  async getStorageAt(
    address: string | Address,
    key: Buffer
  ): Promise<Buffer> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      return await this.vm.stateManager.getContractStorage(addr, key);
    } catch (error) {
      throw new EVMError(`Failed to get storage: ${error.message}`);
    }
  }

  /**
   * 设置存储值
   */
  async setStorageAt(
    address: string | Address,
    key: Buffer,
    value: Buffer
  ): Promise<void> {
    try {
      const addr = typeof address === 'string' ? Address.fromString(address) : address;
      await this.vm.stateManager.putContractStorage(addr, key, value);
    } catch (error) {
      throw new EVMError(`Failed to set storage: ${error.message}`);
    }
  }

  /**
   * 获取当前状态根
   */
  async getStateRoot(): Promise<Buffer> {
    try {
      return await this.vm.stateManager.getStateRoot();
    } catch (error) {
      throw new EVMError(`Failed to get state root: ${error.message}`);
    }
  }

  /**
   * 设置状态根
   */
  async setStateRoot(root: Buffer): Promise<void> {
    try {
      await this.vm.stateManager.setStateRoot(root);
    } catch (error) {
      throw new EVMError(`Failed to set state root: ${error.message}`);
    }
  }

  /**
   * 重置状态
   */
  async reset(): Promise<void> {
    try {
      await this.vm.stateManager.clearContractStorage();
      await this.setStateRoot(this.config.stateRoot);
    } catch (error) {
      throw new EVMError(`Failed to reset state: ${error.message}`);
    }
  }

  private setupDebugHooks(): void {
    this.vm.evm.events.on('step', (data: any) => {
      if (this.config.debug) {
        console.log('EVM Step:', {
          pc: data.pc,
          opcode: data.opcode.name,
          gasLeft: data.gasLeft.toString(),
          stack: data.stack.map((item: Buffer) => item.toString('hex')),
          depth: data.depth,
          address: data.address.toString()
        });
      }
    });
  }

  private collectOpcodeStats(result: any): GasUsageStats[] {
    const stats = new Map<string, GasUsageStats>();

    if (result.execResult && result.execResult.steps) {
      for (const step of result.execResult.steps) {
        const opcode = step.opcode.name;
        let stat = stats.get(opcode);

        if (!stat) {
          stat = {
            opcode,
            count: 0,
            totalGas: 0n,
            avgGas: 0n
          };
          stats.set(opcode, stat);
        }

        stat.count++;
        const gasUsed = step.gasUsed || 0n;
        stat.totalGas += gasUsed;
        stat.avgGas = stat.totalGas / BigInt(stat.count);
      }
    }

    return Array.from(stats.values());
  }

  /**
   * 创建当前状态的快照
   */
  async createSnapshot(id?: string): Promise<string> {
    try {
      const snapshotId = id || `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const stateRoot = await this.vm.stateManager.getStateRoot();
      
      // 获取所有已修改账户的状态
      const accounts = new Map();
      const touchedAddresses = await this.vm.stateManager.getTouchedAccounts();
      
      for (const address of touchedAddresses) {
        const state = await this.getAccountState(address);
        accounts.set(address.toString(), state);
      }

      const snapshot: StateSnapshot = {
        id: snapshotId,
        timestamp: Date.now(),
        stateRoot,
        accounts
      };

      this.snapshots.set(snapshotId, snapshot);
      this.currentSnapshotId = snapshotId;

      return snapshotId;
    } catch (error) {
      throw new EVMError(`Failed to create snapshot: ${error.message}`);
    }
  }

  /**
   * 恢复到指定的快照状态
   */
  async revertToSnapshot(id: string): Promise<void> {
    try {
      const snapshot = this.snapshots.get(id);
      if (!snapshot) {
        throw new EVMError(`Snapshot ${id} not found`);
      }

      // 恢复状态根
      await this.vm.stateManager.setStateRoot(snapshot.stateRoot);

      // 恢复账户状态
      for (const [address, state] of snapshot.accounts) {
        const addr = Address.fromString(address);
        await this.setAccountState(addr, state);
      }

      this.currentSnapshotId = id;
    } catch (error) {
      throw new EVMError(`Failed to revert to snapshot: ${error.message}`);
    }
  }

  /**
   * 模拟执行交易并返回详细结果
   */
  async simulateTx(
    txData: string | Buffer | Transaction,
    snapshotId?: string
  ): Promise<SimulationResult> {
    try {
      // 如果提供了快照ID,先恢复到该状态
      if (snapshotId) {
        await this.revertToSnapshot(snapshotId);
      }

      // 创建新快照用于回滚
      const tempSnapshotId = await this.createSnapshot();

      // 记录交易涉及的账户初始状态
      const tx = this.normalizeTx(txData);
      const addresses = new Set<string>();
      addresses.add(tx.getSenderAddress().toString());
      if (tx.to) addresses.add(tx.to.toString());

      const beforeStates = new Map();
      for (const addr of addresses) {
        beforeStates.set(addr, await this.getAccountState(addr));
      }

      // 执行交易
      const result = await this.executeTx(tx);

      // 收集状态变化
      const stateChanges = [];
      const storageChanges = [];

      for (const addr of addresses) {
        const afterState = await this.getAccountState(addr);
        const beforeState = beforeStates.get(addr);

        stateChanges.push({
          address: addr,
          beforeState,
          afterState
        });

        // 收集存储变化
        if (afterState.codeHash.length > 0) {
          const storage = await this.vm.stateManager.dumpStorage(Address.fromString(addr));
          for (const [key, value] of storage) {
            const beforeValue = await this.vm.stateManager.getContractStorage(
              Address.fromString(addr),
              toBuffer(key)
            );
            if (!beforeValue.equals(value)) {
              storageChanges.push({
                address: addr,
                key: toBuffer(key),
                beforeValue,
                afterValue: value
              });
            }
          }
        }
      }

      // 恢复到执行前的状态
      await this.revertToSnapshot(tempSnapshotId);

      return {
        ...result,
        stateChanges,
        storageChanges
      };
    } catch (error) {
      throw new EVMError(`Failed to simulate transaction: ${error.message}`);
    }
  }

  /**
   * 删除快照
   */
  deleteSnapshot(id: string): boolean {
    return this.snapshots.delete(id);
  }

  /**
   * 获取当前快照ID
   */
  getCurrentSnapshotId(): string | null {
    return this.currentSnapshotId;
  }

  private normalizeTx(txData: string | Buffer | Transaction): Transaction {
    if (typeof txData === 'string') {
      return Transaction.fromSerializedTx(toBuffer(txData), { common: this.common });
    } else if (Buffer.isBuffer(txData)) {
      return Transaction.fromSerializedTx(txData, { common: this.common });
    }
    return txData;
  }
} 