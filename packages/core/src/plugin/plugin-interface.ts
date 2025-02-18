import { ChainProtocol } from '../chain/abstract';
import { MarketAnalyzer } from '../ai/market-analyzer';
import { RiskAssessor } from '../security/risk-assessor';
import { EmergencyHandler } from '../security/emergency-handler';

export interface PluginContext {
  chainProtocol: ChainProtocol;
  marketAnalyzer: MarketAnalyzer;
  riskAssessor: RiskAssessor;
  emergencyHandler: EmergencyHandler;
  config: Record<string, any>;
  logger: {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  };
  storage: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
  };
}

export interface PluginAPI {
  // 市场分析扩展点
  marketAnalysis?: {
    // 自定义指标计算
    calculateIndicator?(name: string, data: any[]): Promise<number>;
    // 市场情绪分析
    analyzeSentiment?(data: any): Promise<number>;
    // 异常检测
    detectAnomaly?(data: any): Promise<boolean>;
  };

  // 风险控制扩展点
  riskControl?: {
    // 自定义风险因子
    calculateRiskFactor?(name: string, data: any): Promise<number>;
    // 风险评估规则
    evaluateRisk?(data: any): Promise<{
      level: 'low' | 'medium' | 'high';
      score: number;
      details: any;
    }>;
    // 风险缓解策略
    mitigateRisk?(risk: any): Promise<{
      action: string;
      params: any;
    }>;
  };

  // 交易策略扩展点
  tradingStrategy?: {
    // 策略信号生成
    generateSignal?(data: any): Promise<{
      type: 'buy' | 'sell' | 'hold';
      confidence: number;
      params: any;
    }>;
    // 仓位管理
    managePosition?(position: any, market: any): Promise<{
      action: 'increase' | 'decrease' | 'hold';
      size: number;
    }>;
    // 止盈止损设置
    setStopLevels?(position: any, market: any): Promise<{
      takeProfit: number;
      stopLoss: number;
    }>;
  };

  // 数据处理扩展点
  dataProcessing?: {
    // 数据清洗
    cleanData?(data: any[]): Promise<any[]>;
    // 特征工程
    extractFeatures?(data: any[]): Promise<any[]>;
    // 数据转换
    transformData?(data: any, format: string): Promise<any>;
  };

  // 网络优化扩展点
  networkOptimization?: {
    // 节点选择策略
    selectNode?(nodes: any[]): Promise<string>;
    // 请求优化
    optimizeRequest?(request: any): Promise<any>;
    // 响应处理
    processResponse?(response: any): Promise<any>;
  };

  // 安全增强扩展点
  securityEnhancement?: {
    // 交易验证
    validateTransaction?(tx: any): Promise<{
      isValid: boolean;
      reason?: string;
    }>;
    // 地址检查
    checkAddress?(address: string): Promise<{
      isSafe: boolean;
      risk?: string;
    }>;
    // 合约审计
    auditContract?(address: string, code: string): Promise<{
      issues: Array<{
        severity: 'low' | 'medium' | 'high';
        description: string;
        location?: string;
      }>;
    }>;
  };

  // 监控告警扩展点
  monitoring?: {
    // 自定义指标监控
    monitorMetric?(name: string, value: any): Promise<{
      status: 'normal' | 'warning' | 'critical';
      threshold?: number;
    }>;
    // 告警规则
    defineAlertRule?(rule: any): Promise<{
      id: string;
      condition: string;
      action: string;
    }>;
    // 告警处理
    handleAlert?(alert: any): Promise<void>;
  };

  // 报告生成扩展点
  reporting?: {
    // 生成报告
    generateReport?(type: string, data: any): Promise<{
      content: string;
      format: 'pdf' | 'html' | 'json';
    }>;
    // 自定义报告模板
    defineTemplate?(name: string, template: any): Promise<void>;
    // 报告导出
    exportReport?(report: any, format: string): Promise<Buffer>;
  };

  // 合规检查扩展点
  compliance?: {
    // 交易合规性检查
    checkCompliance?(tx: any): Promise<{
      compliant: boolean;
      violations?: string[];
    }>;
    // 生成合规报告
    generateComplianceReport?(period: string): Promise<{
      report: any;
      issues: any[];
    }>;
    // 更新合规规则
    updateComplianceRules?(rules: any[]): Promise<void>;
  };
}

export interface PluginHooks {
  // 链状态变化
  onChainStateChange?(state: any): Promise<void>;
  // 新区块
  onNewBlock?(block: any): Promise<void>;
  // 新交易
  onNewTransaction?(tx: any): Promise<void>;
  // 市场数据更新
  onMarketDataUpdate?(data: any): Promise<void>;
  // 风险警报
  onRiskAlert?(alert: any): Promise<void>;
  // 系统事件
  onSystemEvent?(event: any): Promise<void>;
}

export interface PluginUtils {
  // 常用工具函数
  formatNumber(num: number, decimals?: number): string;
  formatDate(date: Date, format?: string): string;
  parseAmount(amount: string, decimals?: number): BigInt;
  validateAddress(address: string, protocol?: ChainProtocol): boolean;
  calculateHash(data: any): string;
  encodeABI(method: string, params: any[]): string;
  decodeABI(data: string): { method: string; params: any[] };
}

export interface PluginBase {
  readonly context: PluginContext;
  readonly api: PluginAPI;
  readonly hooks: PluginHooks;
  readonly utils: PluginUtils;
}

export { PluginContext, PluginAPI, PluginHooks, PluginUtils, PluginBase }; 