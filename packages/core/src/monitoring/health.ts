import { LumixError } from '../errors/base';
import { PerformanceMonitor } from './metrics';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  details: Record<string, {
    status: 'up' | 'down' | 'degraded';
    latency?: number;
    error?: string;
    lastChecked: number;
  }>;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<void>;
}

export class HealthMonitor {
  private static instance: HealthMonitor;
  private checks: Map<string, HealthCheck> = new Map();
  private results: Map<string, HealthCheckResult['details'][string]> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  registerCheck(name: string, check: () => Promise<void>): void {
    this.checks.set(name, { name, check });
  }

  async runCheck(name: string): Promise<void> {
    const check = this.checks.get(name);
    if (!check) {
      throw new LumixError('HEALTH_CHECK_ERROR', `Health check '${name}' not found`);
    }

    const startTime = Date.now();
    try {
      await check.check();
      const latency = Date.now() - startTime;
      
      this.results.set(name, {
        status: 'up',
        latency,
        lastChecked: Date.now()
      });

      PerformanceMonitor.recordValue(`health_check_${name}_latency`, latency);
    } catch (error) {
      this.results.set(name, {
        status: 'down',
        error: error instanceof Error ? error.message : String(error),
        lastChecked: Date.now()
      });

      PerformanceMonitor.recordValue(`health_check_${name}_failure`, 1);
    }
  }

  async runAllChecks(): Promise<HealthCheckResult> {
    const checkPromises = Array.from(this.checks.keys()).map(name => 
      this.runCheck(name).catch(error => {
        console.error(`Error running health check '${name}':`, error);
      })
    );

    await Promise.all(checkPromises);

    const details: HealthCheckResult['details'] = {};
    let hasFailures = false;
    let hasWarnings = false;

    this.results.forEach((result, name) => {
      details[name] = result;
      if (result.status === 'down') hasFailures = true;
      if (result.status === 'degraded') hasWarnings = true;
    });

    return {
      status: hasFailures ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy',
      details
    };
  }

  startPeriodicChecks(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.runAllChecks().catch(error => {
        console.error('Error running periodic health checks:', error);
      });
    }, intervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getLastResults(): HealthCheckResult {
    const details: HealthCheckResult['details'] = {};
    let hasFailures = false;
    let hasWarnings = false;

    this.results.forEach((result, name) => {
      details[name] = result;
      if (result.status === 'down') hasFailures = true;
      if (result.status === 'degraded') hasWarnings = true;
    });

    return {
      status: hasFailures ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy',
      details
    };
  }
}

// Example health checks
export const defaultHealthChecks = {
  memory: async () => {
    const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    if (usedMemory > 1024) { // 1GB
      throw new Error('Memory usage too high');
    }
  },

  cpu: async () => {
    // Simple CPU check example
    const startTime = Date.now();
    let count = 0;
    for (let i = 0; i < 1000000; i++) {
      count += i;
    }
    const duration = Date.now() - startTime;
    if (duration > 100) { // 100ms threshold
      throw new Error('CPU performance degraded');
    }
  }
};
