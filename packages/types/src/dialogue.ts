export interface DialogueMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

export interface DialogueContext {
  messages: DialogueMessage[];
  metadata?: Record<string, any>;
}

export interface DialogueHistory {
  id: string;
  sessionId: string;
  messages: DialogueMessage[];
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