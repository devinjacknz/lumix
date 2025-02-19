import { EventEmitter } from 'events';
import { BaseError } from '../types/errors';

/**
 * 内存池错误
 */
export class MemoryPoolError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MemoryPoolError';
  }
}

/**
 * 内存块状态
 */
export enum BlockStatus {
  FREE = 'free',
  ALLOCATED = 'allocated',
  RESERVED = 'reserved'
}

/**
 * 内存块
 */
export interface MemoryBlock {
  id: string;
  size: number;
  offset: number;
  status: BlockStatus;
  data: Buffer;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * 内存池配置
 */
export interface MemoryPoolConfig {
  // 基础配置
  initialSize?: number;
  maxSize?: number;
  blockSize?: number;
  growthFactor?: number;

  // 清理配置
  cleanupInterval?: number;
  maxAge?: number;
  minFreeBlocks?: number;

  // 监控配置
  enableMonitoring?: boolean;
  monitoringInterval?: number;
  alertThreshold?: number;
}

/**
 * 内存池统计
 */
export interface MemoryPoolStats {
  totalSize: number;
  usedSize: number;
  freeSize: number;
  totalBlocks: number;
  usedBlocks: number;
  freeBlocks: number;
  fragmentationRatio: number;
  averageBlockSize: number;
  largestFreeBlock: number;
  oldestBlock: number;
}

/**
 * 内存池
 */
export class MemoryPool extends EventEmitter {
  private config: Required<MemoryPoolConfig>;
  private buffer: Buffer;
  private blocks: Map<string, MemoryBlock>;
  private freeBlocks: Set<string>;
  private cleanupInterval: NodeJS.Timer;
  private monitoringInterval: NodeJS.Timer;

  constructor(config: MemoryPoolConfig = {}) {
    super();
    this.config = {
      initialSize: config.initialSize || 1024 * 1024, // 1MB
      maxSize: config.maxSize || 1024 * 1024 * 1024, // 1GB
      blockSize: config.blockSize || 4096, // 4KB
      growthFactor: config.growthFactor || 2,
      cleanupInterval: config.cleanupInterval || 60000, // 1分钟
      maxAge: config.maxAge || 3600000, // 1小时
      minFreeBlocks: config.minFreeBlocks || 32,
      enableMonitoring: config.enableMonitoring || false,
      monitoringInterval: config.monitoringInterval || 5000,
      alertThreshold: config.alertThreshold || 0.9
    };

    this.buffer = Buffer.alloc(this.config.initialSize);
    this.blocks = new Map();
    this.freeBlocks = new Set();

    this.initialize();
    this.startCleanup();
    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * 初始化内存池
   */
  private initialize(): void {
    // 创建初始空闲块
    const block: MemoryBlock = {
      id: crypto.randomUUID(),
      size: this.config.initialSize,
      offset: 0,
      status: BlockStatus.FREE,
      data: this.buffer.subarray(0, this.config.initialSize),
      timestamp: Date.now()
    };

    this.blocks.set(block.id, block);
    this.freeBlocks.add(block.id);
  }

  /**
   * 分配内存块
   */
  allocate(size: number, metadata?: Record<string, any>): MemoryBlock {
    // 查找合适的空闲块
    const blockId = this.findFreeBlock(size);
    if (!blockId) {
      // 尝试扩展内存池
      this.grow();
      const newBlockId = this.findFreeBlock(size);
      if (!newBlockId) {
        throw new MemoryPoolError('No available memory block');
      }
      return this.splitAndAllocate(newBlockId, size, metadata);
    }

    return this.splitAndAllocate(blockId, size, metadata);
  }

  /**
   * 释放内存块
   */
  free(blockId: string): void {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new MemoryPoolError(`Block ${blockId} not found`);
    }

    if (block.status !== BlockStatus.ALLOCATED) {
      throw new MemoryPoolError(`Block ${blockId} is not allocated`);
    }

    block.status = BlockStatus.FREE;
    block.metadata = undefined;
    this.freeBlocks.add(blockId);

    // 尝试合并相邻的空闲块
    this.mergeAdjacentBlocks(blockId);
    this.emit('blockFreed', block);
  }

  /**
   * 保留内存块
   */
  reserve(size: number): string {
    const block = this.allocate(size);
    block.status = BlockStatus.RESERVED;
    return block.id;
  }

  /**
   * 写入数据
   */
  write(blockId: string, data: Buffer, offset: number = 0): void {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new MemoryPoolError(`Block ${blockId} not found`);
    }

    if (block.status === BlockStatus.FREE) {
      throw new MemoryPoolError(`Block ${blockId} is not allocated`);
    }

    if (offset + data.length > block.size) {
      throw new MemoryPoolError('Data exceeds block size');
    }

    data.copy(block.data, offset);
    block.timestamp = Date.now();
    this.emit('blockWritten', block);
  }

  /**
   * 读取数据
   */
  read(blockId: string, offset: number = 0, length?: number): Buffer {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new MemoryPoolError(`Block ${blockId} not found`);
    }

    if (block.status === BlockStatus.FREE) {
      throw new MemoryPoolError(`Block ${blockId} is not allocated`);
    }

    const readLength = length || block.size - offset;
    if (offset + readLength > block.size) {
      throw new MemoryPoolError('Read exceeds block size');
    }

