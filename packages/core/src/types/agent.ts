export interface AgentConfig {
  apiKey: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export type ConsultationMode = 'beginner' | 'expert';

export interface AgentOptions {
  config: AgentConfig;
  tools?: StructuredTool[];
  systemPrompt?: string;
  consultationMode?: ConsultationMode;
}

export class AgentError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'AgentError';
  }
}
