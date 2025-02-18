import { Tool } from "langchain/tools";
import { ChainProtocol } from "@lumix/core";
import { logger } from "@lumix/core";

export interface ErrorHandlerConfig {
  maxRetries: number;
  retryDelay: number;
  errorThreshold: number;
  recoveryStrategies: {
    [key: string]: {
      action: string;
      params?: any;
    };
  };
}

export interface ErrorContext {
  chainId?: string;
  protocol?: ChainProtocol;
  operation?: string;
  timestamp: number;
  error: Error | string;
  stack?: string;
  data?: any;
}

export interface ErrorStats {
  total: number;
  byChain: {
    [chainId: string]: number;
  };
  byType: {
    [errorType: string]: number;
  };
  recoveryRate: number;
}

export class ErrorHandlerTool extends Tool {
  private config: ErrorHandlerConfig;
  private errors: Map<string, ErrorContext[]>;
  private recoveryAttempts: Map<string, number>;
  private stats: ErrorStats;

  constructor(config: ErrorHandlerConfig) {
    super();
    this.config = config;
    this.errors = new Map();
    this.recoveryAttempts = new Map();
    this.stats = {
      total: 0,
      byChain: {},
      byType: {},
      recoveryRate: 0
    };
  }

  name = "error_handler";
  description = "处理跨链操作中的错误和异常";

  async _call(input: string): Promise<string> {
    try {
      const request = JSON.parse(input);
      
      switch (request.action) {
        case "handle-error":
          return JSON.stringify(
            await this.handleError(request.context)
          );
        case "get-error-stats":
          return JSON.stringify(
            await this.getErrorStats(request.chainId)
          );
        case "clear-errors":
          await this.clearErrors(request.key);
          return "success";
        case "retry-operation":
          return JSON.stringify(
            await this.retryOperation(request.operationId, request.context)
          );
        default:
          throw new Error(`Unknown action: ${request.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Error Handler Tool", `Operation failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async handleError(context: ErrorContext): Promise<{
    handled: boolean;
    action?: string;
    retryCount?: number;
    error?: string;
  }> {
    try {
      // 记录错误
      this.recordError(context);

      // 获取错误类型
      const errorType = this.classifyError(context.error);

      // 检查是否超过重试次数
      const operationId = this.getOperationId(context);
      const retryCount = this.recoveryAttempts.get(operationId) || 0;
      
      if (retryCount >= this.config.maxRetries) {
        return {
          handled: false,
          error: "Max retry attempts exceeded",
          retryCount
        };
      }

      // 获取恢复策略
      const strategy = this.config.recoveryStrategies[errorType];
      if (!strategy) {
        return {
          handled: false,
          error: "No recovery strategy found",
          retryCount
        };
      }

      // 执行恢复操作
      await this.executeRecoveryStrategy(strategy, context);
      
      // 更新重试计数
      this.recoveryAttempts.set(operationId, retryCount + 1);

      return {
        handled: true,
        action: strategy.action,
        retryCount: retryCount + 1
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Error Handler Tool",
          `Error handling failed: ${error.message}`
        );
        return {
          handled: false,
          error: error.message,
          retryCount: this.recoveryAttempts.get(this.getOperationId(context)) || 0
        };
      }
      throw error;
    }
  }

  private recordError(context: ErrorContext): void {
    const key = context.chainId || "unknown";
    const errors = this.errors.get(key) || [];
    errors.push({
      ...context,
      timestamp: Date.now()
    });
    this.errors.set(key, errors);

    // 更新统计信息
    this.stats.total++;
    this.stats.byChain[key] = (this.stats.byChain[key] || 0) + 1;

    const errorType = this.classifyError(context.error);
    this.stats.byType[errorType] = (this.stats.byType[errorType] || 0) + 1;
  }

  private classifyError(error: Error | string): string {
    const errorMessage = error instanceof Error ? error.message : error;

    // 网络错误
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("connection")
    ) {
      return "network";
    }

    // Gas 错误
    if (
      errorMessage.includes("gas") ||
      errorMessage.includes("fee") ||
      errorMessage.includes("insufficient funds")
    ) {
      return "gas";
    }

    // 合约错误
    if (
      errorMessage.includes("contract") ||
      errorMessage.includes("execution") ||
      errorMessage.includes("revert")
    ) {
      return "contract";
    }

    // 同步错误
    if (
      errorMessage.includes("sync") ||
      errorMessage.includes("state") ||
      errorMessage.includes("nonce")
    ) {
      return "sync";
    }

    // 权限错误
    if (
      errorMessage.includes("permission") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("access")
    ) {
      return "permission";
    }

    return "unknown";
  }

  private getOperationId(context: ErrorContext): string {
    return `${context.chainId}_${context.operation}_${context.timestamp}`;
  }

  private async executeRecoveryStrategy(
    strategy: ErrorHandlerConfig["recoveryStrategies"][string],
    context: ErrorContext
  ): Promise<void> {
    switch (strategy.action) {
      case "retry":
        await this.retryOperation(
          this.getOperationId(context),
          context
        );
        break;
      case "increase_gas":
        // 增加 gas 限制和价格
        context.data = {
          ...context.data,
          gasLimit: BigInt(context.data?.gasLimit || "0") * BigInt(120) / BigInt(100),
          maxFeePerGas: BigInt(context.data?.maxFeePerGas || "0") * BigInt(120) / BigInt(100)
        };
        await this.retryOperation(
          this.getOperationId(context),
          context
        );
        break;
      case "wait_and_retry":
        // 等待一段时间后重试
        await new Promise(resolve => 
          setTimeout(resolve, strategy.params?.delay || this.config.retryDelay)
        );
        await this.retryOperation(
          this.getOperationId(context),
          context
        );
        break;
      case "reset_nonce":
        // 重置 nonce 并重试
        context.data = {
          ...context.data,
          nonce: null
        };
        await this.retryOperation(
          this.getOperationId(context),
          context
        );
        break;
      default:
        throw new Error(`Unknown recovery strategy: ${strategy.action}`);
    }
  }

  private async retryOperation(
    operationId: string,
    context: ErrorContext
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // TODO: 实现重试逻辑
      return {
        success: true
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message
        };
      }
      throw error;
    }
  }

