import { BaseChain } from "langchain/chains";
import { ChainValues } from "langchain/schema";
import { ChainQueryTool } from "../tools/chain-query";
import { TransactionProcessorTool } from "../tools/transaction-processor";
import { AccountManagerTool } from "../tools/account-manager";
import { ChainProtocol } from "@lumix/core";
import { DatabaseManager } from "@lumix/core";
import { logger } from "@lumix/core";

export interface CrossChainInput {
  sourceChain: ChainProtocol;
  targetChain: ChainProtocol;
  operation: "sync" | "transfer" | "bridge";
  data: {
    address?: string;
    token?: string;
    amount?: string;
    targetAddress?: string;
    bridgeContract?: string;
  };
  options?: {
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    confirmations?: number;
    timeout?: number;
  };
}

export interface CrossChainOutput {
  status: "success" | "failed";
  operation: {
    type: string;
    sourceChain: ChainProtocol;
    targetChain: ChainProtocol;
    sourceHash?: string;
    targetHash?: string;
    timestamp: number;
  };
  data: {
    from: string;
    to: string;
    value?: string;
    token?: string;
    bridge?: string;
  };
  state: {
    sourceStatus: "pending" | "confirmed" | "failed";
    targetStatus: "pending" | "confirmed" | "failed";
    confirmations: number;
    completionTime?: number;
  };
  fees: {
    sourceGas: string;
    targetGas: string;
    bridgeFee?: string;
    totalCost: string;
  };
  errors?: string[];
}

export class CrossChainOperationChain extends BaseChain {
  private queryTools: Map<ChainProtocol, ChainQueryTool>;
  private txProcessors: Map<ChainProtocol, TransactionProcessorTool>;
  private accountManagers: Map<ChainProtocol, AccountManagerTool>;
  private dbManager: DatabaseManager;

  constructor(
    queryTools: Map<ChainProtocol, ChainQueryTool>,
    txProcessors: Map<ChainProtocol, TransactionProcessorTool>,
    accountManagers: Map<ChainProtocol, AccountManagerTool>
  ) {
    super();
    this.queryTools = queryTools;
    this.txProcessors = txProcessors;
    this.accountManagers = accountManagers;
    this.dbManager = DatabaseManager.getInstance();
  }

