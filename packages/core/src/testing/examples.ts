import { TestRunner, Assertions } from './utils';
import { LumixError, ValidationError } from '../errors/base';
import { ErrorHandler } from '../errors/handler';
import { MetricsCollector, PerformanceMonitor } from '../monitoring/metrics';
import { HealthMonitor, defaultHealthChecks } from '../monitoring/health';

// Error handling tests
const errorTests = {
  name: 'Error Handling',
  beforeAll: async () => {
    console.log('Setting up error handling tests...');
  },
  afterAll: async () => {
    console.log('Cleaning up error handling tests...');
  },
  tests: [
    {
      name: 'should handle basic errors correctly',
      fn: async () => {
        const handler = new ErrorHandler();
        let errorCaught = false;

        try {
          await handler.withRetry(async () => {
            throw new ValidationError('Test error');
          });
        } catch (error) {
          errorCaught = true;
          Assertions.assertTrue(error instanceof ValidationError);
        }

        Assertions.assertTrue(errorCaught, 'Error should have been caught');
      }
    },
    {
      name: 'should retry operations correctly',
      fn: async () => {
        const handler = new ErrorHandler({ maxRetries: 3 });
        let attempts = 0;

        await handler.withRetry(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary error');
          }
        });

        Assertions.assertEquals(attempts, 3, 'Should have attempted 3 times');
      }
    }
  ]
};

// Metrics tests
const metricsTests = {
  name: 'Metrics Collection',
  beforeEach: async () => {
    MetricsCollector.getInstance().clearMetrics();
  },
  tests: [
    {
      name: 'should record and retrieve metrics',
      fn: async () => {
        const collector = MetricsCollector.getInstance();
        collector.recordMetric('test_metric', 42, { labels: { type: 'test' } });

        const metrics = collector.getMetrics();
        Assertions.assertEquals(metrics.length, 1);
        Assertions.assertEquals(metrics[0].value, 42);
        Assertions.assertEquals(metrics[0].labels?.type, 'test');
      }
    },
    {
      name: 'should measure async operations',
      fn: async () => {
        await PerformanceMonitor.measureAsyncOperation(
          'test_operation',
          async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        );

        const metrics = MetricsCollector.getInstance().getMetricsByName('test_operation_duration_ms');
        Assertions.assertTrue(metrics.length > 0);
        Assertions.assertTrue(metrics[0].value >= 100);
      }
    }
  ]
};

// Health monitoring tests
const healthTests = {
  name: 'Health Monitoring',
  beforeAll: async () => {
    const monitor = HealthMonitor.getInstance();
    monitor.registerCheck('test_check', async () => {
      // Simple check that always passes
      return;
    });
  },
  tests: [
    {
      name: 'should run health checks successfully',
      fn: async () => {
        const monitor = HealthMonitor.getInstance();
        const results = await monitor.runAllChecks();

        Assertions.assertEquals(results.status, 'healthy');
        Assertions.assertTrue(Object.keys(results.details).length > 0);
      }
    },
    {
      name: 'should detect unhealthy states',
      fn: async () => {
        const monitor = HealthMonitor.getInstance();
        monitor.registerCheck('failing_check', async () => {
          throw new Error('Service unavailable');
        });

        const results = await monitor.runAllChecks();
        Assertions.assertEquals(results.status, 'unhealthy');
        Assertions.assertEquals(results.details['failing_check'].status, 'down');
      }
    }
  ]
};

// Run all tests
async function runTests() {
  const runner = new TestRunner();
  runner.addSuite(errorTests);
  runner.addSuite(metricsTests);
  runner.addSuite(healthTests);

  console.log('Starting test run...');
  const results = await runner.runAll();
  
  // Verify all tests passed
  let allPassed = true;
  results.forEach((suiteResults) => {
    suiteResults.forEach((result) => {
      if (!result.success) {
        allPassed = false;
      }
    });
  });

  if (!allPassed) {
    process.exit(1);
  }
}

// Export for CLI usage
export const runAllTests = runTests;

// Run tests if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  runTests().catch(console.error);
}
