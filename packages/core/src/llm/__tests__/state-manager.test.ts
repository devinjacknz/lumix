import { StateManager } from '../state-manager';
import * as fs from 'fs';
import * as path from 'path';

describe('StateManager', () => {
  let stateManager: StateManager;
  const testPersistPath = path.join(__dirname, 'test-states.json');

  beforeEach(() => {
    // 清理测试文件
    if (fs.existsSync(testPersistPath)) {
      fs.unlinkSync(testPersistPath);
    }

    stateManager = StateManager.getInstance({
      persistPath: testPersistPath,
      autoSave: true,
      saveInterval: 1000,
      maxStates: 10
    });
  });

  afterEach(async () => {
    await stateManager.shutdown();
    if (fs.existsSync(testPersistPath)) {
      fs.unlinkSync(testPersistPath);
    }
  });

  describe('Basic State Operations', () => {
    it('should set and get state', async () => {
      const sessionId = 'test-session';
      const testData = { key: 'value' };

      await stateManager.setState(sessionId, testData);
      const retrievedState = await stateManager.getState(sessionId);

      expect(retrievedState).toEqual(testData);
    });

    it('should update state', async () => {
      const sessionId = 'test-session';
      const initialData = { count: 0 };
      const updater = (state: any) => ({ count: state.count + 1 });

      await stateManager.setState(sessionId, initialData);
      await stateManager.updateState(sessionId, updater);
      const updatedState = await stateManager.getState(sessionId);

      expect(updatedState).toEqual({ count: 1 });
    });

    it('should delete state', async () => {
      const sessionId = 'test-session';
      const testData = { key: 'value' };

      await stateManager.setState(sessionId, testData);
      await stateManager.deleteState(sessionId);
      const retrievedState = await stateManager.getState(sessionId);

      expect(retrievedState).toBeNull();
    });

    it('should clear all states', async () => {
      const sessions = ['session1', 'session2', 'session3'];
      
      for (const sessionId of sessions) {
        await stateManager.setState(sessionId, { key: sessionId });
      }

      await stateManager.clearStates();
      
      for (const sessionId of sessions) {
        const state = await stateManager.getState(sessionId);
        expect(state).toBeNull();
      }
    });
  });

  describe('State Persistence', () => {
    it('should persist states to disk', async () => {
      const sessionId = 'test-session';
      const testData = { key: 'value' };

      await stateManager.setState(sessionId, testData);
      await stateManager.save();

      expect(fs.existsSync(testPersistPath)).toBe(true);
      const fileContent = fs.readFileSync(testPersistPath, 'utf-8');
      const savedData = JSON.parse(fileContent);
      expect(savedData).toHaveLength(1);
      expect(savedData[0][1].data).toEqual(testData);
    });

    it('should restore states from disk', async () => {
      const sessionId = 'test-session';
      const testData = { key: 'value' };

      await stateManager.setState(sessionId, testData);
      await stateManager.save();

      // 创建新的实例并恢复状态
      const newStateManager = StateManager.getInstance({
        persistPath: testPersistPath
      });
      await newStateManager.restore();

      const retrievedState = await newStateManager.getState(sessionId);
      expect(retrievedState).toEqual(testData);
    });
  });

  describe('State Metadata', () => {
    it('should track access count and timestamps', async () => {
      const sessionId = 'test-session';
      const testData = { key: 'value' };

      await stateManager.setState(sessionId, testData);
      await stateManager.getState(sessionId);
      await stateManager.getState(sessionId);

      const stats = stateManager.getStats();
      expect(stats.totalStates).toBe(1);
      expect(stats.activeStates).toBe(1);
    });

    it('should cleanup old states', async () => {
      const sessions = Array.from({ length: 15 }, (_, i) => `session-${i}`);
      
      for (const sessionId of sessions) {
        await stateManager.setState(sessionId, { key: sessionId });
      }

      await stateManager.cleanup();
      const stats = stateManager.getStats();
      
      expect(stats.totalStates).toBeLessThanOrEqual(10);
    });
  });

  describe('Event Emission', () => {
    it('should emit events on state changes', async () => {
      const sessionId = 'test-session';
      const testData = { key: 'value' };
      const stateChangedHandler = jest.fn();
      const stateDeletedHandler = jest.fn();

      stateManager.on('stateChanged', stateChangedHandler);
      stateManager.on('stateDeleted', stateDeletedHandler);

      await stateManager.setState(sessionId, testData);
      expect(stateChangedHandler).toHaveBeenCalled();

      await stateManager.deleteState(sessionId);
      expect(stateDeletedHandler).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid state updates', async () => {
      const sessionId = 'non-existent';
      
      await expect(
        stateManager.updateState(sessionId, state => state)
      ).rejects.toThrow();
    });

    it('should handle persistence errors', async () => {
      const invalidPath = '/invalid/path/states.json';
      const errorStateManager = StateManager.getInstance({
        persistPath: invalidPath
      });

      await expect(errorStateManager.save()).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent operations', async () => {
      const sessions = Array.from({ length: 100 }, (_, i) => `session-${i}`);
      const operations = sessions.map(sessionId => 
        stateManager.setState(sessionId, { key: sessionId })
      );

      await Promise.all(operations);
      const stats = stateManager.getStats();
      
      expect(stats.totalStates).toBe(100);
    });

    it('should maintain performance with many states', async () => {
      const sessions = Array.from({ length: 1000 }, (_, i) => `session-${i}`);
      
      const startTime = Date.now();
      for (const sessionId of sessions) {
        await stateManager.setState(sessionId, { key: sessionId });
      }
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // 应该在5秒内完成
    });
  });
}); 