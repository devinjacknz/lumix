import { LLMInterface, LLMResponse, ModelConfig } from './types';
import axios from 'axios';

export class OllamaAdapter implements LLMInterface {
  private baseUrl: string;
  private model: string;

  constructor(config: ModelConfig) {
    this.baseUrl = config.endpoint || 'http://localhost:11434';
    this.model = config.model || 'llama2';
  }

  async initialize(): Promise<void> {
    try {
      // 检查 Ollama 服务是否可用
      await axios.get(`${this.baseUrl}/api/tags`);
    } catch (error) {
      throw new Error(`Failed to connect to Ollama service: ${error.message}`);
    }
  }

  async chat(messages: any[]): Promise<LLMResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/chat`, {
        model: this.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      });

      return {
        content: response.data.message.content,
        tokens: response.data.usage?.total_tokens || 0,
        model: this.model,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Ollama chat error: ${error.message}`);
    }
  }

  async analyze<T>(prompt: string): Promise<LLMResponse<T>> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: this.model,
        prompt,
        stream: false
      });

      return {
        content: response.data.response,
        tokens: response.data.usage?.total_tokens || 0,
        model: this.model,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Ollama analysis error: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/embeddings`, {
        model: this.model,
        prompt: text
      });

      return response.data.embedding;
    } catch (error) {
      throw new Error(`Ollama embedding error: ${error.message}`);
    }
  }

  async shutdown(): Promise<void> {
    // Ollama 不需要特殊的关闭操作
  }
}