  private async getErrorStats(chainId?: string): Promise<ErrorStats> {
    if (chainId) {
      const chainErrors = this.errors.get(chainId) || [];
      const recoveredCount = chainErrors.filter(error =>
        this.recoveryAttempts.has(this.getOperationId(error))
      ).length;

      return {
        total: chainErrors.length,
        byChain: {
          [chainId]: chainErrors.length
        },
        byType: this.getErrorTypeStats(chainErrors),
        recoveryRate: chainErrors.length > 0
          ? recoveredCount / chainErrors.length
          : 0
      };
    }

    return this.stats;
  }

  private getErrorTypeStats(errors: ErrorContext[]): { [type: string]: number } {
    const stats: { [type: string]: number } = {};
    
    errors.forEach(error => {
      const type = this.classifyError(error.error);
      stats[type] = (stats[type] || 0) + 1;
    });

    return stats;
  }

  private async clearErrors(key?: string): Promise<void> {
    if (key) {
      this.errors.delete(key);
      this.recoveryAttempts.clear();
    } else {
      this.errors.clear();
      this.recoveryAttempts.clear();
    }

    // 重置统计信息
    this.stats = {
      total: 0,
      byChain: {},
      byType: {},
      recoveryRate: 0
    };
  }

  public async getRecoveryAttempts(operationId: string): Promise<number> {
    return this.recoveryAttempts.get(operationId) || 0;
  }

  public async hasReachedThreshold(chainId: string): Promise<boolean> {
    const errors = this.errors.get(chainId) || [];
    return errors.length >= this.config.errorThreshold;
  }
} 