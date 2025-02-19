import {
  Alert,
  AlertType,
  AlertSeverity
} from '@lumix/types';

import {
  EmergencyType,
  EmergencyLevel,
  EmergencyStepStatus,
  EmergencyEventStatus,
  EmergencyConfig,
  EmergencyEvent,
  EmergencyStep,
  RecoveryStrategy,
  EmergencyAction,
  NotificationChannel,
  NotificationConfig,
  EMERGENCY_TYPES
} from '@lumix/types';

import { logger } from '../monitoring/logger';
import { gt, toBigInt } from '../utils/bignumber';
import { ChainTransaction } from '@lumix/types';
import { TransactionAlert } from './transaction-monitor';
import { RiskAssessment, RiskFactor } from './risk-assessor';

// Define interfaces for external dependencies
interface MarketAnalyzer {
  analyzeMarketConditions(): Promise<Alert[]>;
}

interface KnowledgeGraph {
  getRelevantKnowledge(type: EmergencyType): Promise<Record<string, any>>;
}

interface StepExecutor {
  execute(action: string, parameters: Record<string, any>): Promise<void>;
  validate?: (action: string, parameters: Record<string, any>) => Promise<boolean>;
  cleanup?: () => Promise<void>;
}

interface NotificationDelivery {
  channel: NotificationChannel;
  send(content: string, options?: Record<string, any>): Promise<void>;
}

export interface EmergencyResponse {
  id: string;
  status: EmergencyStepStatus;
  steps: EmergencyStep[];
  strategy: RecoveryStrategy;
  metrics: {
    recoveryTime: number;
    successRate: number;
  };
}

export class EmergencyHandler {
  private config: EmergencyConfig;
  private activeEvents: Map<string, EmergencyEvent>;
  private activeResponses: Map<string, EmergencyResponse>;
  private notificationChannels: Map<string, NotificationDelivery>;
  private stepExecutors: Map<string, StepExecutor>;

  constructor(
    config: EmergencyConfig,
    private marketAnalyzer: MarketAnalyzer,
    private knowledgeGraph: KnowledgeGraph
  ) {
    this.config = config;
    this.activeEvents = new Map();
    this.activeResponses = new Map();
    this.notificationChannels = new Map();
    this.stepExecutors = new Map();

    // Debug logs for type verification
    logger.debug('Emergency', 'EmergencyConfig structure:', {
      hasThresholds: !!config.thresholds,
      hasRecoveryStrategies: !!config.recoveryStrategies,
      hasNotifications: !!config.notifications
    });

    this.initializeNotificationChannels();
  }

  private initializeNotificationChannels(): void {
    // Initialize email channel
    const emailChannel: NotificationDelivery = {
      channel: {
        id: 'email',
        type: 'email',
        config: {
          endpoint: this.config.notifications.channels[0].config.endpoint,
          credentials: this.config.notifications.channels[0].config.credentials
        },
        enabled: true
      },
      send: async (content: string) => {
        // Implementation of email sending
        logger.info('Emergency', `Sending email notification: ${content}`);
      }
    };
    this.notificationChannels.set('email', emailChannel);

    // Initialize Slack channel
    const slackChannel: NotificationDelivery = {
      channel: {
        id: 'slack',
        type: 'slack',
        config: {
          endpoint: this.config.notifications.channels[1].config.endpoint,
          credentials: this.config.notifications.channels[1].config.credentials
        },
        enabled: true
      },
      send: async (content: string) => {
        // Implementation of Slack message sending
        logger.info('Emergency', `Sending Slack notification: ${content}`);
      }
    };
    this.notificationChannels.set('slack', slackChannel);
  }

  private async detectEmergency(tx: ChainTransaction): Promise<EmergencyEvent | undefined> {
    try {
      // Check transaction value
      const txValue = tx.value?.toString() || '0';
      const valueThreshold = this.config.thresholds.value;
      if (gt(toBigInt(txValue), toBigInt(valueThreshold))) {
        return {
          id: Date.now().toString(),
          type: 'market_crash',
          level: 'critical',
          status: 'detected',
          timestamp: Date.now(),
          details: {
            description: 'Transaction value exceeds threshold',
            impact: 'High risk of significant loss',
            affectedAssets: [tx.to || ''],
            affectedSystems: ['trading'],
            metrics: {
              value: txValue,
              threshold: valueThreshold
            }
          },
          steps: [],
          alerts: [],
          assessments: []
        };
      }

      // Check gas price
      const txGasPrice = tx.gasPrice?.toString() || '0';
      const gasThreshold = this.config.thresholds.gas;
      if (gt(toBigInt(txGasPrice), toBigInt(gasThreshold))) {
        return {
          id: Date.now().toString(),
          type: 'network_outage',
          level: 'high',
          status: 'detected',
          timestamp: Date.now(),
          details: {
            description: 'Gas price exceeds threshold',
            impact: 'High transaction costs',
            affectedAssets: [],
            affectedSystems: ['network'],
            metrics: {
              gasPrice: txGasPrice,
              threshold: gasThreshold
            }
          },
          steps: [],
          alerts: [],
          assessments: []
        };
      }

      return undefined;
    } catch (error) {
      logger.error('Emergency', 'Error detecting emergency from transaction', { error });
      return undefined;
    }
  }

