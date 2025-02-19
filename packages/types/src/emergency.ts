import { Alert } from './alerts';
import { RiskAssessment } from './risk';

export const EMERGENCY_TYPES = ['market_crash', 'network_outage', 'system_failure'] as const;
export type EmergencyType = typeof EMERGENCY_TYPES[number];
export type EmergencyLevel = 'critical' | 'high' | 'medium' | 'low';
export type EmergencyStepStatus = 'pending' | 'confirmed' | 'failed';
export type EmergencyEventStatus = 'detected' | 'analyzing' | 'responding' | 'recovering' | 'resolved';

export interface EmergencyConfig {
  thresholds: {
    criticalLoss: string;
    maxDrawdown: number;
    minLiquidity: string;
    maxGasPrice: string;
    responseTimeout: number;
    value: string;
    gas: string;
  };
  recoveryStrategies: {
    [key in EmergencyType]: RecoveryStrategy[];
  };
  notifications: {
    channels: NotificationChannel[];
    priorityLevels: {
      [key in EmergencyLevel]: NotificationConfig;
    };
  };
  maxAttempts: number;
  timeout: number;
  approvalRequired: boolean;
  autoRetry: boolean;
  notificationChannels: string[];
}

export interface EmergencyEvent {
  id: string;
  type: EmergencyType;
  level: EmergencyLevel;
  status: EmergencyEventStatus;
  timestamp: number;
  details: Record<string, any>;
  steps: EmergencyStep[];
  alerts: Alert[];
  assessments: RiskAssessment[];
}

export interface EmergencyStep {
  id: string;
  type: string;
  status: EmergencyStepStatus;
  startTime: number;
  endTime?: number;
  error?: string;
  details?: Record<string, any>;
  retryCount?: number;
  maxAttempts?: number;
}

export interface RecoveryStrategy {
  type: string;
  priority: number;
  conditions: Record<string, any>;
  actions: EmergencyAction[];
}

export interface EmergencyAction {
  type: string;
  params: Record<string, any>;
  retryAttempts?: number;
  timeout?: number;
}

export interface NotificationChannel {
  id: string;
  type: 'email' | 'slack' | 'telegram' | 'webhook';
  config: {
    endpoint: string;
    credentials?: Record<string, string>;
    format?: string;
  };
  enabled: boolean;
}

export interface NotificationConfig {
  channels: string[];
  template: string;
  delay: number;
  retryCount: number;
  maxRetries: number;
  interval: number;
  format?: string;
  priority?: number;
  enabled?: boolean;
  conditions?: {
    severity?: EmergencyLevel[];
    types?: EmergencyType[];
    sources?: string[];
  };
} 