import { BaseError } from '@lumix/core';
import { WorkflowManager, WorkflowState, Approval } from '../workflow/manager';
import { RuleEngine, Rule, ApprovalContext } from '../rules/engine';

export class DashboardError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DashboardError';
  }
}

export interface WorkflowFilter {
  status?: WorkflowState['status'];
  approver?: string;
  dateRange?: {
    start: number;
    end: number;
  };
  chainId?: number;
  ruleId?: string;
}

export interface WorkflowSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  averageApprovalTime: number;
}

export interface DashboardConfig {
  workflowManager: WorkflowManager;
  ruleEngine: RuleEngine;
  refreshInterval?: number; // 毫秒
  maxCachedWorkflows?: number;
}

export class DashboardBoard {
  private workflowManager: WorkflowManager;
  private ruleEngine: RuleEngine;
  private config: Required<DashboardConfig>;
  private refreshTimer: NodeJS.Timer;
  private workflowCache: Map<string, WorkflowState>;
  private summaryCache: WorkflowSummary | null;
  private lastRefresh: number;

  constructor(config: DashboardConfig) {
    this.workflowManager = config.workflowManager;
    this.ruleEngine = config.ruleEngine;
    this.config = {
      workflowManager: config.workflowManager,
      ruleEngine: config.ruleEngine,
      refreshInterval: config.refreshInterval || 30000, // 30秒
      maxCachedWorkflows: config.maxCachedWorkflows || 1000
    };

    this.workflowCache = new Map();
    this.summaryCache = null;
    this.lastRefresh = 0;

    // 启动定时刷新
    this.refreshTimer = setInterval(
      () => this.refresh(),
      this.config.refreshInterval
    );
  }

