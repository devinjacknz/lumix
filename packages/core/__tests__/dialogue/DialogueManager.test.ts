import { DialogueManager, Message, MessageRole } from '@lumix/core';

describe('DialogueManager', () => {
  let dialogueManager: DialogueManager;
  
  const createMessage = (role: MessageRole, content: string): Message => ({
    role,
    content
  });

  beforeEach(() => {
    dialogueManager = new DialogueManager({
      maxHistory: 10,
      persistenceEnabled: false
    });
  });

  describe('Basic Dialogue Management', () => {
    test('should add new message to history', async () => {
      const message = createMessage('user', 'Hello, how can I help with DeFi?');

      await dialogueManager.addMessage(message);
      const history = await dialogueManager.getHistory();
      
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(message);
    });

    test('should respect maxHistory limit', async () => {
      for (let i = 0; i < 15; i++) {
        await dialogueManager.addMessage(
          createMessage('user', `Message ${i}`)
        );
      }

      const history = await dialogueManager.getHistory();
      expect(history).toHaveLength(10);
      expect(history[9].content).toBe('Message 14');
    });

    test('should clear history', async () => {
      await dialogueManager.addMessage(
        createMessage('user', 'Test message')
      );

      await dialogueManager.clearHistory();
      const history = await dialogueManager.getHistory();
      
      expect(history).toHaveLength(0);
    });
  });

  describe('Context Management', () => {
    test('should maintain conversation context', async () => {
      await dialogueManager.addMessage(
        createMessage('user', 'What is the price of SOL?')
      );

      await dialogueManager.addMessage(
        createMessage('assistant', 'The current price of SOL is $100')
      );

      await dialogueManager.addMessage(
        createMessage('user', 'How about its market cap?')
      );

      const history = await dialogueManager.getHistory();
      expect(history).toHaveLength(3);
      expect(history.map(msg => msg.role)).toEqual(['user', 'assistant', 'user']);
    });

    test('should handle system messages', async () => {
      await dialogueManager.addMessage(
        createMessage('system', 'You are a DeFi assistant')
      );

      const history = await dialogueManager.getHistory();
      expect(history[0].role).toBe('system');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid message format', async () => {
      await expect(dialogueManager.addMessage({
        role: 'invalid' as MessageRole,
        content: 'Test message'
      })).rejects.toThrow();
    });

    test('should handle empty content', async () => {
      await expect(dialogueManager.addMessage(
        createMessage('user', '')
      )).rejects.toThrow();
    });
  });
});
