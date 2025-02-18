import { logger } from '../monitoring';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface StateConfig {
  persistPath?: string;
  autoSave?: boolean;
  saveInterval?: number;
  maxStates?: number;
}

export interface SessionState {
  id: string;
  data: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    lastAccess: number;
    accessCount: number;
  };
}

export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private states: Map<string, SessionState>;
  private config: StateConfig;
  private saveTimer?: NodeJS.Timeout;

  private constructor(config: StateConfig) {
    super();
    this.states = new Map();
    this.config = {
      autoSave: true,
      saveInterval: 300000, // 5分钟
      maxStates: 1000,
      ...config
    };

    if (this.config.autoSave) {
      this.startAutoSave();
    }
  }

  public static getInstance(config?: StateConfig): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager(config || {});
    }
    return StateManager.instance;
  }

  public async setState(
    sessionId: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const existingState = this.states.get(sessionId);
      const now = Date.now();

      const state: SessionState = {
        id: sessionId,
        data,
        metadata: existingState ? {
          ...existingState.metadata,
          updatedAt: now,
          lastAccess: now,
          accessCount: existingState.metadata.accessCount + 1
        } : {
          createdAt: now,
          updatedAt: now,
          lastAccess: now,
          accessCount: 1
        }
      };

      this.states.set(sessionId, state);
      this.emit('stateChanged', { sessionId, state });
      logger.debug('State', `Set state for session ${sessionId}`);

      if (this.config.autoSave) {
        await this.save();
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to set state: ${error.message}`);
      }
      throw error;
    }
  }

  public async getState<T = Record<string, any>>(
    sessionId: string
  ): Promise<T | null> {
    try {
      const state = this.states.get(sessionId);
      if (!state) {
        return null;
      }

      // 更新访问信息
      state.metadata.lastAccess = Date.now();
      state.metadata.accessCount++;
      this.states.set(sessionId, state);

      logger.debug('State', `Retrieved state for session ${sessionId}`);
      return state.data as T;
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to get state: ${error.message}`);
      }
      throw error;
    }
  }

  public async updateState(
    sessionId: string,
    updater: (currentState: Record<string, any>) => Record<string, any>
  ): Promise<void> {
    try {
      const state = this.states.get(sessionId);
      if (!state) {
        throw new Error(`No state found for session ${sessionId}`);
      }

      const updatedData = updater(state.data);
      await this.setState(sessionId, updatedData);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to update state: ${error.message}`);
      }
      throw error;
    }
  }

  public async deleteState(sessionId: string): Promise<void> {
    try {
      if (this.states.delete(sessionId)) {
        this.emit('stateDeleted', { sessionId });
        logger.debug('State', `Deleted state for session ${sessionId}`);

        if (this.config.autoSave) {
          await this.save();
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to delete state: ${error.message}`);
      }
      throw error;
    }
  }

  public async clearStates(): Promise<void> {
    try {
      this.states.clear();
      this.emit('statesCleared');
      logger.info('State', 'All states cleared');

      if (this.config.autoSave) {
        await this.save();
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to clear states: ${error.message}`);
      }
      throw error;
    }
  }

  private startAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(
      () => this.save(),
      this.config.saveInterval
    );
  }

  private stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  public async save(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }

    try {
      const data = Array.from(this.states.entries());
      const dirPath = path.dirname(this.config.persistPath);
      
      // 确保目录存在
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }

      await fs.promises.writeFile(
        this.config.persistPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      logger.info('State', 'States persisted to disk');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to persist states: ${error.message}`);
      }
      throw error;
    }
  }

  public async restore(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }

    try {
      if (!fs.existsSync(this.config.persistPath)) {
        logger.info('State', 'No state file found to restore');
        return;
      }

      const data = await fs.promises.readFile(this.config.persistPath, 'utf-8');
      const entries = JSON.parse(data) as [string, SessionState][];
      
      this.states = new Map(entries);
      logger.info('State', 'States restored from disk');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to restore states: ${error.message}`);
      }
      // 如果恢复失败，使用空状态继续
      this.states = new Map();
    }
  }

  public getStats(): {
    totalStates: number;
    activeStates: number;
    oldestState?: number;
    newestState?: number;
  } {
    const states = Array.from(this.states.values());
    return {
      totalStates: states.length,
      activeStates: states.filter(s => Date.now() - s.metadata.lastAccess < 3600000).length,
      oldestState: states.length > 0 ? Math.min(...states.map(s => s.metadata.createdAt)) : undefined,
      newestState: states.length > 0 ? Math.max(...states.map(s => s.metadata.createdAt)) : undefined
    };
  }

  public async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const states = Array.from(this.states.entries());

      // 按最后访问时间排序
      states.sort((a, b) => a[1].metadata.lastAccess - b[1].metadata.lastAccess);

      // 删除过期和最旧的状态
      for (const [sessionId, state] of states) {
        if (this.states.size <= this.config.maxStates * 0.8) {
          break;
        }

        // 删除超过24小时未访问的状态
        if (now - state.metadata.lastAccess > 24 * 60 * 60 * 1000) {
          await this.deleteState(sessionId);
        }
      }

      logger.info('State', 'State cleanup completed');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to cleanup states: ${error.message}`);
      }
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      this.stopAutoSave();
      await this.save();
      this.removeAllListeners();
      logger.info('State', 'State manager shut down');
    } catch (error) {
      if (error instanceof Error) {
        logger.error('State', `Failed to shutdown state manager: ${error.message}`);
      }
      throw error;
    }
  }
} 