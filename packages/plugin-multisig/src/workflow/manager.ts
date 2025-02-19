import { BaseError } from '@lumix/core';
import { RuleEngine, Rule, ApprovalContext, RuleMatch } from '../rules/engine';
import jwt from 'jsonwebtoken';
import { SignatureVerifierFactory } from '../signature/factory';

export class WorkflowError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkflowError';
  }
}

export interface Approval {
  id: string;
  approver: string;
  timestamp: number;
  signature: string;
  metadata?: Record<string, any>;
}

export interface WorkflowState {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  context: ApprovalContext;
  matchedRules: RuleMatch[];
  approvals: Approval[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  metadata?: Record<string, any>;
}

export interface WorkflowConfig {
  ruleEngine: RuleEngine;
  jwtSecret: string;
  defaultExpiration?: number; // 毫秒
  maxPendingWorkflows?: number;
  cleanupInterval?: number; // 毫秒
  signatureVerifierConfig?: Partial<SignatureConfig>;
}

export class WorkflowManager {
  private ruleEngine: RuleEngine;
  private workflows: Map<string, WorkflowState>;
  private config: Required<WorkflowConfig>;
  private cleanupTimer: NodeJS.Timer;
  private signatureVerifierFactory: SignatureVerifierFactory;

  constructor(config: WorkflowConfig) {
    this.ruleEngine = config.ruleEngine;
    this.workflows = new Map();
    this.config = {
      ruleEngine: config.ruleEngine,
      jwtSecret: config.jwtSecret,
      defaultExpiration: config.defaultExpiration || 24 * 60 * 60 * 1000, // 24小时
      maxPendingWorkflows: config.maxPendingWorkflows || 1000,
      cleanupInterval: config.cleanupInterval || 60 * 60 * 1000, // 1小时
      signatureVerifierConfig: config.signatureVerifierConfig || {}
    };

    // 初始化签名验证器工厂
    this.signatureVerifierFactory = new SignatureVerifierFactory(
      this.config.signatureVerifierConfig
    );

    // 启动清理定时器
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredWorkflows(),
      this.config.cleanupInterval
    );
  }

