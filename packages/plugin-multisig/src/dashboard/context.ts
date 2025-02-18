import { BaseError } from '@lumix/core';
import { WorkflowState, Approval } from '../workflow/manager';
import { Rule } from '../rules/engine';

export class ContextError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ContextError';
  }
}

export interface DialogueContext {
  currentWorkflow?: WorkflowState;
  currentRule?: Rule;
  currentApprover?: string;
  selectedChain?: number;
  dateRange?: {
    start: number;
    end: number;
  };
  filters: Record<string, any>;
  lastAction?: {
    type: string;
    timestamp: number;
    data?: any;
  };
}

export interface ContextConfig {
  maxHistorySize?: number;
  contextTTL?: number; // 毫秒
}

export class ContextManager {
  private contexts: Map<string, DialogueContext>;
  private history: Map<string, Array<{
    timestamp: number;
    context: DialogueContext;
  }>>;
  private config: Required<ContextConfig>;

  constructor(config: ContextConfig = {}) {
    this.contexts = new Map();
    this.history = new Map();
    this.config = {
      maxHistorySize: config.maxHistorySize || 10,
      contextTTL: config.contextTTL || 30 * 60 * 1000 // 30分钟
    };
  }

  /**
   * 创建新的对话上下文
   */
  createContext(sessionId: string): DialogueContext {
    const context: DialogueContext = {
      filters: {}
    };
    this.contexts.set(sessionId, context);
    this.addToHistory(sessionId, context);
    return context;
  }

  /**
   * 获取对话上下文
   */
  getContext(sessionId: string): DialogueContext | undefined {
    const context = this.contexts.get(sessionId);
    if (context) {
      this.validateContext(sessionId);
    }
    return context;
  }

  /**
   * 更新对话上下文
   */
  updateContext(
    sessionId: string,
    updates: Partial<DialogueContext>
  ): DialogueContext {
    let context = this.contexts.get(sessionId);
    if (!context) {
      context = this.createContext(sessionId);
    }

    context = {
      ...context,
      ...updates,
      filters: {
        ...context.filters,
        ...updates.filters
      }
    };

    this.contexts.set(sessionId, context);
    this.addToHistory(sessionId, context);
    return context;
  }

  /**
   * 设置当前工作流
   */
  setCurrentWorkflow(
    sessionId: string,
    workflow: WorkflowState | undefined
  ): void {
    this.updateContext(sessionId, {
      currentWorkflow: workflow,
      lastAction: {
        type: 'select_workflow',
        timestamp: Date.now(),
        data: workflow?.id
      }
    });
  }

  /**
   * 设置当前规则
   */
  setCurrentRule(
    sessionId: string,
    rule: Rule | undefined
  ): void {
    this.updateContext(sessionId, {
      currentRule: rule,
      lastAction: {
        type: 'select_rule',
        timestamp: Date.now(),
        data: rule?.id
      }
    });
  }

  /**
   * 设置当前审批者
   */
  setCurrentApprover(
    sessionId: string,
    approver: string | undefined
  ): void {
    this.updateContext(sessionId, {
      currentApprover: approver,
      lastAction: {
        type: 'select_approver',
        timestamp: Date.now(),
        data: approver
      }
    });
  }

  /**
   * 设置选中的链
   */
  setSelectedChain(
    sessionId: string,
    chainId: number | undefined
  ): void {
    this.updateContext(sessionId, {
      selectedChain: chainId,
      lastAction: {
        type: 'select_chain',
        timestamp: Date.now(),
        data: chainId
      }
    });
  }

  /**
   * 设置日期范围
   */
  setDateRange(
    sessionId: string,
    start: number,
    end: number
  ): void {
    this.updateContext(sessionId, {
      dateRange: { start, end },
      lastAction: {
        type: 'set_date_range',
        timestamp: Date.now(),
        data: { start, end }
      }
    });
  }

  /**
   * 添加过滤器
   */
  addFilter(
    sessionId: string,
    key: string,
    value: any
  ): void {
    const context = this.getContext(sessionId);
    if (!context) {
      throw new ContextError(`Context not found for session ${sessionId}`);
    }

    this.updateContext(sessionId, {
      filters: {
        ...context.filters,
        [key]: value
      },
      lastAction: {
        type: 'add_filter',
        timestamp: Date.now(),
        data: { key, value }
      }
    });
  }

  /**
   * 移除过滤器
   */
  removeFilter(
    sessionId: string,
    key: string
  ): void {
    const context = this.getContext(sessionId);
    if (!context) {
      throw new ContextError(`Context not found for session ${sessionId}`);
    }

    const { [key]: _, ...remainingFilters } = context.filters;
    this.updateContext(sessionId, {
      filters: remainingFilters,
      lastAction: {
        type: 'remove_filter',
        timestamp: Date.now(),
        data: key
      }
    });
  }

  /**
   * 清除过滤器
   */
  clearFilters(sessionId: string): void {
    this.updateContext(sessionId, {
      filters: {},
      lastAction: {
        type: 'clear_filters',
        timestamp: Date.now()
      }
    });
  }

  /**
   * 获取上下文历史
   */
  getHistory(sessionId: string): Array<{
    timestamp: number;
    context: DialogueContext;
  }> {
    return this.history.get(sessionId) || [];
  }

  /**
   * 清除上下文
   */
  clearContext(sessionId: string): void {
    this.contexts.delete(sessionId);
    this.history.delete(sessionId);
  }

  /**
   * 验证上下文是否过期
   */
  private validateContext(sessionId: string): void {
    const history = this.history.get(sessionId);
    if (!history || history.length === 0) {
      this.clearContext(sessionId);
      throw new ContextError(`No history found for session ${sessionId}`);
    }

    const lastUpdate = history[history.length - 1].timestamp;
    if (Date.now() - lastUpdate > this.config.contextTTL) {
      this.clearContext(sessionId);
      throw new ContextError(`Context expired for session ${sessionId}`);
    }
  }

  /**
   * 添加上下文到历史记录
   */
  private addToHistory(
    sessionId: string,
    context: DialogueContext
  ): void {
    let history = this.history.get(sessionId);
    if (!history) {
      history = [];
      this.history.set(sessionId, history);
    }

    history.push({
      timestamp: Date.now(),
      context: { ...context }
    });

    // 限制历史记录大小
    if (history.length > this.config.maxHistorySize) {
      history.shift();
    }
  }
} 