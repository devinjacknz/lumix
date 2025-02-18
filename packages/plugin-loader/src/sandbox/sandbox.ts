import { Worker } from 'worker_threads';
import { VM } from 'vm';
import { PluginLoaderError } from '../types';

export interface SandboxConfig {
  // 隔离配置
  isolationLevel: 'none' | 'process' | 'vm';
  permissions?: string[];
  
  // 资源限制
  memoryLimit?: number;
  cpuLimit?: number;
  timeLimit?: number;
  
  // 网络限制
  allowNetwork?: boolean;
  allowedHosts?: string[];
  allowedPorts?: number[];
  
  // 文件系统限制
  allowFileSystem?: boolean;
  allowedPaths?: string[];
  readOnly?: boolean;
}

export interface SandboxStats {
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
  operations: {
    total: number;
    failed: number;
    byType: Record<string, number>;
  };
}

export class PluginSandbox {
  private config: Required<SandboxConfig>;
  private worker?: Worker;
  private vm?: VM;
  private operations: Map<string, number>;
  private failedOperations: number;
  private startTime: number;

  constructor(config: SandboxConfig) {
    this.config = {
      isolationLevel: config.isolationLevel,
      permissions: config.permissions || [],
      memoryLimit: config.memoryLimit || 512 * 1024 * 1024, // 512MB
      cpuLimit: config.cpuLimit || 80, // 80% CPU
      timeLimit: config.timeLimit || 30000, // 30秒
      allowNetwork: config.allowNetwork ?? false,
      allowedHosts: config.allowedHosts || [],
      allowedPorts: config.allowedPorts || [],
      allowFileSystem: config.allowFileSystem ?? false,
      allowedPaths: config.allowedPaths || [],
      readOnly: config.readOnly ?? true
    };

    this.operations = new Map();
    this.failedOperations = 0;
    this.startTime = Date.now();
  }

  /**
   * 初始化沙箱
   */
  async initialize(): Promise<void> {
    try {
      switch (this.config.isolationLevel) {
        case 'process':
          await this.initializeWorker();
          break;
        case 'vm':
          this.initializeVM();
          break;
        case 'none':
          // 无隔离，直接运行
          break;
        default:
          throw new PluginLoaderError(`Invalid isolation level: ${this.config.isolationLevel}`);
      }
    } catch (error) {
      throw new PluginLoaderError('Failed to initialize sandbox', { cause: error });
    }
  }

  /**
   * 执行代码
   */
  async execute<T = any>(
    code: string,
    context: Record<string, any> = {}
  ): Promise<T> {
    try {
      this.trackOperation('execute');

      switch (this.config.isolationLevel) {
        case 'process':
          return await this.executeInWorker<T>(code, context);
        case 'vm':
          return this.executeInVM<T>(code, context);
        case 'none':
          return this.executeDirectly<T>(code, context);
        default:
          throw new PluginLoaderError(`Invalid isolation level: ${this.config.isolationLevel}`);
      }
    } catch (error) {
      this.trackOperation('execute', true);
      throw new PluginLoaderError('Failed to execute code in sandbox', { cause: error });
    }
  }