  /**
   * 创建新的审批工作流
   */
  async createWorkflow(context: ApprovalContext): Promise<WorkflowState> {
    // 检查待处理工作流数量限制
    if (this.getPendingWorkflowCount() >= this.config.maxPendingWorkflows) {
      throw new WorkflowError('Maximum pending workflows limit reached');
    }

    // 评估规则
    const matchedRules = await this.ruleEngine.evaluateContext(context);
    if (matchedRules.length === 0) {
      throw new WorkflowError('No matching rules found for the given context');
    }

    const now = Date.now();
    const workflow: WorkflowState = {
      id: this.generateWorkflowId(),
      status: 'pending',
      context,
      matchedRules,
      approvals: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.config.defaultExpiration
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  /**
   * 提交审批
   */
  async submitApproval(
    workflowId: string,
    approver: string,
    signature: string,
    metadata?: Record<string, any>
  ): Promise<WorkflowState> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowError(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'pending') {
      throw new WorkflowError(`Workflow ${workflowId} is not pending`);
    }

    if (workflow.expiresAt && workflow.expiresAt < Date.now()) {
      workflow.status = 'expired';
      throw new WorkflowError(`Workflow ${workflowId} has expired`);
    }

    // 验证签名
    if (!this.verifySignature(workflow, approver, signature)) {
      throw new WorkflowError('Invalid signature');
    }

    // 检查是否已经审批
    if (workflow.approvals.some(a => a.approver === approver)) {
      throw new WorkflowError(`Approver ${approver} has already approved`);
    }

    // 检查审批者权限
    const hasPermission = workflow.matchedRules.some(match =>
      match.rule.approvers.includes(approver)
    );
    if (!hasPermission) {
      throw new WorkflowError(`Approver ${approver} is not authorized`);
    }

    // 添加审批
    const approval: Approval = {
      id: this.generateApprovalId(),
      approver,
      timestamp: Date.now(),
      signature,
      metadata
    };
    workflow.approvals.push(approval);
    workflow.updatedAt = approval.timestamp;

    // 更新规则状态
    for (const match of workflow.matchedRules) {
      if (match.rule.approvers.includes(approver)) {
        match.remainingApprovals--;
      }
    }

    // 检查是否满足任一规则的要求
    const isApproved = workflow.matchedRules.some(match =>
      match.remainingApprovals <= 0
    );

    if (isApproved) {
      workflow.status = 'approved';
    }

    return workflow;
  }

  /**
   * 拒绝工作流
   */
  rejectWorkflow(
    workflowId: string,
    approver: string,
    reason?: string
  ): WorkflowState {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowError(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'pending') {
      throw new WorkflowError(`Workflow ${workflowId} is not pending`);
    }

    // 检查审批者权限
    const hasPermission = workflow.matchedRules.some(match =>
      match.rule.approvers.includes(approver)
    );
    if (!hasPermission) {
      throw new WorkflowError(`Approver ${approver} is not authorized`);
    }

    workflow.status = 'rejected';
    workflow.updatedAt = Date.now();
    workflow.metadata = {
      ...workflow.metadata,
      rejectedBy: approver,
      rejectionReason: reason
    };

    return workflow;
  }

  /**
   * 获取工作流状态
   */
  getWorkflow(workflowId: string): WorkflowState | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * 获取待处理的工作流
   */
  getPendingWorkflows(): WorkflowState[] {
    return Array.from(this.workflows.values()).filter(
      w => w.status === 'pending'
    );
  }

  /**
   * 获取审批者的待处理工作流
   */
  getApproverPendingWorkflows(approver: string): WorkflowState[] {
    return Array.from(this.workflows.values()).filter(workflow =>
      workflow.status === 'pending' &&
      workflow.matchedRules.some(match =>
        match.rule.approvers.includes(approver) &&
        !workflow.approvals.some(a => a.approver === approver)
      )
    );
  }

  /**
   * 清理过期工作流
   */
  private cleanupExpiredWorkflows(): void {
    const now = Date.now();
    for (const [id, workflow] of this.workflows.entries()) {
      if (
        workflow.status === 'pending' &&
        workflow.expiresAt &&
        workflow.expiresAt < now
      ) {
        workflow.status = 'expired';
        workflow.updatedAt = now;
      }

      // 删除完成/拒绝/过期超过清理间隔的工作流
      if (
        workflow.status !== 'pending' &&
        workflow.updatedAt + this.config.cleanupInterval < now
      ) {
        this.workflows.delete(id);
      }
    }
  }

  private getPendingWorkflowCount(): number {
    return Array.from(this.workflows.values()).filter(
      w => w.status === 'pending'
    ).length;
  }

  private generateWorkflowId(): string {
    return `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateApprovalId(): string {
    return `ap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private verifySignature(
    workflow: WorkflowState,
    approver: string,
    signature: string
  ): boolean {
    try {
      const payload = jwt.verify(signature, this.config.jwtSecret) as any;
      return (
        payload.workflowId === workflow.id &&
        payload.approver === approver &&
        payload.timestamp <= Date.now()
      );
    } catch {
      return false;
    }
  }

  /**
   * 提交跨链审批
   */
  async submitCrossChainApproval(
    workflowId: string,
    approver: string,
    sourceChainId: number,
    signature: string,
    metadata?: Record<string, any>
  ): Promise<WorkflowState> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowError(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'pending') {
      throw new WorkflowError(`Workflow ${workflowId} is not pending`);
    }

    if (workflow.expiresAt && workflow.expiresAt < Date.now()) {
      workflow.status = 'expired';
      throw new WorkflowError(`Workflow ${workflowId} has expired`);
    }

    // 获取源链的签名验证器
    const verifier = this.signatureVerifierFactory.getVerifier(sourceChainId);

    // 构建跨链消息
    const message = JSON.stringify({
      workflowId,
      context: workflow.context,
      timestamp: Date.now()
    });

    // 验证跨链签名
    const result = await verifier.verifyCrossChainSignature(
      message,
      sourceChainId,
      signature,
      approver
    );

    if (!result.isValid) {
      throw new WorkflowError(
        result.error?.message || 'Cross-chain signature verification failed'
      );
    }

    // 检查是否已经审批
    if (workflow.approvals.some(a => a.approver === approver)) {
      throw new WorkflowError(`Approver ${approver} has already approved`);
    }

    // 检查审批者权限
    const hasPermission = workflow.matchedRules.some(match =>
      match.rule.approvers.includes(approver)
    );
    if (!hasPermission) {
      throw new WorkflowError(`Approver ${approver} is not authorized`);
    }

    // 添加审批
    const approval: Approval = {
      id: this.generateApprovalId(),
      approver,
      timestamp: Date.now(),
      signature,
      metadata: {
        ...metadata,
        sourceChainId,
        signatureMetadata: result.metadata
      }
    };
    workflow.approvals.push(approval);
    workflow.updatedAt = approval.timestamp;

    // 更新规则状态
    for (const match of workflow.matchedRules) {
      if (match.rule.approvers.includes(approver)) {
        match.remainingApprovals--;
      }
    }

    // 检查是否满足任一规则的要求
    const isApproved = workflow.matchedRules.some(match =>
      match.remainingApprovals <= 0
    );

    if (isApproved) {
      workflow.status = 'approved';
    }

    return workflow;
  }

  /**
   * 停止管理器
   */
  stop(): void {
    clearInterval(this.cleanupTimer);
  }
} 