import { randomBytes } from 'crypto';
import { TaskScheduler } from '../scheduler';
import { APIKeyManager } from './key-manager';
import { BaseError } from '../types/errors';

export class KeyRotationError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KeyRotationError';
  }
}

interface RotationConfig {
  schedule?: string;
  keyLength?: number;
  notifyBefore?: number; // 轮换前通知时间（毫秒）
  onRotation?: (service: string, newKey: string) => Promise<void>;
  onNotification?: (service: string, dueDate: Date) => Promise<void>;
}

export class KeyRotationManager {
  private scheduler: TaskScheduler;
  private keyManager: APIKeyManager;
  private config: Required<RotationConfig>;

  constructor(keyManager: APIKeyManager, config: RotationConfig = {}) {
    this.keyManager = keyManager;
    this.scheduler = new TaskScheduler();
    this.config = {
      schedule: config.schedule || '0 0 1 * *', // 每月1日凌晨执行
      keyLength: config.keyLength || 32,
      notifyBefore: config.notifyBefore || 7 * 24 * 60 * 60 * 1000, // 7天前通知
      onRotation: config.onRotation || (async () => {}),
      onNotification: config.onNotification || (async () => {})
    };

    this.initializeRotationTasks();
  }

  /**
   * 初始化轮换任务
   */
  private initializeRotationTasks(): void {
    // 添加密钥轮换检查任务
    this.scheduler.addTask({
      id: 'key-rotation-check',
      name: 'API Key Rotation Check',
      schedule: this.config.schedule,
      handler: async () => {
        await this.checkAndRotateKeys();
      }
    });

    // 添加预通知任务
    this.scheduler.addTask({
      id: 'key-rotation-notification',
      name: 'API Key Rotation Notification',
      schedule: '0 0 * * *', // 每天检查
      handler: async () => {
        await this.checkAndNotify();
      }
    });
  }

  /**
   * 检查并轮换密钥
   */
  private async checkAndRotateKeys(): Promise<void> {
    try {
      const result = await this.keyManager.getRotationDueKeys();
      if (!result.success || !result.data) {
        throw new KeyRotationError('Failed to get rotation due keys');
      }

      for (const { service } of result.data) {
        await this.rotateKey(service);
      }
    } catch (error) {
      throw new KeyRotationError('Failed to check and rotate keys', { cause: error });
    }
  }

  /**
   * 检查并发送通知
   */
  private async checkAndNotify(): Promise<void> {
    try {
      const result = await this.keyManager.getRotationDueKeys();
      if (!result.success || !result.data) {
        throw new KeyRotationError('Failed to get rotation due keys');
      }

      const now = Date.now();
      for (const { service, dueDate } of result.data) {
        if (dueDate - now <= this.config.notifyBefore) {
          await this.config.onNotification(service, new Date(dueDate));
        }
      }
    } catch (error) {
      throw new KeyRotationError('Failed to check and notify', { cause: error });
    }
  }

  /**
   * 轮换指定服务的密钥
   */
  async rotateKey(service: string): Promise<void> {
    try {
      // 生成新密钥
      const newKey = randomBytes(this.config.keyLength).toString('hex');

      // 更新密钥
      const result = await this.keyManager.rotateKey(service, newKey);
      if (!result.success) {
        throw new KeyRotationError(`Failed to rotate key for service: ${service}`);
      }

      // 通知外部系统
      await this.config.onRotation(service, newKey);
    } catch (error) {
      throw new KeyRotationError(`Failed to rotate key for service: ${service}`, { cause: error });
    }
  }

  /**
   * 手动触发密钥轮换
   */
  async triggerRotation(service: string): Promise<void> {
    await this.rotateKey(service);
  }

  /**
   * 停止所有轮换任务
   */
  stop(): void {
    this.scheduler.stop();
  }
} 