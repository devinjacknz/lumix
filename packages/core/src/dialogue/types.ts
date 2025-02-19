import { BaseConfig, Message, MessageRole } from '@lumix/types';

export { Message, MessageRole };

export interface DialogueManagerConfig extends BaseConfig {
  maxHistory?: number;
  persistHistory?: boolean;
}

export interface DialogueManagerInterface {
  addMessage(message: Message): Promise<void>;
  getHistory(): Promise<Message[]>;
  clearHistory(): Promise<void>;
}
