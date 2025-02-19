import { AgentExecutor, initializeAgentExecutorWithOptions } from "langchain/agents";
import { BaseMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { AgentConfig, AgentOptions, AgentError, ConsultationMode } from "@lumix/core";
import { BaseModelAdapter, createModelAdapter } from "@lumix/models";

export class SolanaAgent {
  private executor: AgentExecutor | null = null;
  private model: BaseModelAdapter;
  private tools: StructuredTool[] = [];
  private systemPrompt: string;
  private consultationMode: ConsultationMode;

  constructor(options: AgentOptions) {
    this.model = createModelAdapter(options.config);
    this.tools = options.tools || [];
    this.consultationMode = options.consultationMode || 'expert';
    this.systemPrompt = options.systemPrompt || this.getDefaultSystemPrompt();
  }

  private getDefaultSystemPrompt(): string {
    const modeDescription = this.consultationMode === 'beginner' 
      ? `你是一个友好的 Solana DeFi 助手，使用通俗易懂的语言解释概念，避免专业术语。
在执行任何操作前，都会详细解释每个步骤的含义和潜在风险。`
      : `你是一个专业的 Solana DeFi 助手，提供详细的技术分析和底层原理解释。
可以处理复杂的 DeFi 操作，并提供专业的市场洞察。`;

    return `${modeDescription}

你可以帮助用户：
1. 查询代币余额
2. 执行代币兑换
3. 监控交易状态
4. 分析DeFi数据

${this.consultationMode === 'beginner' ? '我会用简单的语言回答你的问题。' : '我会使用专业的语言直接回答问题。'}`;
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

  private formatResponse(response: string): string {
    if (this.consultationMode === 'beginner') {
      // 简化专业术语，添加更多解释
      return this.simplifyExplanation(response);
    }
    return response;
  }

  private simplifyExplanation(response: string): string {
    // 替换常见的专业术语为更通俗的解释
    const simplifications: Record<string, string> = {
      'DEX': '去中心化交易所（一个可以直接交易代币的平台）',
      'AMM': '自动做市商（一种自动交易系统）',
      'TVL': '总锁定价值（在协议中存入的资金总额）',
      // 可以添加更多术语简化
    };

    let simplified = response;
    Object.entries(simplifications).forEach(([term, explanation]) => {
      const regex = new RegExp(`\\b${term}\\b`, 'g');
      simplified = simplified.replace(regex, `${term}(${explanation})`);
    });

    return simplified;
  }

  async chat(input: string): Promise<string> {
    if (!this.executor) {
      await this.initialize();
    }

    try {
      const result = await this.executor!.invoke({
        input,
      });

      return this.formatResponse(result.output);
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
