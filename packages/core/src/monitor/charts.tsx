import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Card } from 'antd';
import { MonitorDataPoint } from './realtime';

/**
 * 图表配置
 */
export interface ChartConfig {
  title?: string;
  theme?: 'light' | 'dark';
  height?: number;
  maxPoints?: number;
}

/**
 * 折线图属性
 */
export interface LineChartProps extends ChartConfig {
  data: Array<{
    timestamp: number;
    value: number;
  }>;
  name: string;
  unit?: string;
}

/**
 * 折线图
 */
export const LineChart: React.FC<LineChartProps> = ({
  data,
  name,
  unit = '',
  title,
  theme = 'light',
  height = 300,
  maxPoints = 100
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts>();

  useEffect(() => {
    if (chartRef.current) {
      chart.current = echarts.init(chartRef.current, theme);
      return () => chart.current?.dispose();
    }
  }, [theme]);

  useEffect(() => {
    if (chart.current) {
      const option = {
        title: title ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#fff' : '#000'
          }
        } : undefined,
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const [param] = params;
            return `${new Date(param.value[0]).toLocaleTimeString()}<br/>
              ${param.seriesName}: ${param.value[1]}${unit}`;
          }
        },
        xAxis: {
          type: 'time',
          splitLine: {
            show: false
          }
        },
        yAxis: {
          type: 'value',
          name: unit,
          splitLine: {
            lineStyle: {
              color: theme === 'dark' ? '#333' : '#eee'
            }
          }
        },
        series: [{
          name,
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: data.slice(-maxPoints).map(d => [d.timestamp, d.value])
        }]
      };

      chart.current.setOption(option);
    }
  }, [data, name, unit, title, theme, maxPoints]);

  return (
    <div ref={chartRef} style={{ height }} />
  );
};

/**
 * 仪表盘属性
 */
export interface GaugeChartProps extends ChartConfig {
  value: number;
  name: string;
  min?: number;
  max?: number;
  unit?: string;
  thresholds?: Array<{
    value: number;
    color: string;
  }>;
}

/**
 * 仪表盘
 */
export const GaugeChart: React.FC<GaugeChartProps> = ({
  value,
  name,
  min = 0,
  max = 100,
  unit = '',
  thresholds = [
    { value: 60, color: '#91cc75' },
    { value: 80, color: '#fac858' },
    { value: 100, color: '#ee6666' }
  ],
  title,
  theme = 'light',
  height = 300
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts>();

  useEffect(() => {
    if (chartRef.current) {
      chart.current = echarts.init(chartRef.current, theme);
      return () => chart.current?.dispose();
    }
  }, [theme]);

  useEffect(() => {
    if (chart.current) {
      const option = {
        title: title ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#fff' : '#000'
          }
        } : undefined,
        series: [{
          type: 'gauge',
          name,
          min,
          max,
          progress: {
            show: true,
            roundCap: true,
            width: 18
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 18,
              color: thresholds.map((t, i, arr) => [
                t.value / max,
                t.color
              ])
            }
          },
          pointer: {
            icon: 'path://M2090.36389,615.30999 L2090.36389,615.30999 C2091.48372,615.30999 2092.40383,616.194028 2092.44859,617.312956 L2096.90698,728.755929 C2097.05155,732.369577 2094.2393,735.416212 2090.62566,735.56078 C2090.53845,735.564269 2090.45117,735.566014 2090.36389,735.566014 L2090.36389,735.566014 C2086.74736,735.566014 2083.81557,732.63423 2083.81557,729.017692 C2083.81557,728.930412 2083.81732,728.84314 2083.82081,728.755929 L2088.2792,617.312956 C2088.32396,616.194028 2089.24407,615.30999 2090.36389,615.30999 Z',
            length: '75%',
            width: 16,
            offsetCenter: [0, 0]
          },
          axisTick: {
            show: false
          },
          splitLine: {
            show: false
          },
          axisLabel: {
            show: false
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 25,
            itemStyle: {
              color: '#999'
            }
          },
          title: {
            show: true,
            fontSize: 14
          },
          detail: {
            valueAnimation: true,
            fontSize: 20,
            offsetCenter: [0, '70%'],
            formatter: `{value}${unit}`,
            color: 'inherit'
          },
          data: [{
            value,
            name
          }]
        }]
      };

      chart.current.setOption(option);
    }
  }, [value, name, min, max, unit, thresholds, title, theme]);

  return (
    <div ref={chartRef} style={{ height }} />
  );
};

/**
 * 饼图属性
 */
export interface PieChartProps extends ChartConfig {
  data: Array<{
    name: string;
    value: number;
  }>;
}

/**
 * 饼图
 */
export const PieChart: React.FC<PieChartProps> = ({
  data,
  title,
  theme = 'light',
  height = 300
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts>();

  useEffect(() => {
    if (chartRef.current) {
      chart.current = echarts.init(chartRef.current, theme);
      return () => chart.current?.dispose();
    }
  }, [theme]);

  useEffect(() => {
    if (chart.current) {
      const option = {
        title: title ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#fff' : '#000'
          }
        } : undefined,
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
          textStyle: {
            color: theme === 'dark' ? '#fff' : '#000'
          }
        },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: theme === 'dark' ? '#000' : '#fff',
            borderWidth: 2
          },
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data
        }]
      };

      chart.current.setOption(option);
    }
  }, [data, title, theme]);

  return (
    <div ref={chartRef} style={{ height }} />
  );
};

/**
 * 性能图表属性
 */
export interface PerformanceChartsProps extends ChartConfig {
  data: MonitorDataPoint[];
}

/**
 * 性能图表
 */
export const PerformanceCharts: React.FC<PerformanceChartsProps> = ({
  data,
  theme = 'light',
  height = 300,
  maxPoints = 100
}) => {
  return (
    <Card>
      <LineChart
        title="CPU 使用率"
        data={data.map(d => ({
          timestamp: d.timestamp,
          value: d.resources.cpu
        }))}
        name="CPU"
        unit="%"
        theme={theme}
        height={height}
        maxPoints={maxPoints}
      />
      <LineChart
        title="内存使用率"
        data={data.map(d => ({
          timestamp: d.timestamp,
          value: d.resources.memory
        }))}
        name="Memory"
        unit="%"
        theme={theme}
        height={height}
        maxPoints={maxPoints}
      />
      <LineChart
        title="错误率"
        data={data.map(d => ({
          timestamp: d.timestamp,
          value: d.performance.errorRate * 100
        }))}
        name="Error Rate"
        unit="%"
        theme={theme}
        height={height}
        maxPoints={maxPoints}
      />
      <LineChart
        title="平均响应时间"
        data={data.map(d => ({
          timestamp: d.timestamp,
          value: d.performance.avgDuration
        }))}
        name="Response Time"
        unit="ms"
        theme={theme}
        height={height}
        maxPoints={maxPoints}
      />
    </Card>
  );
}; 