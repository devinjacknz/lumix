import { ConversationManager } from "./conversation-manager";
import { logger } from "@lumix/core";

export interface InteractionConfig {
  maxConcurrent: number;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  multiModal: boolean;
  supportedActions: string[];
}

export interface InteractionEvent {
  type: string;
  data: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface InteractionContext {
  conversationId: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface InteractionResult {
  success: boolean;
  data?: any;
  error?: string;
  events?: InteractionEvent[];
}

export class InteractionManager {
  private config: InteractionConfig;
  private conversationManager: ConversationManager;
  private activeInteractions: Map<string, {
    context: InteractionContext;
    startTime: number;
    events: InteractionEvent[];
  }>;
  private handlers: Map<string, (
    data: any,
    context: InteractionContext
  ) => Promise<InteractionResult>>;

  constructor(
    conversationManager: ConversationManager,
    config: InteractionConfig
  ) {
    this.config = {
      maxConcurrent: 10,
      timeout: 30000, // 30秒
      retryAttempts: 3,
      retryDelay: 1000,
      multiModal: false,
      supportedActions: [],
      ...config
    };
    this.conversationManager = conversationManager;
    this.activeInteractions = new Map();
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // 文本消息处理
    this.handlers.set("text", async (data, context) => {
      try {
        const message = await this.conversationManager.addMessage(
          context.conversationId,
          {
            role: "user",
            content: data.text
          }
        );

        return {
          success: true,
          data: message
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
    });

    // 图片消息处理
    this.handlers.set("image", async (data, context) => {
      if (!this.config.multiModal) {
        return {
          success: false,
          error: "Multimodal interactions not supported"
        };
      }

      try {
        const message = await this.conversationManager.addMessage(
          context.conversationId,
          {
            role: "user",
            content: {
              type: "image",
              data: data.image
            }
          }
        );

        return {
          success: true,
          data: message
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
    });

    // 命令处理
    this.handlers.set("command", async (data, context) => {
      try {
        // 验证命令
        if (!this.config.supportedActions.includes(data.command)) {
          return {
            success: false,
            error: `Unsupported command: ${data.command}`
          };
        }

        // 执行命令
        const result = await this.executeCommand(data.command, data.params, context);

        return {
          success: true,
          data: result
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
    });
  }

  async handleInteraction(
    type: string,
    data: any,
    context: InteractionContext
  ): Promise<InteractionResult> {
    try {
      // 检查并发限制
      if (this.activeInteractions.size >= this.config.maxConcurrent) {
        throw new Error("Too many concurrent interactions");
      }

      // 检查处理器
      const handler = this.handlers.get(type);
      if (!handler) {
        throw new Error(`No handler found for interaction type: ${type}`);
      }

      // 创建交互记录
      const interactionId = this.generateId();
      this.activeInteractions.set(interactionId, {
        context,
        startTime: Date.now(),
        events: []
      });

      // 设置超时
      const timeoutPromise = new Promise<InteractionResult>((_, reject) =>
        setTimeout(() => reject(new Error("Interaction timeout")), this.config.timeout)
      );

      // 处理交互
      const handlePromise = this.handleWithRetry(handler, data, context);

      // 等待结果
      const result = await Promise.race([handlePromise, timeoutPromise]);

      // 清理
      this.activeInteractions.delete(interactionId);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          "Interaction Manager",
          `Failed to handle interaction: ${error.message}`
        );
        return {
          success: false,
          error: error.message
        };
      }
      throw error;
    }
  }

  private async handleWithRetry(
    handler: (data: any, context: InteractionContext) => Promise<InteractionResult>,
    data: any,
    context: InteractionContext
  ): Promise<InteractionResult> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await handler(data, context);
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
          if (attempt < this.config.retryAttempts) {
            await new Promise(resolve =>
              setTimeout(resolve, this.config.retryDelay * attempt)
            );
          }
        }
      }
    }

    throw lastError;
  }

  private async executeCommand(
    command: string,
    params: any,
    context: InteractionContext
  ): Promise<any> {
    // TODO: 实现命令执行逻辑
    return null;
  }

  async registerHandler(
    type: string,
    handler: (data: any, context: InteractionContext) => Promise<InteractionResult>
  ): Promise<void> {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for type: ${type}`);
    }
    this.handlers.set(type, handler);
  }

  async unregisterHandler(type: string): Promise<void> {
    this.handlers.delete(type);
  }

  async addEvent(
    interactionId: string,
    event: Omit<InteractionEvent, "timestamp">
  ): Promise<void> {
    const interaction = this.activeInteractions.get(interactionId);
    if (!interaction) {
      throw new Error(`Interaction not found: ${interactionId}`);
    }

    interaction.events.push({
      ...event,
      timestamp: Date.now()
    });
  }

  async getEvents(interactionId: string): Promise<InteractionEvent[]> {
    const interaction = this.activeInteractions.get(interactionId);
    if (!interaction) {
      throw new Error(`Interaction not found: ${interactionId}`);
    }

    return [...interaction.events];
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  public getActiveInteractionCount(): number {
    return this.activeInteractions.size;
  }

  public getSupportedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  public updateConfig(config: Partial<InteractionConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
} 