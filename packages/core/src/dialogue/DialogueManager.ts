import { promises as fs } from 'fs';
import { Message, DialogueManagerConfig, DialogueManagerInterface } from './types';

export class DialogueManager implements DialogueManagerInterface {
  private history: Message[] = [];
  private config: DialogueManagerConfig;

  constructor(config: DialogueManagerConfig) {
    this.config = config;
    this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    if (this.config.persistenceEnabled && this.config.persistencePath) {
      try {
        const data = await fs.readFile(this.config.persistencePath, 'utf-8');
        this.history = JSON.parse(data);
      } catch (error) {
        // File doesn't exist or is invalid, start with empty history
        this.history = [];
      }
    }
  }

  private async saveHistory(): Promise<void> {
    if (this.config.persistenceEnabled && this.config.persistencePath) {
      await fs.writeFile(
        this.config.persistencePath,
        JSON.stringify(this.history),
        'utf-8'
      );
    }
  }

  async addMessage(message: Message): Promise<void> {
    this.history.push(message);
    if (this.history.length > this.config.maxHistory) {
      this.history = this.history.slice(-this.config.maxHistory);
    }
    await this.saveHistory();
  }

  async getHistory(): Promise<Message[]> {
    return [...this.history];
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    await this.saveHistory();
  }

  async getLastMessage(): Promise<Message | null> {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }
}

export default DialogueManager; 