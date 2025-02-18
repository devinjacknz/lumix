import React, { useEffect, useRef } from 'react';
import { Card, Statistic, Row, Col, Badge } from 'antd';
import * as echarts from 'echarts';
import { ChainStatusData } from '../../types';

interface ChainStatusProps {
  data: ChainStatusData['data'];
  theme: 'light' | 'dark';
}

export const ChainStatus: React.FC<ChainStatusProps> = ({ data, theme }) => {
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
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: {
          data: ['区块高度', 'Gas 价格', 'TPS']
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
            name: '区块高度',
            position: 'left'
          },
          {
            type: 'value',
            name: 'Gas 价格',
            position: 'right'
          }
        ],
        series: [
          {
            name: '区块高度',
            type: 'line',
            data: data.history.blockNumbers,
            smooth: true
          },
          {
            name: 'Gas 价格',
            type: 'line',
            yAxisIndex: 1,
            data: data.history.gasPrices.map(p => Number(p)),
            smooth: true
          },
          {
            name: 'TPS',
            type: 'line',
            data: data.history.tps,
            smooth: true
          }
        ]
      };

      chart.current.setOption(option);
    }
  }, [data, theme]);

  return (
    <Card title="链状态监控" bordered={false}>
      <Row gutter={[16, 16]}>
        {Object.entries(data.states).map(([chainId, state]) => (
          <Col span={8} key={chainId}>
            <Card size="small" title={`Chain ${chainId}`}>
              <Badge
                status={state.syncing ? 'processing' : 'success'}
                text={state.syncing ? '同步中' : '已同步'}
              />
              <Statistic
                title="区块高度"
                value={state.blockNumber}
                precision={0}
              />
              <Statistic
                title="Gas 价格"
                value={Number(state.gasPrice)}
                precision={2}
                suffix="Gwei"
              />
              <Statistic
                title="TPS"
                value={state.tps}
                precision={1}
              />
              <Statistic
                title="延迟"
                value={state.latency}
                precision={0}
                suffix="ms"
              />
            </Card>
          </Col>
        ))}
      </Row>
      <div ref={chartRef} style={{ height: '400px', marginTop: '16px' }} />
    </Card>
  );
}; 