  private async detectEmergencyFromAlerts(alerts: Alert[]): Promise<EmergencyEvent | undefined> {
    if (alerts.length === 0) {
      return undefined;
    }

    // Analyze alerts and determine emergency type
    const criticalAlerts = alerts.filter(alert => alert.severity === AlertSeverity.CRITICAL);
    if (criticalAlerts.length > 0) {
      return {
        id: Date.now().toString(),
        type: 'market_crash',
        level: 'critical',
        status: 'detected',
        timestamp: Date.now(),
        details: {
          description: 'Critical market conditions detected',
          impact: 'High',
          affectedAssets: criticalAlerts.map(alert => alert.source),
          affectedSystems: ['trading', 'risk'],
          metrics: {}
        },
        steps: [],
        alerts: criticalAlerts,
        assessments: []
      };
    }

    return undefined;
  }

  private async handleEmergency(event: EmergencyEvent): Promise<void> {
    try {
      const strategy = this.selectRecoveryStrategy(event.type);
      const response = this.createEmergencyResponse(event, strategy);
      this.activeResponses.set(response.id, response);

      // Execute recovery steps
      for (const step of response.steps) {
        try {
          const executor = this.getStepExecutor(step.type);
          if (executor) {
            await this.executeStep(step, executor);
          } else {
            throw new Error(`Unknown executor for step type: ${step.type}`);
          }
        } catch (error) {
          // Step failed after retries, continue with next step
          logger.error('Emergency', `Step execution failed: ${step.id}`, { error });
        }
      }

      // Update metrics
      const endTime = Date.now();
      const successfulSteps = response.steps.filter(step => step.status === 'confirmed');
      response.metrics = {
        recoveryTime: endTime - response.steps[0].startTime,
        successRate: (successfulSteps.length / response.steps.length) * 100
      };

      // Send notifications
      await this.notifyEmergency(event);
    } catch (error) {
      logger.error('Emergency', 'Error handling emergency', { error });
    }
  }

  private async notifyEmergency(event: EmergencyEvent): Promise<void> {
    try {
      const config = this.config.notifications.priorityLevels[event.level];
      if (!config) {
        return;
      }

      // Debug logs for notification config
      logger.debug('Emergency', 'Notification config:', {
        hasChannels: Array.isArray(config.channels),
        channelCount: config.channels?.length || 0,
        hasTemplate: !!config.template
      });

      if (!config.channels || config.channels.length === 0) {
        return;
      }

      for (const channelId of config.channels) {
        const delivery = this.notificationChannels.get(channelId);
        if (delivery) {
          try {
            const content = this.formatNotificationContent(event, config);
            await this.deliverNotification(delivery, content);
          } catch (error) {
            logger.error('Emergency', `Failed to send notification to channel: ${channelId}`, { error });
          }
        }
      }
    } catch (error) {
      logger.error('Emergency', 'Error sending notifications', { error });
    }
  }

  private formatNotificationContent(event: EmergencyEvent, config: NotificationConfig): string {
    let content = config.template
      .replace('{{event_id}}', event.id)
      .replace('{{type}}', event.type)
      .replace('{{level}}', event.level)
      .replace('{{status}}', event.status)
      .replace('{{timestamp}}', new Date(event.timestamp).toISOString());

    return content;
  }

  private getStepExecutor(type: string): StepExecutor | undefined {
    return this.stepExecutors.get(type);
  }

  public registerStepExecutor(type: string, executor: StepExecutor): void {
    this.stepExecutors.set(type, executor);
  }

  public registerNotificationChannel(channel: NotificationChannel): void {
    const delivery: NotificationDelivery = {
      channel,
      send: async (content: string) => {
        // Implementation of notification sending
        logger.info('Emergency', `Sending notification to ${channel.type}: ${content}`);
      }
    };
    this.notificationChannels.set(channel.id, delivery);
  }

  public async processAlerts(alerts: Alert[]): Promise<void> {
    const event = await this.detectEmergencyFromAlerts(alerts);
    if (event) {
      await this.handleEmergency(event);
    }
  }

  public async processTransaction(tx: ChainTransaction): Promise<void> {
    const event = await this.detectEmergency(tx);
    if (event) {
      await this.handleEmergency(event);
    }
  }

