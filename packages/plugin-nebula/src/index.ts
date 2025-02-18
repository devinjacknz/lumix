import { ThirdwebSDK } from '@thirdweb-dev/sdk';
import { Plugin, PluginManager, DialogueContext, KnowledgeBase } from '@lumix/core';
import {
  NebulaConfig,
  NebulaDeploymentConfig,
  NebulaQueryOptions,
  NebulaChatOptions,
  NebulaExecuteOptions,
  NebulaMessage,
  NebulaSystemIntegration
} from './types';

export class NebulaPlugin implements Plugin {
  private sdk: ThirdwebSDK;
  private config: NebulaConfig;
  private sessionId?: string;
  private systemIntegration: NebulaSystemIntegration = {};
  private messageHistory: NebulaMessage[] = [];

  constructor(config: NebulaConfig) {
    this.config = config;
    this.sdk = new ThirdwebSDK(config.chain || config.chainId, {
      secretKey: config.privateKey,
      ...(config.rpcUrl ? { rpc: { [config.chainId]: config.rpcUrl } } : {}),
    });
  }

  async initialize(manager: PluginManager): Promise<void> {
    // 系统集成初始化
    this.systemIntegration = {
      dialogueManager: manager.getDialogueManager(),
      knowledgeBase: manager.getKnowledgeBase(),
      eventEmitter: manager.getEventEmitter()
    };

    // 创建新会话
    await this.createSession();

    // 如果有系统提示词，添加到消息历史
    if (this.config.systemPrompt) {
      this.messageHistory.push({
        role: 'system',
        content: this.config.systemPrompt
      });
    }

    // 注册事件监听器
    this.registerEventListeners();
  }

  private registerEventListeners() {
    const { eventEmitter } = this.systemIntegration;
    if (eventEmitter) {
      // 监听区块链相关事件
      eventEmitter.on('blockchain:transaction', this.handleTransaction.bind(this));
      eventEmitter.on('blockchain:block', this.handleNewBlock.bind(this));
      eventEmitter.on('dialogue:message', this.handleDialogueMessage.bind(this));
    }
  }

  private async handleTransaction(transaction: any) {
    // 处理交易事件
    const message: NebulaMessage = {
      role: 'system',
      content: `检测到新交易: ${transaction.hash}`,
      metadata: {
        chainId: this.config.chainId,
        timestamp: Date.now()
      }
    };
    this.messageHistory.push(message);
  }

  private async handleNewBlock(block: any) {
    // 处理新区块事件
    // 可以更新相关状态或触发其他操作
  }

  private async handleDialogueMessage(message: DialogueContext) {
    // 处理对话消息
    // 可以集成到 Nebula 的上下文中
  }

  async chat(options: NebulaChatOptions) {
    if (!this.sessionId) {
      await this.createSession();
    }

    try {
      // 合并对话上下文
      const messages = [
        ...this.messageHistory,
        ...options.messages
      ];

      // 合并上下文过滤器
      const contextFilter = {
        ...this.config.defaultContextFilter,
        ...options.contextFilter
      };

      const response = await fetch('https://api.nebula.thirdweb.com/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.privateKey}`
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          messages,
          contextFilter
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get chat response');
      }

      const result = await response.json();

      // 更新消息历史
      if (result.message) {
        this.messageHistory.push(result.message);
      }

      // 同步到对话管理器
      if (this.systemIntegration.dialogueManager && options.dialogueContext) {
        await this.systemIntegration.dialogueManager.updateContext(
          options.dialogueContext.id,
          { lastResponse: result }
        );
      }

      return result;
    } catch (error) {
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  async execute(options: NebulaExecuteOptions) {
    if (!this.sessionId) {
      await this.createSession();
    }

    try {
      const messages = options.message 
        ? [{ role: 'user', content: options.message }] 
        : options.messages;

      // 准备交易参数
      const transactionParams = {
        gasLimit: options.gasLimit,
        maxFeePerGas: options.maxFeePerGas
      };

      const response = await fetch('https://api.nebula.thirdweb.com/v1/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.privateKey}`
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          messages,
          contextFilter: options.contextFilter,
          account: this.config.account,
          transactionParams,
          autoApprove: options.autoApprove
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute action');
      }

      const result = await response.json();

      // 发送交易事件
      if (this.systemIntegration.eventEmitter) {
        this.systemIntegration.eventEmitter.emit('nebula:transaction', result);
      }

      // 更新知识库
      if (this.systemIntegration.knowledgeBase) {
        await this.systemIntegration.knowledgeBase.addEntry({
          type: 'transaction',
          data: result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      throw new Error(`Execution failed: ${error.message}`);
    }
  }

  async createDeployment(config: NebulaDeploymentConfig) {
    try {
      const deployment = await this.sdk.deployer.deployNFTCollection({
        name: config.name,
        description: config.description || '',
        image: config.image,
        external_link: config.externalLink,
        primary_sale_recipient: config.deployerAddress,
      });

      return deployment;
    } catch (error) {
      throw new Error(`Failed to create Nebula deployment: ${error.message}`);
    }
  }

  async getDeployments(options?: NebulaQueryOptions) {
    try {
      const deployments = await this.sdk.getDeployments(
        options?.limit,
        options?.offset,
        options?.orderBy
      );
      return deployments;
    } catch (error) {
      throw new Error(`Failed to fetch deployments: ${error.message}`);
    }
  }

  async getDeploymentById(deploymentId: string) {
    try {
      const deployment = await this.sdk.getDeployment(deploymentId);
      return deployment;
    } catch (error) {
      throw new Error(`Failed to fetch deployment: ${error.message}`);
    }
  }

  // Helper method to clear the current session
  async clearSession() {
    if (this.sessionId) {
      try {
        await fetch(`https://api.nebula.thirdweb.com/v1/sessions/${this.sessionId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.privateKey}`
          }
        });
        this.sessionId = undefined;
        this.messageHistory = [];

        // 清理系统相关状态
        if (this.systemIntegration.dialogueManager) {
          // 可以在这里清理相关的对话上下文
        }
      } catch (error) {
        throw new Error(`Failed to clear session: ${error.message}`);
      }
    }
  }

  // 新增：获取系统状态
  async getSystemStatus() {
    return {
      sessionActive: !!this.sessionId,
      messageCount: this.messageHistory.length,
      currentChain: this.config.chain || this.config.chainId,
      systemIntegration: {
        hasDialogueManager: !!this.systemIntegration.dialogueManager,
        hasKnowledgeBase: !!this.systemIntegration.knowledgeBase,
        hasEventEmitter: !!this.systemIntegration.eventEmitter
      }
    };
  }
}

// Export types
export * from './types'; 