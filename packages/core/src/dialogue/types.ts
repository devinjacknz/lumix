import { BaseConfig, Message, MessageRole, DialogueManagerConfig } from '@lumix/types';

export { Message, MessageRole, DialogueManagerConfig };

export interface DialogueManagerInterface {
  addMessage(message: Message): Promise<void>;
  getHistory(): Promise<Message[]>;
  clearHistory(): Promise<void>;
}