    return block.data.subarray(offset, offset + readLength);
  }

  /**
   * 查找空闲块
   */
  private findFreeBlock(size: number): string | undefined {
    // 使用最佳适配算法
    let bestFitId: string | undefined;
    let bestFitSize = Infinity;

    for (const blockId of this.freeBlocks) {
      const block = this.blocks.get(blockId);
      if (!block) continue;

      if (block.size >= size && block.size < bestFitSize) {
        bestFitId = blockId;
        bestFitSize = block.size;
      }
    }

    return bestFitId;
  }

  /**
   * 分割并分配块
   */
  private splitAndAllocate(
    blockId: string,
    size: number,
    metadata?: Record<string, any>
  ): MemoryBlock {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new MemoryPoolError(`Block ${blockId} not found`);
    }

    this.freeBlocks.delete(blockId);

    if (block.size - size >= this.config.blockSize) {
      // 分割块
      const remainingSize = block.size - size;
      const remainingOffset = block.offset + size;

      const newBlock: MemoryBlock = {
        id: crypto.randomUUID(),
        size: remainingSize,
        offset: remainingOffset,
        status: BlockStatus.FREE,
        data: this.buffer.subarray(remainingOffset, remainingOffset + remainingSize),
        timestamp: Date.now()
      };

      block.size = size;
      block.data = this.buffer.subarray(block.offset, block.offset + size);
      
      this.blocks.set(newBlock.id, newBlock);
      this.freeBlocks.add(newBlock.id);
    }

    block.status = BlockStatus.ALLOCATED;
    block.timestamp = Date.now();
    block.metadata = metadata;

    this.emit('blockAllocated', block);
    return block;
  }

  /**
   * 合并相邻的空闲块
   */
  private mergeAdjacentBlocks(blockId: string): void {
    const block = this.blocks.get(blockId);
    if (!block || block.status !== BlockStatus.FREE) return;

    // 查找并合并相邻的空闲块
    for (const [id, other] of this.blocks.entries()) {
      if (id === blockId || other.status !== BlockStatus.FREE) continue;

      if (block.offset + block.size === other.offset) {
        // 合并后续块
        block.size += other.size;
        block.data = this.buffer.subarray(block.offset, block.offset + block.size);
        this.blocks.delete(id);
        this.freeBlocks.delete(id);
      } else if (other.offset + other.size === block.offset) {
        // 合并前置块
        other.size += block.size;
        other.data = this.buffer.subarray(other.offset, other.offset + other.size);
        this.blocks.delete(blockId);
        this.freeBlocks.delete(blockId);
      }
    }
  }

  /**
   * 扩展内存池
   */
  private grow(): void {
    const currentSize = this.buffer.length;
    const newSize = Math.min(
      currentSize * this.config.growthFactor,
      this.config.maxSize
    );

    if (newSize === currentSize) {
      throw new MemoryPoolError('Memory pool reached maximum size');
    }

    // 创建新缓冲区
    const newBuffer = Buffer.alloc(newSize);
    this.buffer.copy(newBuffer);
    this.buffer = newBuffer;

    // 添加新的空闲块
    const block: MemoryBlock = {
      id: crypto.randomUUID(),
      size: newSize - currentSize,
      offset: currentSize,
      status: BlockStatus.FREE,
      data: this.buffer.subarray(currentSize, newSize),
      timestamp: Date.now()
    };

    this.blocks.set(block.id, block);
    this.freeBlocks.add(block.id);
    this.emit('poolGrown', { oldSize: currentSize, newSize });
  }

  /**
   * 清理过期块
   */
  private cleanup(): void {
    const now = Date.now();
    let freedCount = 0;

    for (const [id, block] of this.blocks.entries()) {
      if (block.status === BlockStatus.ALLOCATED &&
          now - block.timestamp > this.config.maxAge) {
        this.free(id);
        freedCount++;
      }
    }

    if (freedCount > 0) {
      this.emit('cleanup', { freedCount });
    }
  }

  /**
   * 启动清理任务
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 启动监控任务
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const stats = this.getStats();
      this.emit('stats', stats);

      if (stats.usedSize / stats.totalSize > this.config.alertThreshold) {
        this.emit('memoryAlert', {
          usage: stats.usedSize / stats.totalSize,
          threshold: this.config.alertThreshold
        });
      }
    }, this.config.monitoringInterval);
  }

  /**
   * 获取统计信息
   */
  getStats(): MemoryPoolStats {
    let usedSize = 0;
    let usedBlocks = 0;
    let oldestTimestamp = Date.now();
    let largestFreeBlock = 0;

    for (const block of this.blocks.values()) {
      if (block.status !== BlockStatus.FREE) {
        usedSize += block.size;
        usedBlocks++;
      } else if (block.size > largestFreeBlock) {
        largestFreeBlock = block.size;
      }

      if (block.timestamp < oldestTimestamp) {
        oldestTimestamp = block.timestamp;
      }
    }

    return {
      totalSize: this.buffer.length,
      usedSize,
      freeSize: this.buffer.length - usedSize,
      totalBlocks: this.blocks.size,
      usedBlocks,
      freeBlocks: this.freeBlocks.size,
      fragmentationRatio: this.freeBlocks.size / this.blocks.size,
      averageBlockSize: this.buffer.length / this.blocks.size,
      largestFreeBlock,
      oldestBlock: Date.now() - oldestTimestamp
    };
  }

  /**
   * 关闭内存池
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.buffer = Buffer.alloc(0);
    this.blocks.clear();
    this.freeBlocks.clear();
    this.emit('closed');
  }
}