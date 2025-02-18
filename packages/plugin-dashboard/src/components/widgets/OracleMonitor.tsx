import React, { useEffect, useRef } from 'react';
import { Card, Alert, Table, Progress, Space } from 'antd';
import * as echarts from 'echarts';
import { OracleData } from '../../types';

interface OracleMonitorProps {
  data: OracleData['data'];
  theme: 'light' | 'dark';
}

export const OracleMonitor: React.FC<OracleMonitorProps> = ({ data, theme }) => {
  const priceChartRef = useRef<HTMLDivElement>(null);
  const trustChartRef = useRef<HTMLDivElement>(null);
  const priceChart = useRef<echarts.ECharts>();
  const trustChart = useRef<echarts.ECharts>();

  useEffect(() => {
    if (priceChartRef.current && trustChartRef.current) {
      priceChart.current = echarts.init(priceChartRef.current, theme);
      trustChart.current = echarts.init(trustChartRef.current, theme);
      return () => {
        priceChart.current?.dispose();
        trustChart.current?.dispose();
      };
    }
  }, [theme]);

  useEffect(() => {
    if (priceChart.current) {
      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: Object.keys(data.history.prices)
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: data.history.timestamps.map(t => new Date(t).toLocaleTimeString())
        },
        yAxis: {
          type: 'value',
          name: '价格'
        },
        series: Object.entries(data.history.prices).map(([symbol, prices]) => ({
          name: symbol,
          type: 'line',
          data: prices.map(p => Number(p)),
          smooth: true
        }))
      };

      priceChart.current.setOption(option);
    }
  }, [data.history.prices, theme]);

  useEffect(() => {
    if (trustChart.current) {
      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: ['异常数', '信任分数']
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: data.history.timestamps.map(t => new Date(t).toLocaleTimeString())
        },
        yAxis: [
          {
            type: 'value',
            name: '异常数',
            min: 0
          },
          {
            type: 'value',
            name: '信任分数',
            min: 0,
            max: 100
          }
        ],
        series: [
          {
            name: '异常数',
            type: 'bar',
            data: data.history.anomalies
          },
          {
            name: '信任分数',
            type: 'line',
            yAxisIndex: 1,
            data: data.history.trustScores,
            smooth: true
          }
        ]
      };

      trustChart.current.setOption(option);
    }
  }, [data.history.anomalies, data.history.trustScores, theme]);

  const columns = [
    {
      title: '来源',
      dataIndex: ['source', 'name'],
      key: 'source'
    },
    {
      title: '状态',
      dataIndex: ['source', 'status'],
      key: 'status',
      render: (status: string) => (
        <Alert
          message={status}
          type={
            status === 'active' ? 'success' :
            status === 'degraded' ? 'warning' :
            'error'
          }
          showIcon
        />
      )
    },
    {
      title: '延迟',
      dataIndex: ['source', 'latency'],
      key: 'latency',
      render: (latency: number) => `${latency}ms`
    },
    {
      title: '信任分数',
      dataIndex: ['source', 'trustScore'],
      key: 'trustScore',
      render: (score: number) => (
        <Progress
          percent={score}
          size="small"
          status={
            score >= 80 ? 'success' :
            score >= 60 ? 'normal' :
            'exception'
          }
        />
      )
    }
  ];

  return (
    <Card title="预言机监控" bordered={false}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Alert
          message={`总数据源: ${data.metrics.totalSources}`}
          description={
            <Space>
              <span>有效数据源: {data.metrics.validSources}</span>
              <span>异常数: {data.metrics.anomalies}</span>
              <span>平均信任分数: {data.metrics.avgTrustScore.toFixed(2)}</span>
            </Space>
          }
          type={
            data.metrics.avgTrustScore >= 80 ? 'success' :
            data.metrics.avgTrustScore >= 60 ? 'info' :
            'warning'
          }
          showIcon
        />

        <Card title="价格走势" size="small">
          <div ref={priceChartRef} style={{ height: '300px' }} />
        </Card>

        <Card title="系统健康度" size="small">
          <div ref={trustChartRef} style={{ height: '300px' }} />
        </Card>

        <Table
          columns={columns}
          dataSource={data.validation.sources.map(source => ({
            key: source.id,
            source
          }))}
          size="small"
        />
      </Space>
    </Card>
  );
}; 