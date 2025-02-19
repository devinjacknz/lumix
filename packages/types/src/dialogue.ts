import { BaseConfig } from './base';

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system'
}

export interface Message {
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
}

export interface DialogueContext {
  messages: Message[];
  metadata?: Record<string, any>;
}

export interface DialogueHistory {
  id: string;
  sessionId: string;
  messages: Message[];
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface DialogueSession {
  id: string;
  userId: string;
  context: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface DialogueManagerConfig extends BaseConfig {
  maxHistory?: number;
  persistHistory?: boolean;
}

export interface DialogueManagerInterface {
  addMessage(message: Message): Promise<void>;
  getHistory(): Promise<Message[]>;
  clearHistory(): Promise<void>;
} 