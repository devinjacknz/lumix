import { parentPort } from 'worker_threads';
import { VM } from 'vm';
import { SandboxConfig } from './sandbox';

// 创建安全的上下文对象
const createSecureContext = (config: SandboxConfig) => ({
  // 基础对象
  console: {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  },
  Buffer,
  
  // 定时器
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  
  // 进程
  process: {
    env: {},
    hrtime: process.hrtime,
    nextTick: process.nextTick,
    memoryUsage: process.memoryUsage
  },

  // 网络访问
  ...(config.allowNetwork ? {
    fetch: async (url: string, options?: any) => {
      const { host, port = 80 } = new URL(url);
      if (!validateNetworkAccess(host, port, config)) {
        throw new Error(`Network access denied: ${url}`);
      }
      return fetch(url, options);
    }
  } : {}),

  // 文件系统访问
  ...(config.allowFileSystem ? {
    fs: createSecureFileSystem(config)
  } : {})
});

// 创建安全的文件系统
const createSecureFileSystem = (config: SandboxConfig) => {
  const fs = require('fs');
  const path = require('path');

  return {
    readFile: async (filePath: string) => {
      if (!validateFileSystemAccess(filePath, false, config)) {
        throw new Error(`File read access denied: ${filePath}`);
      }
      return fs.promises.readFile(filePath);
    },
    writeFile: async (filePath: string, data: any) => {
      if (!validateFileSystemAccess(filePath, true, config)) {
        throw new Error(`File write access denied: ${filePath}`);
      }
      return fs.promises.writeFile(filePath, data);
    },
    readdir: async (dirPath: string) => {
      if (!validateFileSystemAccess(dirPath, false, config)) {
        throw new Error(`Directory read access denied: ${dirPath}`);
      }
      return fs.promises.readdir(dirPath);
    }
  };
};

// 验证网络访问
const validateNetworkAccess = (
  host: string,
  port: number,
  config: SandboxConfig
): boolean => {
  if (!config.allowNetwork) {
    return false;
  }

  // 检查主机
  if (config.allowedHosts.length > 0) {
    const allowed = config.allowedHosts.some(pattern => {
      if (pattern.startsWith('*.')) {
        return host.endsWith(pattern.slice(2));
      }
      return host === pattern;
    });
    if (!allowed) return false;
  }

  // 检查端口
  if (config.allowedPorts.length > 0) {
    if (!config.allowedPorts.includes(port)) {
      return false;
    }
  }

  return true;
};

// 验证文件系统访问
const validateFileSystemAccess = (
  filePath: string,
  write: boolean,
  config: SandboxConfig
): boolean => {
  if (!config.allowFileSystem) {
    return false;
  }

  // 如果是只读模式且尝试写入，拒绝访问
  if (config.readOnly && write) {
    return false;
  }

  // 检查路径
  if (config.allowedPaths.length > 0) {
    const allowed = config.allowedPaths.some(allowedPath => {
      if (allowedPath.endsWith('/*')) {
        return filePath.startsWith(allowedPath.slice(0, -2));
      }
      return filePath === allowedPath;
    });
    if (!allowed) return false;
  }

  return true;
};

// 监听消息
if (parentPort) {
  parentPort.on('message', async ({ code, context, config }) => {
    try {
      // 创建虚拟机
      const vm = new VM({
        timeout: config.timeLimit,
        sandbox: {
          ...createSecureContext(config),
          ...context
        }
      });

      // 执行代码
      const result = vm.run(code);

      // 返回结果
      parentPort.postMessage({
        success: true,
        result,
        stats: {
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUsage: process.cpuUsage().user
        }
      });
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
} 