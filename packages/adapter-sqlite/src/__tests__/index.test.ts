import { unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SQLiteDialogHistoryManager, SQLiteConfig } from '../index';
import { Message, MessageRole } from '@lumix/types';
import { createTestDatabase } from './setup-db';

describe('SQLiteDialogHistoryManager', () => {
  let manager: SQLiteDialogHistoryManager;
  let dbPath: string;

  beforeEach(async () => {
    const result = await createTestDatabase();
    dbPath = result.path;
    const config: SQLiteConfig = {
      type: 'sqlite',
      path: dbPath,
      verbose: false
    };
    manager = new SQLiteDialogHistoryManager(config);
    try {
      await manager.initialize();
    } catch (error) {
      console.error('Failed to initialize:', error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      await manager.disconnect();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
    try {
      unlinkSync(dbPath);
    } catch (error) {
      console.error('Failed to cleanup:', error);
    }
  });

  describe('message management', () => {
    it('should save and retrieve messages', async () => {
      const message1: Message = {
        role: MessageRole.User,
        content: 'Hello',
        metadata: { timestamp: Date.now() }
      };

      const message2: Message = {
        role: MessageRole.Assistant,
        content: 'Hi there!',
        metadata: { timestamp: Date.now() }
      };

      await manager.saveMessage(message1);
      await manager.saveMessage(message2);

      const context = await manager.getContext();
      expect(context.messages).toHaveLength(2);
      expect(context.messages[0].role).toBe(message1.role);
      expect(context.messages[0].content).toBe(message1.content);
      expect(context.messages[0].metadata).toEqual(message1.metadata);
      expect(context.messages[1].role).toBe(message2.role);
      expect(context.messages[1].content).toBe(message2.content);
      expect(context.messages[1].metadata).toEqual(message2.metadata);
    });

    it('should handle messages without metadata', async () => {
      const message: Message = {
        role: MessageRole.User,
        content: 'Hello'
      };

      await manager.saveMessage(message);

      const context = await manager.getContext();
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe(message.role);
      expect(context.messages[0].content).toBe(message.content);
      expect(context.messages[0].metadata).toBeUndefined();
    });

    it('should clear context', async () => {
      const message: Message = {
        role: MessageRole.User,
        content: 'Hello'
      };

      await manager.saveMessage(message);
      await manager.clearContext();

      const context = await manager.getContext();
      expect(context.messages).toHaveLength(0);
    });

    it('should maintain message order', async () => {
      const messages: Message[] = [
        { role: MessageRole.User, content: 'Hello' },
        { role: MessageRole.Assistant, content: 'Hi!' },
        { role: MessageRole.User, content: 'How are you?' }
      ];

      for (const message of messages) {
        await manager.saveMessage(message);
      }

      const context = await manager.getContext();
      expect(context.messages).toHaveLength(messages.length);
      context.messages.forEach((msg, i) => {
        expect(msg.role).toBe(messages[i].role);
        expect(msg.content).toBe(messages[i].content);
      });
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors', async () => {
      const invalidConfig: SQLiteConfig = {
        type: 'sqlite',
        path: '/invalid/path/db.sqlite',
        verbose: false
      };
      const invalidManager = new SQLiteDialogHistoryManager(invalidConfig);
      await expect(invalidManager.initialize()).rejects.toThrow();
    });

    it('should handle invalid metadata JSON', async () => {
      // Directly insert invalid JSON using raw SQL
      await manager.execute(
        'INSERT INTO messages (role, content, metadata, timestamp) VALUES (?, ?, ?, ?)',
        ['user', 'test', 'invalid-json', Date.now()]
      );

      const context = await manager.getContext();
      expect(context.messages[0].metadata).toBeUndefined();
    });
  });

  describe('database operations', () => {
    it('should handle concurrent operations', async () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: MessageRole.User,
        content: `Message ${i}`,
        metadata: { index: i }
      }));

      await Promise.all(messages.map(msg => manager.saveMessage(msg)));
      const context = await manager.getContext();
      expect(context.messages).toHaveLength(messages.length);
    });

    it('should handle large messages', async () => {
      const largeContent = 'a'.repeat(10000);
      const largeMetadata = { data: 'b'.repeat(10000) };
      
      const message: Message = {
        role: MessageRole.User,
        content: largeContent,
        metadata: largeMetadata
      };

      await manager.saveMessage(message);
      const context = await manager.getContext();
      expect(context.messages[0].content).toBe(largeContent);
      expect(context.messages[0].metadata).toEqual(largeMetadata);
    });
  });
});
