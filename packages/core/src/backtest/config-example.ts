import {
  BacktestConfig,
  DataSourceType,
  TimeResolution,
  StrategyType,
  SignalType,
  IndicatorType,
  MetricType
} from './types';

// 趋势跟踪策略配置示例
export const trendFollowingConfig: BacktestConfig = {
  // 基本配置
  startTime: new Date('2024-01-01T00:00:00Z'),
  endTime: new Date('2024-03-31T23:59:59Z'),
  initialCapital: '10000',
  chains: ['ethereum'],
  tokens: ['WETH', 'WBTC', 'USDC'],

  // 交易配置
  maxPositionSize: '1000',
  maxDrawdown: '0.2',
  slippageTolerance: '0.003',
  gasMultiplier: '1.1',

  // 数据配置
  dataResolution: TimeResolution.HOUR_1,
  dataSource: DataSourceType.HISTORICAL,
  cacheData: true,

  // 策略配置
  strategy: {
    name: 'Trend Following Strategy',
    type: StrategyType.TREND_FOLLOWING,
    parameters: {
      trendPeriod: 20,
      momentumPeriod: 14,
      volatilityPeriod: 20,
      entryThreshold: 0.02,
      exitThreshold: 0.01
    }
  },

  // 指标配置
  indicators: [
    {
      type: IndicatorType.TREND,
      name: 'EMA20',
      inputs: ['close'],
      parameters: {
        period: 20
      }
    },
    {
      type: IndicatorType.TREND,
      name: 'EMA50',
      inputs: ['close'],
      parameters: {
        period: 50
      }
    },
    {
      type: IndicatorType.MOMENTUM,
      name: 'RSI',
      inputs: ['close'],
      parameters: {
        period: 14
      }
    },
    {
      type: IndicatorType.VOLATILITY,
      name: 'BB',
      inputs: ['close'],
      parameters: {
        period: 20,
        stdDev: 2
      }
    }
  ],

  // 信号配置
  signals: [
    {
      type: SignalType.ENTRY,
      conditions: [
        {
          indicator: 'EMA20',
          operator: '>',
          value: 'EMA50'
        },
        {
          indicator: 'RSI',
          operator: '>',
          value: 50
        }
      ],
      actions: [
        {
          type: 'open_long',
          parameters: {
            size: '0.1',
            leverage: '1'
          }
        }
      ]
    },
    {
      type: SignalType.EXIT,
      conditions: [
        {
          indicator: 'EMA20',
          operator: '<',
          value: 'EMA50'
        },
        {
          indicator: 'RSI',
          operator: '<',
          value: 50
        }
      ],
      actions: [
        {
          type: 'close_long',
          parameters: {
            size: 'all'
          }
        }
      ]
    }
  ],

  // 风险管理配置
  riskManagement: {
    stopLoss: '0.05',
    takeProfit: '0.15',
    trailingStop: '0.03',
    maxPositions: 3,
    maxLeverage: '2',
    positionSizing: {
      type: 'fixed_risk',
      parameters: {
        riskPerTrade: '0.02'
      }
    }
  },

  // 性能指标配置
  metrics: [
    {
      type: MetricType.RETURNS,
      parameters: {
        type: 'absolute'
      }
    },
    {
      type: MetricType.DRAWDOWN,
      parameters: {
        type: 'maximum'
      }
    },
    {
      type: MetricType.SHARPE_RATIO,
      parameters: {
        riskFreeRate: '0.04'
      }
    },
    {
      type: MetricType.SORTINO_RATIO,
      parameters: {
        riskFreeRate: '0.04'
      }
    },
    {
      type: MetricType.CALMAR_RATIO,
      parameters: {}
    },
    {
      type: MetricType.WIN_RATE,
      parameters: {}
    },
    {
      type: MetricType.PROFIT_FACTOR,
      parameters: {}
    }
  ]
};

// 均值回归策略配置示例
export const meanReversionConfig: BacktestConfig = {
  // 基本配置
  startTime: new Date('2024-01-01T00:00:00Z'),
  endTime: new Date('2024-03-31T23:59:59Z'),
  initialCapital: '10000',
  chains: ['ethereum'],
  tokens: ['WETH', 'WBTC', 'USDC'],

  // 交易配置
  maxPositionSize: '1000',
  maxDrawdown: '0.15',
  slippageTolerance: '0.002',
  gasMultiplier: '1.1',

  // 数据配置
  dataResolution: TimeResolution.HOUR_4,
  dataSource: DataSourceType.HISTORICAL,
  cacheData: true,

  // 策略配置
  strategy: {
    name: 'Mean Reversion Strategy',
    type: StrategyType.MEAN_REVERSION,
    parameters: {
      lookbackPeriod: 20,
      entryDeviation: 2,
      exitDeviation: 0.5
    }
  },

  // 指标配置
  indicators: [
    {
      type: IndicatorType.PRICE,
      name: 'BB',
      inputs: ['close'],
      parameters: {
        period: 20,
        stdDev: 2
      }
    },
    {
      type: IndicatorType.OSCILLATOR,
      name: 'RSI',
      inputs: ['close'],
      parameters: {
        period: 14
      }
    },
    {
      type: IndicatorType.MOMENTUM,
      name: 'Stochastic',
      inputs: ['high', 'low', 'close'],
      parameters: {
        period: 14,
        smoothK: 3,
        smoothD: 3
      }
    }
  ],

  // 信号配置
  signals: [
    {
      type: SignalType.ENTRY,
      conditions: [
        {
          indicator: 'close',
          operator: '<',
          value: 'BB.lower'
        },
        {
          indicator: 'RSI',
          operator: '<',
          value: 30
        }
      ],
      actions: [
        {
          type: 'open_long',
          parameters: {
            size: '0.1',
            leverage: '1'
          }
        }
      ]
    },
    {
      type: SignalType.EXIT,
      conditions: [
        {
          indicator: 'close',
          operator: '>',
          value: 'BB.middle'
        },
        {
          indicator: 'RSI',
          operator: '>',
          value: 50
        }
      ],
      actions: [
        {
          type: 'close_long',
          parameters: {
            size: 'all'
          }
        }
      ]
    }
  ],

  // 风险管理配置
  riskManagement: {
    stopLoss: '0.03',
    takeProfit: '0.06',
    trailingStop: '0.02',
    maxPositions: 5,
    maxLeverage: '1.5',
    positionSizing: {
      type: 'position_volatility',
      parameters: {
        targetVolatility: '0.02'
      }
    }
  },

  // 性能指标配置
  metrics: [
    {
      type: MetricType.RETURNS,
      parameters: {
        type: 'absolute'
      }
    },
    {
      type: MetricType.DRAWDOWN,
      parameters: {
        type: 'maximum'
      }
    },
    {
      type: MetricType.VOLATILITY,
      parameters: {
        type: 'annualized'
      }
    },
    {
      type: MetricType.SHARPE_RATIO,
      parameters: {
        riskFreeRate: '0.04'
      }
    },
    {
      type: MetricType.INFORMATION_RATIO,
      parameters: {
        benchmark: 'WETH'
      }
    }
  ]
}; 