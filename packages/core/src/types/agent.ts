export interface AgentConfig {
  apiKey: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AgentOptions {
  config: AgentConfig;
  tools?: any[];
  systemPrompt?: string;
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
