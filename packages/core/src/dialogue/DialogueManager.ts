import { DialogueManagerConfig, DialogueManagerInterface, Message, MessageRole } from './types';

export class DialogueManager implements DialogueManagerInterface {
  private history: Message[] = [];
  private config: DialogueManagerConfig;

  constructor(config: DialogueManagerConfig) {
    this.config = config;
  }

  private validateMessage(message: Message): void {
    const validRoles: MessageRole[] = ['user', 'assistant', 'system'];
    
    if (!validRoles.includes(message.role)) {
      throw new Error(`Invalid message role: ${message.role}`);
    }

    if (!message.content || message.content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }
  }

  async addMessage(message: Message): Promise<void> {
    this.validateMessage(message);

    this.history.push(message);

    // Maintain maxHistory limit
    if (this.history.length > this.config.maxHistory) {
      this.history = this.history.slice(-this.config.maxHistory);
    }

    if (this.config.persistenceEnabled) {
      await this.persistHistory();
    }
  }

  async getHistory(): Promise<Message[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    
    if (this.config.persistenceEnabled) {
      await this.persistHistory();
    }
  }

  async getLastMessage(): Promise<Message | null> {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  private async persistHistory(): Promise<void> {
    // TODO: Implement persistence logic when storage adapter is ready
    if (!this.config.persistencePath) {
      throw new Error('Persistence path not configured');
    }
  }
}
