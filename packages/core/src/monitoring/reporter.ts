import { logger } from './logger';
import { metricsManager, Metric, MetricType } from './metrics';
import { profiler, ProfilerStats } from './profiler';

export interface ReportConfig {
  enabled: boolean;
  interval: number;
  format: 'json' | 'text';
  metrics: boolean;
  profiler: boolean;
  outputPath?: string;
}

export interface Report {
  timestamp: number;
  metrics?: Metric[];
  profilerStats?: ProfilerStats[];
}

export class Reporter {
  private static instance: Reporter;
  private config: Required<ReportConfig>;
  private timer: NodeJS.Timer | null = null;
  private reports: Report[] = [];

  private constructor(config: Partial<ReportConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      interval: config.interval ?? 60000, // 1 minute
      format: config.format ?? 'json',
      metrics: config.metrics ?? true,
      profiler: config.profiler ?? true,
      outputPath: config.outputPath
    };

    if (this.config.enabled) {
      this.start();
    }
  }

  public static getInstance(config?: Partial<ReportConfig>): Reporter {
    if (!Reporter.instance) {
      Reporter.instance = new Reporter(config);
    }
    return Reporter.instance;
  }

  public start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.generateReport();
    }, this.config.interval);

    logger.info('reporter', 'Started monitoring reporter', {
      interval: this.config.interval,
      format: this.config.format
    });
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('reporter', 'Stopped monitoring reporter');
    }
  }

  private async generateReport(): Promise<void> {
    try {
      const report: Report = {
        timestamp: Date.now()
      };

      if (this.config.metrics) {
        report.metrics = metricsManager.getMetrics();
      }

      if (this.config.profiler) {
        report.profilerStats = profiler.getStats();
      }

      this.reports.push(report);

      // Keep only last 100 reports
      if (this.reports.length > 100) {
        this.reports.splice(0, this.reports.length - 100);
      }

      if (this.config.outputPath) {
        await this.writeReport(report);
      }

      logger.debug('reporter', 'Generated monitoring report', {
        timestamp: report.timestamp,
        metricsCount: report.metrics?.length,
        statsCount: report.profilerStats?.length
      });
    } catch (error) {
      logger.error('reporter', 'Failed to generate report', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async writeReport(report: Report): Promise<void> {
    if (!this.config.outputPath) {
      return;
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const timestamp = new Date(report.timestamp).toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '');

      const filename = path.join(
        this.config.outputPath,
        `report_${timestamp}.${this.config.format}`
      );

      let content: string;
      if (this.config.format === 'json') {
        content = JSON.stringify(report, null, 2);
      } else {
        content = this.formatReportAsText(report);
      }

      await fs.writeFile(filename, content, 'utf8');

      logger.debug('reporter', 'Wrote report to file', { filename });
    } catch (error) {
      logger.error('reporter', 'Failed to write report', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private formatReportAsText(report: Report): string {
    const lines: string[] = [
      `Monitoring Report - ${new Date(report.timestamp).toISOString()}`,
      '----------------------------------------'
    ];

    if (report.metrics) {
      lines.push('\nMetrics:');
      const groupedMetrics = this.groupMetricsByType(report.metrics);

      for (const [type, metrics] of Object.entries(groupedMetrics)) {
        lines.push(`\n${type}:`);
        for (const metric of metrics) {
          const labels = metric.labels
            ? ` {${Object.entries(metric.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(', ')}}`
            : '';
          lines.push(`  ${metric.name}${labels} = ${metric.value}`);
        }
      }
    }

    if (report.profilerStats) {
      lines.push('\nProfiler Statistics:');
      for (const stat of report.profilerStats) {
        lines.push(
          `\n  ${stat.module}:${stat.functionName}`,
          `    Calls: ${stat.calls}`,
          `    Avg Time: ${stat.avgTime.toFixed(2)}ms`,
          `    Min Time: ${stat.minTime}ms`,
          `    Max Time: ${stat.maxTime}ms`
        );
      }
    }

    return lines.join('\n');
  }

  private groupMetricsByType(metrics: Metric[]): Record<MetricType, Metric[]> {
    const result: Partial<Record<MetricType, Metric[]>> = {};

    for (const metric of metrics) {
      if (!result[metric.type]) {
        result[metric.type] = [];
      }
      result[metric.type]!.push(metric);
    }

    return result as Record<MetricType, Metric[]>;
  }

  public getReports(options?: {
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Report[] {
    let reports = [...this.reports];

    if (options) {
      if (options.startTime) {
        reports = reports.filter(r => r.timestamp >= options.startTime!);
      }
      if (options.endTime) {
        reports = reports.filter(r => r.timestamp <= options.endTime!);
      }
      if (options.limit) {
        reports = reports.slice(-options.limit);
      }
    }

    return reports;
  }

  public clearReports(): void {
    this.reports = [];
    logger.info('reporter', 'Cleared all reports');
  }

  public getConfig(): Required<ReportConfig> {
    return { ...this.config };
  }

  public setConfig(config: Partial<ReportConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = {
      ...this.config,
      ...config
    };

    if (wasEnabled && !this.config.enabled) {
      this.stop();
    } else if (!wasEnabled && this.config.enabled) {
      this.start();
    }

    logger.info('reporter', 'Updated reporter configuration', config);
  }
}

export const reporter = Reporter.getInstance(); 