// Rules
export * from './rules/engine';

// Workflow
export * from './workflow/manager';

// Signature
export * from './signature/verifier';
export * from './signature/factory';

// Dashboard
export * from './dashboard/board';
export * from './dashboard/context';

// Plugin
export interface PluginConfig {
  chainId: number;
  jwtSecret: string;
  hsm?: {
    provider: 'aws' | 'azure' | 'gcp';
    region?: string;
    credentials?: Record<string, string>;
  };
  dashboard?: {
    refreshInterval?: number;
    maxCachedWorkflows?: number;
  };
  workflow?: {
    defaultExpiration?: number;
    maxPendingWorkflows?: number;
  };
  signature?: {
    verificationTimeout?: number;
    maxSignatureAge?: number;
  };
}

export class MultisigPlugin {
  private config: PluginConfig;
  private ruleEngine: RuleEngine;
  private workflowManager: WorkflowManager;
  private signatureVerifierFactory: SignatureVerifierFactory;
  private dashboardBoard: DashboardBoard;
  private contextManager: ContextManager;

  constructor(config: PluginConfig) {
    this.config = config;

    // 初始化规则引擎
    this.ruleEngine = new RuleEngine();

    // 初始化签名验证器工厂
    this.signatureVerifierFactory = new SignatureVerifierFactory({
      chainId: config.chainId,
      ...config.signature
    });

    // 初始化工作流管理器
    this.workflowManager = new WorkflowManager({
      ruleEngine: this.ruleEngine,
      jwtSecret: config.jwtSecret,
      ...config.workflow
    });

    // 初始化看板
    this.dashboardBoard = new DashboardBoard({
      workflowManager: this.workflowManager,
      ruleEngine: this.ruleEngine,
      ...config.dashboard
    });

    // 初始化上下文管理器
    this.contextManager = new ContextManager();
  }

  /**
   * 获取规则引擎实例
   */
  getRuleEngine(): RuleEngine {
    return this.ruleEngine;
  }

  /**
   * 获取工作流管理器实例
   */
  getWorkflowManager(): WorkflowManager {
    return this.workflowManager;
  }

  /**
   * 获取签名验证器工厂实例
   */
  getSignatureVerifierFactory(): SignatureVerifierFactory {
    return this.signatureVerifierFactory;
  }

  /**
   * 获取看板实例
   */
  getDashboardBoard(): DashboardBoard {
    return this.dashboardBoard;
  }

  /**
   * 获取上下文管理器实例
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * 停止插件
   */
  stop(): void {
    this.workflowManager.stop();
    this.dashboardBoard.stop();
  }
} 