  /**
   * 获取工作流列表
   */
  async getWorkflows(filter?: WorkflowFilter): Promise<WorkflowState[]> {
    await this.ensureRefreshed();
    let workflows = Array.from(this.workflowCache.values());

    if (filter) {
      workflows = this.filterWorkflows(workflows, filter);
    }

    return workflows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 获取工作流统计摘要
   */
  async getWorkflowSummary(): Promise<WorkflowSummary> {
    await this.ensureRefreshed();

    if (!this.summaryCache) {
      this.summaryCache = this.calculateSummary(
        Array.from(this.workflowCache.values())
      );
    }

    return this.summaryCache;
  }

  /**
   * 获取审批者的待处理工作流
   */
  async getApproverTasks(approver: string): Promise<WorkflowState[]> {
    await this.ensureRefreshed();
    
    return Array.from(this.workflowCache.values()).filter(workflow =>
      workflow.status === 'pending' &&
      workflow.matchedRules.some(match =>
        match.rule.approvers.includes(approver) &&
        !workflow.approvals.some(a => a.approver === approver)
      )
    );
  }

  /**
   * 获取规则统计信息
   */
  async getRuleStats(ruleId: string): Promise<{
    totalWorkflows: number;
    approvedWorkflows: number;
    averageApprovals: number;
    averageTime: number;
  }> {
    await this.ensureRefreshed();
    const rule = this.ruleEngine.getRule(ruleId);
    if (!rule) {
      throw new DashboardError(`Rule ${ruleId} not found`);
    }

    const ruleWorkflows = Array.from(this.workflowCache.values()).filter(
      workflow => workflow.matchedRules.some(match => match.rule.id === ruleId)
    );

    const approvedWorkflows = ruleWorkflows.filter(w => w.status === 'approved');
    const totalApprovals = ruleWorkflows.reduce(
      (sum, w) => sum + w.approvals.length,
      0
    );
    const totalTime = approvedWorkflows.reduce(
      (sum, w) => sum + (w.updatedAt - w.createdAt),
      0
    );

    return {
      totalWorkflows: ruleWorkflows.length,
      approvedWorkflows: approvedWorkflows.length,
      averageApprovals: ruleWorkflows.length > 0
        ? totalApprovals / ruleWorkflows.length
        : 0,
      averageTime: approvedWorkflows.length > 0
        ? totalTime / approvedWorkflows.length
        : 0
    };
  }

  /**
   * 获取审批者统计信息
   */
  async getApproverStats(approver: string): Promise<{
    pendingTasks: number;
    completedTasks: number;
    averageResponseTime: number;
    approvalRate: number;
  }> {
    await this.ensureRefreshed();

    const approverWorkflows = Array.from(this.workflowCache.values()).filter(
      workflow => workflow.matchedRules.some(match =>
        match.rule.approvers.includes(approver)
      )
    );

    const pendingTasks = approverWorkflows.filter(
      w => w.status === 'pending' &&
        !w.approvals.some(a => a.approver === approver)
    ).length;

    const approverApprovals = approverWorkflows.flatMap(w =>
      w.approvals.filter(a => a.approver === approver)
    );

    const completedTasks = approverApprovals.length;
    const totalResponseTime = approverApprovals.reduce((sum, approval) => {
      const workflow = this.workflowCache.get(approval.id.split('-')[1]);
      return sum + (approval.timestamp - (workflow?.createdAt || 0));
    }, 0);

    return {
      pendingTasks,
      completedTasks,
      averageResponseTime: completedTasks > 0
        ? totalResponseTime / completedTasks
        : 0,
      approvalRate: approverWorkflows.length > 0
        ? completedTasks / approverWorkflows.length
        : 0
    };
  }

  /**
   * 刷新看板数据
   */
  private async refresh(): Promise<void> {
    try {
      // 获取所有工作流
      const workflows = await Promise.all([
        ...this.workflowManager.getPendingWorkflows(),
        ...Array.from(this.workflowCache.values()).filter(
          w => w.status !== 'pending'
        )
      ]);

      // 更新缓存
      this.workflowCache.clear();
      for (const workflow of workflows) {
        if (this.workflowCache.size >= this.config.maxCachedWorkflows) {
          // 如果超出缓存限制，删除最旧的非待处理工作流
          const oldestNonPending = Array.from(this.workflowCache.entries())
            .filter(([_, w]) => w.status !== 'pending')
            .sort(([_, a], [__, b]) => a.updatedAt - b.updatedAt)[0];
          
          if (oldestNonPending) {
            this.workflowCache.delete(oldestNonPending[0]);
          } else {
            break; // 如果没有非待处理工作流可删除，停止添加
          }
        }
        this.workflowCache.set(workflow.id, workflow);
      }

      // 重置摘要缓存
      this.summaryCache = null;
      this.lastRefresh = Date.now();
    } catch (error) {
      throw new DashboardError('Failed to refresh dashboard data', { cause: error });
    }
  }

  private async ensureRefreshed(): Promise<void> {
    if (Date.now() - this.lastRefresh >= this.config.refreshInterval) {
      await this.refresh();
    }
  }

  private filterWorkflows(
    workflows: WorkflowState[],
    filter: WorkflowFilter
  ): WorkflowState[] {
    return workflows.filter(workflow => {
      if (filter.status && workflow.status !== filter.status) {
        return false;
      }

      if (filter.approver) {
        const isApprover = workflow.matchedRules.some(match =>
          match.rule.approvers.includes(filter.approver!)
        );
        if (!isApprover) {
          return false;
        }
      }

      if (filter.dateRange) {
        if (
          workflow.createdAt < filter.dateRange.start ||
          workflow.createdAt > filter.dateRange.end
        ) {
          return false;
        }
      }

      if (filter.chainId) {
        if (workflow.context.chainId !== filter.chainId) {
          return false;
        }
      }

      if (filter.ruleId) {
        if (!workflow.matchedRules.some(match => match.rule.id === filter.ruleId)) {
          return false;
        }
      }

      return true;
    });
  }

  private calculateSummary(workflows: WorkflowState[]): WorkflowSummary {
    const summary: WorkflowSummary = {
      total: workflows.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      averageApprovalTime: 0
    };

    let totalApprovalTime = 0;
    let approvedCount = 0;

    for (const workflow of workflows) {
      switch (workflow.status) {
        case 'pending':
          summary.pending++;
          break;
        case 'approved':
          summary.approved++;
          totalApprovalTime += workflow.updatedAt - workflow.createdAt;
          approvedCount++;
          break;
        case 'rejected':
          summary.rejected++;
          break;
        case 'expired':
          summary.expired++;
          break;
      }
    }

    summary.averageApprovalTime = approvedCount > 0
      ? totalApprovalTime / approvedCount
      : 0;

    return summary;
  }

  /**
   * 停止看板
   */
  stop(): void {
    clearInterval(this.refreshTimer);
  }
} 