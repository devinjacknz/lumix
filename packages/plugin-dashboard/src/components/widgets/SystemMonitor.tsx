import React from 'react';
import { Card, Alert, Table, Progress, Space, Timeline } from 'antd';
import { SystemData } from '../../types';

interface SystemMonitorProps {
  data: SystemData['data'];
  theme: 'light' | 'dark';
}

export const SystemMonitor: React.FC<SystemMonitorProps> = ({ data, theme }) => {
  const alertColumns = [
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => (
        <Alert
          message={severity.toUpperCase()}
          type={
            severity === 'critical' ? 'error' :
            severity === 'error' ? 'error' :
            severity === 'warning' ? 'warning' :
            'info'
          }
          showIcon
          style={{ width: 'fit-content' }}
        />
      )
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message'
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: number) =>
        new Date(timestamp).toLocaleString()
    },
    {
      title: '状态',
      dataIndex: 'acknowledged',
      key: 'acknowledged',
      render: (acknowledged: boolean) => (
        <Alert
          message={acknowledged ? '已确认' : '未确认'}
          type={acknowledged ? 'success' : 'warning'}
          showIcon
          style={{ width: 'fit-content' }}
        />
      )
    }
  ];

  return (
    <Card title="系统监控" bordered={false}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Alert
          message={`系统状态: ${data.health.status.toUpperCase()}`}
          description={
            <Space direction="vertical">
              <span>运行时间: {formatUptime(data.health.uptime)}</span>
              <span>最后更新: {new Date(data.health.lastUpdate).toLocaleString()}</span>
            </Space>
          }
          type={
            data.health.status === 'healthy' ? 'success' :
            data.health.status === 'degraded' ? 'warning' :
            'error'
          }
          showIcon
        />

        <Card title="资源使用" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <span>CPU 使用率</span>
              <Progress
                percent={data.resources.cpu}
                status={
                  data.resources.cpu >= 90 ? 'exception' :
                  data.resources.cpu >= 70 ? 'normal' :
                  'success'
                }
              />
            </div>
            <div>
              <span>内存使用率</span>
              <Progress
                percent={data.resources.memory}
                status={
                  data.resources.memory >= 90 ? 'exception' :
                  data.resources.memory >= 70 ? 'normal' :
                  'success'
                }
              />
            </div>
            <div>
              <span>磁盘使用率</span>
              <Progress
                percent={data.resources.disk}
                status={
                  data.resources.disk >= 90 ? 'exception' :
                  data.resources.disk >= 70 ? 'normal' :
                  'success'
                }
              />
            </div>
            <div>
              <span>网络流量</span>
              <Space>
                <span>↑ {formatBytes(data.resources.network.tx)}/s</span>
                <span>↓ {formatBytes(data.resources.network.rx)}/s</span>
              </Space>
            </div>
          </Space>
        </Card>

        <Card title="组件状态" size="small">
          <Space wrap>
            {Object.entries(data.health.components).map(([name, info]) => (
              <Alert
                key={name}
                message={name}
                description={info.message}
                type={
                  info.status === 'healthy' ? 'success' :
                  info.status === 'degraded' ? 'warning' :
                  'error'
                }
                showIcon
              />
            ))}
          </Space>
        </Card>

        <Card title="系统告警" size="small">
          <Table
            columns={alertColumns}
            dataSource={data.alerts.map(alert => ({
              key: alert.id,
              ...alert
            }))}
            size="small"
            pagination={{ pageSize: 5 }}
          />
        </Card>

        <Card title="系统日志" size="small">
          <Timeline
            items={data.logs.map(log => ({
              color: 
                log.level === 'error' ? 'red' :
                log.level === 'warn' ? 'orange' :
                log.level === 'info' ? 'blue' :
                'gray',
              children: (
                <Space direction="vertical" size={0}>
                  <Space>
                    <span style={{ color: theme === 'dark' ? '#999' : '#666' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span style={{ 
                      color: theme === 'dark' ? '#ccc' : '#333',
                      fontWeight: 'bold'
                    }}>
                      [{log.module}]
                    </span>
                  </Space>
                  <span>{log.message}</span>
                </Space>
              )
            }))}
          />
        </Card>
      </Space>
    </Card>
  );
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
} 