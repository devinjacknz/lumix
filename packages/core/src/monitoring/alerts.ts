import { ChainType } from '../config/types';
import { logger } from '../logger';
import { messagingMiddleware } from '../messaging';
import { EventType } from '../messaging/types';

// Create logger instance
const loggerInstance = logger.createLogger();

// Alert severity levels
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Alert status
export enum AlertStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  ACKNOWLEDGED = 'acknowledged'
}

// Alert interface
export interface Alert {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Alert manager class
export class AlertManager {
  private static instance: AlertManager;
  private alerts: Map<string, Alert>;
  private logger = loggerInstance;

  private constructor() {
    this.alerts = new Map();
  }

  public static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }

  // Create new alert
  createAlert(alert: Omit<Alert, 'id' | 'timestamp'>): Alert {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newAlert = { ...alert, id, timestamp };
    
    this.alerts.set(id, newAlert);
    this.logger.info(`Created alert: ${id}`, { alert: newAlert });
    
    return newAlert;
  }

  // Update alert status
  updateAlertStatus(id: string, status: AlertStatus): Alert | null {
    const alert = this.alerts.get(id);
    if (!alert) {
      this.logger.warn(`Alert not found: ${id}`);
      return null;
    }

    const updatedAlert = { ...alert, status };
    this.alerts.set(id, updatedAlert);
    this.logger.info(`Updated alert status: ${id}`, { alert: updatedAlert });
    
    return updatedAlert;
  }

  // Get alert by ID
  getAlert(id: string): Alert | null {
    return this.alerts.get(id) || null;
  }

  // Get all alerts
  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  // Get alerts by status
  getAlertsByStatus(status: AlertStatus): Alert[] {
    return this.getAllAlerts().filter(alert => alert.status === status);
  }

  // Get alerts by severity
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return this.getAllAlerts().filter(alert => alert.severity === severity);
  }

  // Delete alert
  deleteAlert(id: string): boolean {
    const deleted = this.alerts.delete(id);
    if (deleted) {
      this.logger.info(`Deleted alert: ${id}`);
    } else {
      this.logger.warn(`Failed to delete alert: ${id}`);
    }
    return deleted;
  }

  // Clear all alerts
  clearAlerts(): void {
    this.alerts.clear();
    this.logger.info('Cleared all alerts');
  }
} 