import { Tool } from "langchain/tools";
import { ChainProtocol } from "@lumix/core";
import { logger } from "@lumix/core";

export interface StateManagerConfig {
  cacheEnabled: boolean;
  cacheTTL: number;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface ChainState {
  chainId: string;
  protocol: ChainProtocol;
  blockNumber: number;
  timestamp: number;
  syncStatus: "syncing" | "synced" | "error";
  lastSync: number;
  pendingTxs: number;
  errors: string[];
}

export interface CrossChainState {
  sourceChain: ChainState;
  targetChain: ChainState;
  operation: {
    type: string;
    status: "pending" | "processing" | "completed" | "failed";
    startTime: number;
    endTime?: number;
    sourceHash?: string;
    targetHash?: string;
    error?: string;
  };
  data: {
    [key: string]: any;
  };
}

export class StateManagerTool extends Tool {
  private config: StateManagerConfig;
  private chainStates: Map<string, ChainState>;
  private crossChainStates: Map<string, CrossChainState>;
  private stateCache: Map<string, any>;
  private lastCleanup: number;

  constructor(config: StateManagerConfig) {
    super();
    this.config = config;
    this.chainStates = new Map();
    this.crossChainStates = new Map();
    this.stateCache = new Map();
    this.lastCleanup = Date.now();
  }

  name = "state_manager";
  description = "管理跨链操作的状态和数据同步";

