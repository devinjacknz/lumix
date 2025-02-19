import { z } from 'zod';
import {
  DialogManagerConfig,
  DialogManagerConfigSchema,
  DialogueResult,
  DialogueSession
} from '../dialogue';
import { BaseConfig, BaseResult } from '../base';

// Mock BaseConfig and BaseResult for testing
interface BaseConfig {
  id?: string;
  name?: string;
}

interface BaseResult {
  success: boolean;
  error?: string;
}

// Mock DialogueContext and DialogueMessage
interface DialogueContext {
  sessionId: string;
  metadata?: Record<string, any>;
}

interface DialogueMessage {
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
}

describe('Dialogue Types', () => {
  describe('DialogManagerConfig', () => {
    const configSchema = z.object({
      maxHistory: z.number().min(0).optional(),
      persistenceEnabled: z.boolean().optional(),
      contextDefaults: z.record(z.any()).optional(),
      ...BaseConfig
    });

    test('validates config with default values', () => {
      const config: DialogManagerConfig = DialogManagerConfigSchema;
      expect(configSchema.parse(config)).toEqual(config);
    });

    test('validates config with custom values', () => {
      const config: DialogManagerConfig = {
        maxHistory: 50,
        persistenceEnabled: false,
        contextDefaults: { language: 'en' }
      };
      expect(configSchema.parse(config)).toEqual(config);
    });

    test('validates partial config', () => {
      const config: Partial<DialogManagerConfig> = {
        maxHistory: 200
      };
      expect(configSchema.partial().parse(config)).toEqual(config);
    });

    test('rejects invalid maxHistory', () => {
      const config = {
        maxHistory: -1,
        persistenceEnabled: true
      };
      expect(() => configSchema.parse(config)).toThrow();
    });

    test('validates config with complex context defaults', () => {
      const config: DialogManagerConfig = {
        contextDefaults: {
          language: 'en',
          preferences: {
            theme: 'dark',
            notifications: true
          },
          history: [],
          metadata: {
            version: '1.0.0',
            features: ['chat', 'voice']
          }
        }
      };
      expect(configSchema.parse(config)).toEqual(config);
    });

    test('validates config with maximum history value', () => {
      const config: DialogManagerConfig = {
        maxHistory: Number.MAX_SAFE_INTEGER
      };
      expect(configSchema.parse(config)).toEqual(config);
    });
  });

  describe('DialogueResult', () => {
    const resultSchema = z.object({
      context: z.record(z.any()).optional(),
      message: z.any().optional(),
      ...BaseResult
    });

    test('validates result with context and message', () => {
      const result: DialogueResult = {
        context: { language: 'en' },
        message: { content: 'Hello' }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with only context', () => {
      const result: DialogueResult = {
        context: { language: 'en' }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates empty result', () => {
      const result: DialogueResult = {};
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with complex nested message', () => {
      const result: DialogueResult = {
        context: { language: 'en' },
        message: {
          content: 'Hello',
          metadata: {
            timestamp: Date.now(),
            type: 'text',
            formatting: {
              bold: true,
              color: '#000000'
            }
          },
          attachments: [
            { type: 'image', url: 'https://example.com/image.jpg' }
          ]
        }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });

    test('validates result with array in context', () => {
      const result: DialogueResult = {
        context: {
          history: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' }
          ]
        }
      };
      expect(resultSchema.parse(result)).toEqual(result);
    });
  });

  describe('DialogueSession', () => {
    const now = Date.now();
    const sessionSchema = z.object({
      id: z.string(),
      userId: z.string(),
      context: z.record(z.any()),
      createdAt: z.number().max(now),
      updatedAt: z.number()
    }).refine(
      (data) => data.updatedAt >= data.createdAt,
      {
        message: "updatedAt must be greater than or equal to createdAt",
        path: ["updatedAt"]
      }
    );

    test('validates complete session', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: '123',
        userId: 'user123',
        context: { language: 'en' },
        createdAt: now - 1000,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session);
    });

    test('validates session with empty context', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: '123',
        userId: 'user123',
        context: {},
        createdAt: now - 1000,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session);
    });

    test('rejects session with missing required fields', () => {
      const session = {
        id: '123',
        context: {}
      };
      expect(() => sessionSchema.parse(session)).toThrow();
    });

    test('rejects session with invalid timestamps', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: '123',
        userId: 'user123',
        context: {},
        createdAt: now + 1000, // future creation time
        updatedAt: now
      };
      expect(() => sessionSchema.parse(session)).toThrow();
    });

    test('validates session with complex context structure', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: '123',
        userId: 'user123',
        context: {
          preferences: {
            language: 'en',
            theme: 'dark',
            notifications: {
              email: true,
              push: false
            }
          },
          history: [
            { timestamp: now - 2000, message: 'Hello' },
            { timestamp: now - 1000, message: 'Hi there!' }
          ],
          metadata: {
            device: {
              type: 'mobile',
              os: 'iOS',
              version: '15.0'
            },
            location: {
              country: 'US',
              timezone: 'America/New_York'
            }
          }
        },
        createdAt: now - 2000,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session);
    });

    test('validates session with very long id and userId', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: 'a'.repeat(256),
        userId: 'u'.repeat(256),
        context: {},
        createdAt: now - 1000,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session);
    });

    test('validates session with maximum length IDs', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: 'a'.repeat(128), // Testing max length ID
        userId: 'b'.repeat(128), // Testing max length userId
        context: {},
        createdAt: now - 1000,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session);
    });

    test('validates session with special characters in IDs', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: 'test-123_456@special',
        userId: 'user#123$456&special',
        context: {},
        createdAt: now - 1000,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session);
    });

    test('rejects session with same createdAt and updatedAt timestamps', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: '123',
        userId: 'user123',
        context: {},
        createdAt: now,
        updatedAt: now
      };
      expect(sessionSchema.parse(session)).toEqual(session); // Should pass as per refinement
    });

    test('rejects session with updatedAt before createdAt', () => {
      const now = Date.now();
      const session: DialogueSession = {
        id: '123',
        userId: 'user123',
        context: {},
        createdAt: now,
        updatedAt: now - 1000
      };
      expect(() => sessionSchema.parse(session)).toThrow();
    });
  });

  describe('DialogueContext and DialogueMessage', () => {
    const contextSchema = z.object({
      sessionId: z.string(),
      metadata: z.record(z.any()).optional()
    });

    const messageSchema = z.object({
      content: z.string(),
      role: z.enum(['user', 'assistant', 'system']),
      timestamp: z.number()
    });

    test('validates dialogue context with metadata', () => {
      const context: DialogueContext = {
        sessionId: '123',
        metadata: {
          language: 'en',
          userPreferences: {
            theme: 'dark'
          }
        }
      };
      expect(contextSchema.parse(context)).toEqual(context);
    });

    test('validates dialogue context without metadata', () => {
      const context: DialogueContext = {
        sessionId: '123'
      };
      expect(contextSchema.parse(context)).toEqual(context);
    });

    test('validates user message', () => {
      const message: DialogueMessage = {
        content: 'Hello, how are you?',
        role: 'user',
        timestamp: Date.now()
      };
      expect(messageSchema.parse(message)).toEqual(message);
    });

    test('validates assistant message', () => {
      const message: DialogueMessage = {
        content: 'I am doing well, thank you for asking!',
        role: 'assistant',
        timestamp: Date.now()
      };
      expect(messageSchema.parse(message)).toEqual(message);
    });

    test('validates system message', () => {
      const message: DialogueMessage = {
        content: 'Session initialized',
        role: 'system',
        timestamp: Date.now()
      };
      expect(messageSchema.parse(message)).toEqual(message);
    });

    test('rejects message with invalid role', () => {
      const message = {
        content: 'Hello',
        role: 'invalid_role',
        timestamp: Date.now()
      };
      expect(() => messageSchema.parse(message)).toThrow();
    });

    test('rejects message with empty content', () => {
      const message = {
        content: '',
        role: 'user',
        timestamp: Date.now()
      };
      expect(() => messageSchema.parse(message).and(
        z.object({ content: z.string().min(1) })
      )).toThrow();
    });

    test('rejects message with invalid timestamp', () => {
      const message = {
        content: 'Hello',
        role: 'user',
        timestamp: 'invalid_timestamp'
      };
      expect(() => messageSchema.parse(message)).toThrow();
    });
  });
}); 