  /**
   * 销毁沙箱
   */
  async destroy(): Promise<void> {
    try {
      if (this.worker) {
        await this.worker.terminate();
        this.worker = undefined;
      }

      if (this.vm) {
        this.vm = undefined;
      }

      this.operations.clear();
      this.failedOperations = 0;
    } catch (error) {
      throw new PluginLoaderError('Failed to destroy sandbox', { cause: error });
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): SandboxStats {
    const operationsByType: Record<string, number> = {};
    for (const [type, count] of this.operations.entries()) {
      operationsByType[type] = count;
    }

    return {
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: process.cpuUsage().user,
      uptime: Date.now() - this.startTime,
      operations: {
        total: Array.from(this.operations.values()).reduce((a, b) => a + b, 0),
        failed: this.failedOperations,
        byType: operationsByType
      }
    };
  }

  /**
   * 检查权限
   */
  checkPermission(permission: string): boolean {
    return this.config.permissions.includes(permission);
  }

  /**
   * 验证网络访问
   */
  validateNetworkAccess(host: string, port: number): boolean {
    if (!this.config.allowNetwork) {
      return false;
    }

    // 检查主机
    if (this.config.allowedHosts.length > 0) {
      const allowed = this.config.allowedHosts.some(pattern => {
        if (pattern.startsWith('*.')) {
          return host.endsWith(pattern.slice(2));
        }
        return host === pattern;
      });
      if (!allowed) return false;
    }

    // 检查端口
    if (this.config.allowedPorts.length > 0) {
      if (!this.config.allowedPorts.includes(port)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 验证文件系统访问
   */
  validateFileSystemAccess(path: string, write: boolean = false): boolean {
    if (!this.config.allowFileSystem) {
      return false;
    }

    // 如果是只读模式且尝试写入，拒绝访问
    if (this.config.readOnly && write) {
      return false;
    }

    // 检查路径
    if (this.config.allowedPaths.length > 0) {
      const allowed = this.config.allowedPaths.some(allowedPath => {
        if (allowedPath.endsWith('/*')) {
          return path.startsWith(allowedPath.slice(0, -2));
        }
        return path === allowedPath;
      });
      if (!allowed) return false;
    }

    return true;
  }

  /**
   * 初始化工作线程
   */
  private async initializeWorker(): Promise<void> {
    // 创建工作线程
    this.worker = new Worker(`
      const { parentPort } = require('worker_threads');
      const vm = require('vm');

      // 创建安全的上下文
      const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Buffer,
        process: {
          env: {},
          hrtime: process.hrtime,
          nextTick: process.nextTick
        }
      });

      // 监听消息
      parentPort.on('message', async ({ code, context: userContext }) => {
        try {
          // 合并上下文
          Object.assign(context, userContext);

          // 执行代码
          const script = new vm.Script(code);
          const result = script.runInContext(context);

          // 返回结果
          parentPort.postMessage({ success: true, result });
        } catch (error) {
          parentPort.postMessage({
            success: false,
            error: {
              message: error.message,
              stack: error.stack
            }
          });
        }
      });
    `);

    // 等待工作线程初始化
    await new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      this.worker.on('online', resolve);
      this.worker.on('error', reject);
    });
  }

  /**
   * 初始化虚拟机
   */
  private initializeVM(): void {
    this.vm = new VM({
      timeout: this.config.timeLimit,
      sandbox: {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Buffer
      }
    });
  }

  /**
   * 在工作线程中执行代码
   */
  private async executeInWorker<T>(
    code: string,
    context: Record<string, any>
  ): Promise<T> {
    if (!this.worker) {
      throw new PluginLoaderError('Worker not initialized');
    }

    return new Promise<T>((resolve, reject) => {
      const handler = (message: any) => {
        if (message.success) {
          resolve(message.result);
        } else {
          reject(new Error(message.error.message));
        }
        this.worker?.off('message', handler);
      };

      this.worker.on('message', handler);
      this.worker.postMessage({ code, context });
    });
  }

  /**
   * 在虚拟机中执行代码
   */
  private executeInVM<T>(
    code: string,
    context: Record<string, any>
  ): T {
    if (!this.vm) {
      throw new PluginLoaderError('VM not initialized');
    }

    return this.vm.run(code, context);
  }

  /**
   * 直接执行代码
   */
  private executeDirectly<T>(
    code: string,
    context: Record<string, any>
  ): T {
    // 创建函数
    const fn = new Function(...Object.keys(context), code);
    
    // 执行函数
    return fn.apply(null, Object.values(context));
  }

  /**
   * 跟踪操作
   */
  private trackOperation(type: string, failed: boolean = false): void {
    const count = this.operations.get(type) || 0;
    this.operations.set(type, count + 1);
    if (failed) {
      this.failedOperations++;
    }
  }
}