  private selectRecoveryStrategy(type: EmergencyType): RecoveryStrategy {
    const strategies = this.config.recoveryStrategies[type];
    if (!strategies || strategies.length === 0) {
      // Create a default strategy if none exists
      return {
        type: 'default',
        priority: 0,
        conditions: {},
        actions: []
      };
    }

    // Sort by priority and select the highest priority strategy
    return strategies.sort((a, b) => b.priority - a.priority)[0];
  }

  private async validateStrategyRequirements(
    strategy: RecoveryStrategy
  ): Promise<boolean> {
    try {
      // Check if strategy is valid
      if (!strategy.type || !strategy.actions || strategy.actions.length === 0) {
        return false;
      }

      // Check if all actions are valid
      for (const action of strategy.actions) {
        if (!action.type || !action.params) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Emergency', 'Error validating strategy', { error });
      return false;
    }
  }

  private async executeStep(step: EmergencyStep, executor: StepExecutor): Promise<void> {
    try {
      if (executor.validate) {
        const isValid = await executor.validate(step.type, step.details || {});
        if (!isValid) {
          throw new Error('Step validation failed');
        }
      }

      await executor.execute(step.type, step.details || {});
      step.status = 'confirmed';
      step.endTime = Date.now();
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      step.endTime = Date.now();
      throw error;
    }
  }

  private async executeResponse(response: EmergencyResponse): Promise<void> {
    try {
      response.status = 'pending';
      const startTime = Date.now();

      for (const step of response.steps) {
        try {
          const executor = this.getStepExecutor(step.type);
          if (executor) {
            await this.executeStep(step, executor);
          } else {
            throw new Error(`Unknown executor for step type: ${step.type}`);
          }
        } catch (error) {
          // Step failed after retries, continue with next step
          continue;
        }
      }

      // Update response status based on all steps
      const allStepsConfirmed = response.steps.every(s => s.status === 'confirmed');
      response.status = allStepsConfirmed ? 'confirmed' : 'failed';
      response.metrics.recoveryTime = Date.now() - startTime;
      response.metrics.successRate = response.steps.filter(s => s.status === 'confirmed').length / response.steps.length;
    } catch (error) {
      response.status = 'failed';
      logger.error('Emergency', 'Error executing response', { error });
    }
  }

  public addRecoveryStrategy(strategy: RecoveryStrategy, type: EmergencyType): void {
    if (!this.config.recoveryStrategies[type]) {
      this.config.recoveryStrategies[type] = [];
    }
    this.config.recoveryStrategies[type].push(strategy);
  }

  public getActiveEvents(): EmergencyEvent[] {
    return Array.from(this.activeEvents.values());
  }

  public getActiveResponses(): EmergencyResponse[] {
    return Array.from(this.activeResponses.values());
  }

  public async getEventStatus(eventId: string): Promise<EmergencyEvent | null> {
    return this.activeEvents.get(eventId) || null;
  }

  public async getResponseStatus(eventId: string): Promise<EmergencyResponse | null> {
    return this.activeResponses.get(eventId) || null;
  }

  protected async notifyApprovalRequest(
    step: any,
    response: EmergencyResponse
  ): Promise<void> {
    // 通知逻辑
  }

  protected async waitForApproval(
    step: any,
    response: EmergencyResponse
  ): Promise<boolean> {
    // 等待审批逻辑
    return true;
  }

  private async checkBalance(minBalance: string): Promise<boolean> {
    // Implementation of balance check
    return true;
  }

  private async checkPermissions(permissions: string[]): Promise<boolean> {
    // Implementation of permissions check
    return true;
  }

  private async checkDependencies(dependencies: string[]): Promise<boolean> {
    // Implementation of dependencies check
    return true;
  }

  private async deliverNotification(
    delivery: NotificationDelivery,
    content: string
  ): Promise<void> {
    await delivery.send(content);
  }

  private createEmergencyResponse(event: EmergencyEvent, strategy: RecoveryStrategy): EmergencyResponse {
    const steps: EmergencyStep[] = strategy.actions.map((action, index) => ({
      id: `step_${index + 1}`,
      type: action.type,
      status: 'pending',
      startTime: Date.now(),
      endTime: undefined,
      error: undefined,
      details: action.params,
      retryCount: 0,
      maxAttempts: action.retryAttempts || 3
    }));

    return {
      id: Date.now().toString(),
      status: 'pending',
      steps,
      strategy,
      metrics: {
        recoveryTime: 0,
        successRate: 0
      }
    };
  }

  getResponse(eventId: string): EmergencyResponse | null {
    return this.activeResponses.get(eventId) || null;
  }

  getEvent(eventId: string): EmergencyEvent | null {
    return this.activeEvents.get(eventId) || null;
  }
}

function isStepStatus(status: unknown): status is EmergencyStepStatus {
  return typeof status === 'string' && ['pending', 'confirmed', 'failed'].includes(status);
} 