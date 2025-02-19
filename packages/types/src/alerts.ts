export enum AlertType {
  SYSTEM = 'system',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  TRANSACTION = 'transaction',
  MARKET = 'market',
  PLUGIN = 'plugin',
  EMERGENCY = 'emergency'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  source: string;
  details?: Record<string, any>;
}

export interface AlertConfig {
  enabled: boolean;
  severity: AlertSeverity[];
  types: AlertType[];
  filters?: AlertFilter[];
  handlers?: AlertHandler[];
}

export interface AlertFilter {
  type?: AlertType;
  severity?: AlertSeverity;
  source?: string;
  condition?: (alert: Alert) => boolean;
}

export interface AlertHandler {
  handle: (alert: Alert) => Promise<void>;
}

export interface AlertSubscription {
  id: string;
  config: AlertConfig;
  callback: (alert: Alert) => Promise<void>;
} 