  _chainType(): string {
    return "cross_chain_operation";
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    try {
      const input = values.input as CrossChainInput;
      const output: CrossChainOutput = {
        status: "failed",
        operation: {
          type: input.operation,
          sourceChain: input.sourceChain,
          targetChain: input.targetChain,
          timestamp: Date.now()
        },
        data: {
          from: input.data.address || "",
          to: input.data.targetAddress || "",
          value: input.data.amount,
          token: input.data.token,
          bridge: input.data.bridgeContract
        },
        state: {
          sourceStatus: "pending",
          targetStatus: "pending",
          confirmations: 0
        },
        fees: {
          sourceGas: "0",
          targetGas: "0",
          totalCost: "0"
        }
      };

      // 验证工具可用性
      this.validateChainTools(input.sourceChain, input.targetChain);

      // 根据操作类型执行相应的跨链操作
      switch (input.operation) {
        case "sync":
          await this.handleDataSync(input, output);
          break;
        case "transfer":
          await this.handleCrossChainTransfer(input, output);
          break;
        case "bridge":
          await this.handleTokenBridge(input, output);
          break;
        default:
          throw new Error(`Unsupported cross-chain operation: ${input.operation}`);
      }

      return { output };
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Cross Chain Operation Chain", `Operation failed: ${error.message}`);
      }
      throw error;
    }
  }

  private validateChainTools(sourceChain: ChainProtocol, targetChain: ChainProtocol): void {
    // 验证源链工具
    if (!this.queryTools.has(sourceChain)) {
      throw new Error(`Query tool not found for source chain: ${sourceChain}`);
    }
    if (!this.txProcessors.has(sourceChain)) {
      throw new Error(`Transaction processor not found for source chain: ${sourceChain}`);
    }
    if (!this.accountManagers.has(sourceChain)) {
      throw new Error(`Account manager not found for source chain: ${sourceChain}`);
    }

    // 验证目标链工具
    if (!this.queryTools.has(targetChain)) {
      throw new Error(`Query tool not found for target chain: ${targetChain}`);
    }
    if (!this.txProcessors.has(targetChain)) {
      throw new Error(`Transaction processor not found for target chain: ${targetChain}`);
    }
    if (!this.accountManagers.has(targetChain)) {
      throw new Error(`Account manager not found for target chain: ${targetChain}`);
    }
  }

  private async handleDataSync(
    input: CrossChainInput,
    output: CrossChainOutput
  ): Promise<void> {
    try {
      // 获取源链数据
      const sourceData = await this.getChainData(
        input.sourceChain,
        input.data.address
      );

      // 同步到目标链
      const syncResult = await this.syncToTargetChain(
        input.targetChain,
        sourceData,
        input.data.targetAddress
      );

      // 更新输出状态
      output.status = "success";
      output.state.sourceStatus = "confirmed";
      output.state.targetStatus = syncResult.status;
      output.state.confirmations = syncResult.confirmations;
      output.state.completionTime = Date.now();

      // 保存同步记录
      await this.saveSyncRecord(input, output);
    } catch (error) {
      if (error instanceof Error) {
        output.errors = [error.message];
        logger.error("Cross Chain Operation Chain", `Data sync failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async handleCrossChainTransfer(
    input: CrossChainInput,
    output: CrossChainOutput
  ): Promise<void> {
    try {
      // 验证转账参数
      this.validateTransferParams(input);

      // 执行源链转账
      const sourceResult = await this.executeSourceTransfer(input);
      output.operation.sourceHash = sourceResult.hash;
      output.state.sourceStatus = "confirmed";

      // 等待确认
      await this.waitForConfirmations(
        input.sourceChain,
        sourceResult.hash,
        input.options?.confirmations
      );

      // 执行目标链转账
      const targetResult = await this.executeTargetTransfer(input, sourceResult);
      output.operation.targetHash = targetResult.hash;
      output.state.targetStatus = "confirmed";

      // 计算费用
      output.fees = {
        sourceGas: sourceResult.gasUsed,
        targetGas: targetResult.gasUsed,
        totalCost: (BigInt(sourceResult.gasUsed) + BigInt(targetResult.gasUsed)).toString()
      };

      output.status = "success";
      output.state.completionTime = Date.now();

      // 保存转账记录
      await this.saveTransferRecord(input, output);
    } catch (error) {
      if (error instanceof Error) {
        output.errors = [error.message];
        logger.error("Cross Chain Operation Chain", `Transfer failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async handleTokenBridge(
    input: CrossChainInput,
    output: CrossChainOutput
  ): Promise<void> {
    try {
      // 验证桥接参数
      this.validateBridgeParams(input);

      // 批准代币使用
      const approvalResult = await this.approveTokenBridge(input);
      
      // 执行桥接操作
      const bridgeResult = await this.executeBridgeOperation(input, approvalResult);
      output.operation.sourceHash = bridgeResult.sourceHash;
      output.operation.targetHash = bridgeResult.targetHash;

      // 更新状态
      output.state.sourceStatus = "confirmed";
      output.state.targetStatus = bridgeResult.targetStatus;
      output.state.confirmations = bridgeResult.confirmations;
      output.state.completionTime = Date.now();

      // 计算费用
      output.fees = {
        sourceGas: bridgeResult.sourceGas,
        targetGas: bridgeResult.targetGas,
        bridgeFee: bridgeResult.bridgeFee,
        totalCost: bridgeResult.totalCost
      };

      output.status = "success";

      // 保存桥接记录
      await this.saveBridgeRecord(input, output);
    } catch (error) {
      if (error instanceof Error) {
        output.errors = [error.message];
        logger.error("Cross Chain Operation Chain", `Token bridge failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getChainData(
    chain: ChainProtocol,
    address: string
  ): Promise<any> {
    const queryTool = this.queryTools.get(chain);
    const result = await queryTool._call(JSON.stringify({
      action: "get-account",
      address
    }));
    return JSON.parse(result);
  }

  private async syncToTargetChain(
    chain: ChainProtocol,
    data: any,
    targetAddress: string
  ): Promise<{
    status: "confirmed" | "failed";
    confirmations: number;
  }> {
    // TODO: 实现数据同步逻辑
    return {
      status: "confirmed",
      confirmations: 0
    };
  }

  private validateTransferParams(input: CrossChainInput): void {
    if (!input.data.address) {
      throw new Error("Source address is required");
    }
    if (!input.data.targetAddress) {
      throw new Error("Target address is required");
    }
    if (!input.data.amount) {
      throw new Error("Transfer amount is required");
    }
  }

  private validateBridgeParams(input: CrossChainInput): void {
    if (!input.data.address) {
      throw new Error("Source address is required");
    }
    if (!input.data.targetAddress) {
      throw new Error("Target address is required");
    }
    if (!input.data.amount) {
      throw new Error("Bridge amount is required");
    }
    if (!input.data.token) {
      throw new Error("Token address is required");
    }
    if (!input.data.bridgeContract) {
      throw new Error("Bridge contract address is required");
    }
  }

  private async executeSourceTransfer(
    input: CrossChainInput
  ): Promise<{
    hash: string;
    gasUsed: string;
  }> {
    const txProcessor = this.txProcessors.get(input.sourceChain);
    const result = await txProcessor._call(JSON.stringify({
      action: "send-transaction",
      transaction: {
        from: input.data.address,
        to: input.data.targetAddress,
        value: input.data.amount,
        gasLimit: input.options?.gasLimit,
        maxFeePerGas: input.options?.maxFeePerGas,
        maxPriorityFeePerGas: input.options?.maxPriorityFeePerGas
      }
    }));
    return JSON.parse(result);
  }

  private async executeTargetTransfer(
    input: CrossChainInput,
    sourceResult: any
  ): Promise<{
    hash: string;
    gasUsed: string;
  }> {
    const txProcessor = this.txProcessors.get(input.targetChain);
    const result = await txProcessor._call(JSON.stringify({
      action: "send-transaction",
      transaction: {
        from: input.data.address,
        to: input.data.targetAddress,
        value: input.data.amount,
        gasLimit: input.options?.gasLimit,
        maxFeePerGas: input.options?.maxFeePerGas,
        maxPriorityFeePerGas: input.options?.maxPriorityFeePerGas
      }
    }));
    return JSON.parse(result);
  }

  private async approveTokenBridge(
    input: CrossChainInput
  ): Promise<{
    hash: string;
    gasUsed: string;
  }> {
    const txProcessor = this.txProcessors.get(input.sourceChain);
    const result = await txProcessor._call(JSON.stringify({
      action: "send-transaction",
      transaction: {
        from: input.data.address,
        to: input.data.token,
        data: `approve(${input.data.bridgeContract},${input.data.amount})`,
        gasLimit: input.options?.gasLimit,
        maxFeePerGas: input.options?.maxFeePerGas,
        maxPriorityFeePerGas: input.options?.maxPriorityFeePerGas
      }
    }));
    return JSON.parse(result);
  }

  private async executeBridgeOperation(
    input: CrossChainInput,
    approvalResult: any
  ): Promise<{
    sourceHash: string;
    targetHash: string;
    sourceGas: string;
    targetGas: string;
    bridgeFee: string;
    totalCost: string;
    targetStatus: "pending" | "confirmed" | "failed";
    confirmations: number;
  }> {
    // TODO: 实现桥接操作逻辑
    return {
      sourceHash: "",
      targetHash: "",
      sourceGas: "0",
      targetGas: "0",
      bridgeFee: "0",
      totalCost: "0",
      targetStatus: "confirmed",
      confirmations: 0
    };
  }

  private async waitForConfirmations(
    chain: ChainProtocol,
    hash: string,
    confirmations: number = 12
  ): Promise<void> {
    const txProcessor = this.txProcessors.get(chain);
    await txProcessor._call(JSON.stringify({
      action: "wait-for-transaction",
      hash,
      confirmations
    }));
  }

  private async saveSyncRecord(
    input: CrossChainInput,
    output: CrossChainOutput
  ): Promise<void> {
    const db = this.dbManager.getAdapter();
    await db.saveTransaction({
      id: `${input.sourceChain}-${input.targetChain}-${Date.now()}`,
      type: "sync",
      sourceChain: input.sourceChain,
      targetChain: input.targetChain,
      status: output.status,
      data: output.data,
      timestamp: new Date()
    });
  }

  private async saveTransferRecord(
    input: CrossChainInput,
    output: CrossChainOutput
  ): Promise<void> {
    const db = this.dbManager.getAdapter();
    await db.saveTransaction({
      id: `${output.operation.sourceHash}-${output.operation.targetHash}`,
      type: "transfer",
      sourceChain: input.sourceChain,
      targetChain: input.targetChain,
      sourceHash: output.operation.sourceHash,
      targetHash: output.operation.targetHash,
      status: output.status,
      data: output.data,
      fees: output.fees,
      timestamp: new Date()
    });
  }

  private async saveBridgeRecord(
    input: CrossChainInput,
    output: CrossChainOutput
  ): Promise<void> {
    const db = this.dbManager.getAdapter();
    await db.saveTransaction({
      id: `${output.operation.sourceHash}-${output.operation.targetHash}`,
      type: "bridge",
      sourceChain: input.sourceChain,
      targetChain: input.targetChain,
      sourceHash: output.operation.sourceHash,
      targetHash: output.operation.targetHash,
      status: output.status,
      data: output.data,
      fees: output.fees,
      timestamp: new Date()
    });
  }
} 