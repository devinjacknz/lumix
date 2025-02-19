import { BaseConfig, BaseResult } from '@lumix/types';
import { DialogueContext, DialogueMessage } from '@lumix/types';

export { DialogueContext, DialogueMessage };

export interface DialogManagerConfig extends BaseConfig {
  maxHistory?: number;
  persistenceEnabled?: boolean;
  contextDefaults?: Record<string, any>;
}

export const DialogManagerConfigSchema = {
  maxHistory: 100,
  persistenceEnabled: true,
  contextDefaults: {}
};

export interface DialogueResult extends BaseResult {
  context?: DialogueContext;
  message?: DialogueMessage;
}

export interface DialogueSession {
  id: string;
  userId: string;
  context: Record<string, any>;
  createdAt: number;
  updatedAt: number;
} 