export * from './types';
export * from './error-correction';
export * from './intent-recognition';
export * from './dialog-manager';

// Re-export commonly used types and schemas
import { DialogManagerConfig, DialogueContext, DialogueMessage } from '../types/dialogue';
import { DialogManager } from './dialog-manager';

export {
  DialogManager,
  DialogManagerConfig,
  DialogueContext,
  DialogueMessage
};

export {
  ErrorCorrectionConfig,
  ErrorCorrectionConfigSchema,
  DialogErrorCorrector
} from './error-correction';

export {
  IntentRecognitionConfig,
  IntentRecognitionConfigSchema,
  DialogIntentRecognizer
} from './intent-recognition';

// Example usage:
/*
import { DefaultDialogManager, DialogManagerConfig } from '@lumix/core/dialog';

const config: Partial<DialogManagerConfig> = {
  language: 'en',
  errorCorrection: {
    enabled: true,
    threshold: 0.8
  },
  intentRecognition: {
    enabled: true,
    threshold: 0.6
  }
};

const dialogManager = new DefaultDialogManager(historyManager, config);

// Error correction
const correction = await dialogManager.correctDialog("chekc my SOL balence");
// Result: "check my SOL balance"

// Intent recognition
const intent = await dialogManager.recognizeIntent("what's my SOL balance?");
// Result: { intent: "balance_query", confidence: 0.9, ... }

// Context management
await dialogManager.updateContext({
  sessionId: "user123",
  metadata: { lastQuery: "balance" }
});

const context = await dialogManager.getContext("user123");
*/
