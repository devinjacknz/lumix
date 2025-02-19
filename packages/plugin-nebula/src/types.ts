import { Chain } from '@thirdweb-dev/chains';
import { DialogueContext, DialogueMessage } from '@lumix/core';

export interface NebulaConfig {
  chainId: number;
  chain?: Chain;
  rpcUrl?: string;
  privateKey?: string;
  account?: any; // Account instance for transactions
  systemPrompt?: string;    // 系统提示词
  defaultContextFilter?: NebulaContextFilter; // 默认上下文过滤器
}

export interface NebulaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    chainId?: number;
    protocol?: string;
    contractAddress?: string;
    timestamp?: number;
  };
}

export interface NebulaContextFilter {
  chains?: Chain[];
  protocols?: string[];
  contracts?: string[];
  timeRange?: {
    start?: number;
    end?: number;
  };
}

export interface NebulaChatOptions {
  messages: NebulaMessage[];
  contextFilter?: NebulaContextFilter;
  dialogueContext?: DialogueContext; // Lumix 对话上下文
}

export interface NebulaExecuteOptions extends NebulaChatOptions {
  message?: string;
  autoApprove?: boolean;   // 是否自动批准交易
  gasLimit?: number;       // Gas 限制
  maxFeePerGas?: string;   // 最大 gas 费用
}

export interface NebulaDeploymentConfig {
  name: string;
  description?: string;
  image?: string;
  externalLink?: string;
  deployerAddress: string;
  metadata?: Record<string, any>;
}

export interface NebulaQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
  filter?: {
    chain?: Chain;
    protocol?: string;
    timeRange?: {
      start: number;
      end: number;
    };
  };
}

// 系统集成接口
export interface NebulaSystemIntegration {
  dialogueManager?: any;   // Lumix 对话管理器
  knowledgeBase?: any;     // 知识库集成
  eventEmitter?: any;      // 事件系统
} 