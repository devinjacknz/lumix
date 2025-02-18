import { AgentExecutor, initializeAgentExecutorWithOptions } from "langchain/agents";
import { BaseMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { AgentConfig, AgentOptions, AgentError } from "@lumix/core";
import { BaseModelAdapter, createModelAdapter } from "@lumix/models";

export class SolanaAgent {
  private executor: AgentExecutor | null = null;
  private model: BaseModelAdapter;
  private tools: StructuredTool[] = [];
  private systemPrompt: string;

  constructor(options: AgentOptions) {
    this.model = createModelAdapter(options.config);
    this.tools = options.tools || [];
    this.systemPrompt = options.systemPrompt || this.getDefaultSystemPrompt();
  }

  private getDefaultSystemPrompt(): string {
    return `你是一个专业的Solana DeFi助手，可以帮助用户：
1. 查询代币余额
2. 执行代币兑换
3. 监控交易状态
4. 分析DeFi数据

请使用简洁专业的语言，直接回答用户的问题。`;
  }

  async initialize(): Promise<void> {
    if (this.executor) {
      return;
    }

    try {
      this.executor = await initializeAgentExecutorWithOptions(
        this.tools,
        await this.model.getModel(),
        {
          agentType: "structured-chat-zero-shot-react-description",
          verbose: true
        }
      );
    } catch (error) {
      throw new AgentError(
        `Failed to initialize agent: ${(error as Error).message}`,
        "INIT_ERROR"
      );
    }
  }

  async chat(input: string): Promise<string> {
    if (!this.executor) {
      await this.initialize();
    }

    try {
      const result = await this.executor!.invoke({
        input,
      });

      return result.output;
    } catch (error) {
      throw new AgentError(
        `Chat error: ${(error as Error).message}`,
        "CHAT_ERROR"
      );
    }
  }

  registerTools(tools: StructuredTool[]): void {
    this.tools = tools;
    this.executor = null; // Force re-initialization with new tools
  }

  getTools(): StructuredTool[] {
    return this.tools;
  }
}
