export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface DialogueManagerConfig {
  maxHistory: number;
  persistenceEnabled: boolean;
  persistencePath?: string;
}

export interface DialogueManagerInterface {
  addMessage(message: Message): Promise<void>;
  getHistory(): Promise<Message[]>;
  clearHistory(): Promise<void>;
  getLastMessage(): Promise<Message | null>;
}