  async _call(input: string): Promise<string> {
    try {
      const request = JSON.parse(input);
      
      switch (request.action) {
        case "get-chain-state":
          return JSON.stringify(
            await this.getChainState(request.chainId)
          );
        case "update-chain-state":
          await this.updateChainState(
            request.chainId,
            request.state
          );
          return "success";
        case "get-cross-chain-state":
          return JSON.stringify(
            await this.getCrossChainState(
              request.sourceChain,
              request.targetChain,
              request.operationId
            )
          );
        case "update-cross-chain-state":
          await this.updateCrossChainState(
            request.sourceChain,
            request.targetChain,
            request.operationId,
            request.state
          );
          return "success";
        case "clear-state":
          await this.clearState(request.key);
          return "success";
        case "cleanup":
          await this.cleanup();
          return "success";
        default:
          throw new Error(`Unknown action: ${request.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("State Manager Tool", `Operation failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getChainState(chainId: string): Promise<ChainState | null> {
    // 检查缓存
    if (this.config.cacheEnabled) {
      const cacheKey = `chain_state_${chainId}`;
      const cached = this.stateCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    const state = this.chainStates.get(chainId);
    if (!state) return null;

    // 更新缓存
    if (this.config.cacheEnabled) {
      const cacheKey = `chain_state_${chainId}`;
      this.stateCache.set(cacheKey, {
        data: state,
        timestamp: Date.now()
      });
    }

    return state;
  }

  private async updateChainState(
    chainId: string,
    newState: Partial<ChainState>
  ): Promise<void> {
    const currentState = await this.getChainState(chainId) || {
      chainId,
      protocol: ChainProtocol.EVM,
      blockNumber: 0,
      timestamp: Date.now(),
      syncStatus: "syncing",
      lastSync: 0,
      pendingTxs: 0,
      errors: []
    };

    // 更新状态
    const updatedState = {
      ...currentState,
      ...newState,
      timestamp: Date.now()
    };

    this.chainStates.set(chainId, updatedState);

    // 清除缓存
    if (this.config.cacheEnabled) {
      const cacheKey = `chain_state_${chainId}`;
      this.stateCache.delete(cacheKey);
    }

    // 记录错误
    if (newState.errors?.length) {
      logger.error(
        "State Manager Tool",
        `Chain state errors for ${chainId}: ${newState.errors.join(", ")}`
      );
    }
  }

  private async getCrossChainState(
    sourceChain: string,
    targetChain: string,
    operationId: string
  ): Promise<CrossChainState | null> {
    const stateKey = `${sourceChain}_${targetChain}_${operationId}`;

    // 检查缓存
    if (this.config.cacheEnabled) {
      const cacheKey = `cross_chain_state_${stateKey}`;
      const cached = this.stateCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }

    const state = this.crossChainStates.get(stateKey);
    if (!state) return null;

    // 更新缓存
    if (this.config.cacheEnabled) {
      const cacheKey = `cross_chain_state_${stateKey}`;
      this.stateCache.set(cacheKey, {
        data: state,
        timestamp: Date.now()
      });
    }

    return state;
  }

  private async updateCrossChainState(
    sourceChain: string,
    targetChain: string,
    operationId: string,
    newState: Partial<CrossChainState>
  ): Promise<void> {
    const stateKey = `${sourceChain}_${targetChain}_${operationId}`;
    const currentState = await this.getCrossChainState(
      sourceChain,
      targetChain,
      operationId
    );

    if (!currentState) {
      // 创建新状态
      const sourceChainState = await this.getChainState(sourceChain);
      const targetChainState = await this.getChainState(targetChain);

      if (!sourceChainState || !targetChainState) {
        throw new Error("Chain states not found");
      }

      const initialState: CrossChainState = {
        sourceChain: sourceChainState,
        targetChain: targetChainState,
        operation: {
          type: newState.operation?.type || "unknown",
          status: "pending",
          startTime: Date.now()
        },
        data: {}
      };

      this.crossChainStates.set(stateKey, {
        ...initialState,
        ...newState
      });
    } else {
      // 更新现有状态
      const updatedState = {
        ...currentState,
        ...newState,
        operation: {
          ...currentState.operation,
          ...newState.operation
        },
        data: {
          ...currentState.data,
          ...newState.data
        }
      };

      this.crossChainStates.set(stateKey, updatedState);
    }

    // 清除缓存
    if (this.config.cacheEnabled) {
      const cacheKey = `cross_chain_state_${stateKey}`;
      this.stateCache.delete(cacheKey);
    }

    // 记录错误
    if (newState.operation?.error) {
      logger.error(
        "State Manager Tool",
        `Cross-chain operation error: ${newState.operation.error}`
      );
    }
  }

  private async clearState(key: string): Promise<void> {
    // 清除链状态
    if (key.startsWith("chain_")) {
      const chainId = key.replace("chain_", "");
      this.chainStates.delete(chainId);
      if (this.config.cacheEnabled) {
        this.stateCache.delete(`chain_state_${chainId}`);
      }
    }
    // 清除跨链状态
    else if (key.startsWith("cross_chain_")) {
      this.crossChainStates.delete(key);
      if (this.config.cacheEnabled) {
        this.stateCache.delete(`cross_chain_state_${key}`);
      }
    }
    // 清除所有状态
    else if (key === "all") {
      this.chainStates.clear();
      this.crossChainStates.clear();
      if (this.config.cacheEnabled) {
        this.stateCache.clear();
      }
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    
    // 每小时最多清理一次
    if (now - this.lastCleanup < 60 * 60 * 1000) {
      return;
    }

    // 清理过期的缓存
    if (this.config.cacheEnabled) {
      for (const [key, value] of this.stateCache.entries()) {
        if (now - value.timestamp > this.config.cacheTTL) {
          this.stateCache.delete(key);
        }
      }
    }

    // 清理完成或失败的跨链操作状态
    for (const [key, state] of this.crossChainStates.entries()) {
      if (
        state.operation.status === "completed" ||
        state.operation.status === "failed"
      ) {
        const age = now - (state.operation.endTime || state.operation.startTime);
        if (age > 24 * 60 * 60 * 1000) { // 24小时后清理
          this.crossChainStates.delete(key);
        }
      }
    }

    this.lastCleanup = now;
  }

  public async getStateCount(): Promise<{
    chains: number;
    crossChain: number;
    cache: number;
  }> {
    return {
      chains: this.chainStates.size,
      crossChain: this.crossChainStates.size,
      cache: this.stateCache.size
    };
  }

  public async getErrorStats(): Promise<{
    chainErrors: number;
    operationErrors: number;
  }> {
    let chainErrors = 0;
    let operationErrors = 0;

    // 统计链错误
    for (const state of this.chainStates.values()) {
      chainErrors += state.errors.length;
    }

    // 统计操作错误
    for (const state of this.crossChainStates.values()) {
      if (state.operation.error) {
        operationErrors++;
      }
    }

    return {
      chainErrors,
      operationErrors
    };
  }
} 