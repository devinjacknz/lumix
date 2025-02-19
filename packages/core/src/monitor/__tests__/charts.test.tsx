import React from 'react';
import { render } from '@testing-library/react';
import { LineChart, GaugeChart, PieChart, PerformanceCharts } from '../charts';
import { MonitorDataPoint } from '../realtime';
import * as echarts from 'echarts';

// Mock echarts
jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: jest.fn(),
    resize: jest.fn(),
    dispose: jest.fn()
  }))
}));

describe('LineChart', () => {
  const mockData = [
    { timestamp: 1000, value: 50 },
    { timestamp: 2000, value: 75 }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with default props', () => {
    render(<LineChart data={mockData} name="Test Chart" />);
    expect(echarts.init).toHaveBeenCalled();
  });

  test('renders with custom props', () => {
    render(
      <LineChart
        data={mockData}
        name="Test Chart"
        unit="%"
        title="Custom Title"
        theme="dark"
        height={400}
        maxPoints={200}
      />
    );
    expect(echarts.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), 'dark');
  });

  test('disposes chart on unmount', () => {
    const mockDispose = jest.fn();
    (echarts.init as jest.Mock).mockReturnValueOnce({
      setOption: jest.fn(),
      resize: jest.fn(),
      dispose: mockDispose
    });

    const { unmount } = render(<LineChart data={mockData} name="Test Chart" />);
    unmount();
    expect(mockDispose).toHaveBeenCalled();
  });
});

describe('GaugeChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with default props', () => {
    render(<GaugeChart value={50} name="Test Gauge" />);
    expect(echarts.init).toHaveBeenCalled();
  });

  test('renders with custom props', () => {
    render(
      <GaugeChart
        value={75}
        name="Test Gauge"
        min={20}
        max={150}
        unit="MB"
        thresholds={[
          { value: 50, color: '#green' },
          { value: 100, color: '#red' }
        ]}
        title="Custom Gauge"
        theme="dark"
        height={400}
      />
    );
    expect(echarts.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), 'dark');
  });
});

describe('PieChart', () => {
  const mockData = [
    { name: 'A', value: 30 },
    { name: 'B', value: 70 }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with default props', () => {
    render(<PieChart data={mockData} />);
    expect(echarts.init).toHaveBeenCalled();
  });

  test('renders with custom props', () => {
    render(
      <PieChart
        data={mockData}
        title="Custom Pie"
        theme="dark"
        height={400}
      />
    );
    expect(echarts.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), 'dark');
  });
});

describe('PerformanceCharts', () => {
  const mockData: MonitorDataPoint[] = [{
    timestamp: 1000,
    metrics: {
      'system.cpu.usage': 50,
      'system.memory.usage': 60,
      'system.disk.usage': 70,
      'system.network.connections': 80
    },
    resources: {
      cpu: 50,
      memory: 60,
      disk: 70,
      network: 80
    },
    performance: {
      activeTraces: 100,
      activeSpans: 1000,
      errorRate: 0.01,
      avgDuration: 100
    }
  }];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with default props', () => {
    render(<PerformanceCharts data={mockData} />);
    expect(echarts.init).toHaveBeenCalled();
  });

  test('renders with custom props', () => {
    render(
      <PerformanceCharts
        data={mockData}
        theme="dark"
        height={400}
        maxPoints={200}
      />
    );
    expect(echarts.init).toHaveBeenCalledWith(expect.any(HTMLDivElement), 'dark');
  });
}); 