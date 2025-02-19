import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Menu, Card, Row, Col, Statistic, Alert, Button, Space } from 'antd';
import { RealTimeMonitor, MonitorDataPoint } from './realtime';
import { AlertManager, Alert as AlertType, AlertSeverity } from './alert';
import { PerformanceTracer } from '../profiler/tracer';
import { ResourceLimiter } from '../resource/limiter';
import { MetricsCollector } from '../metrics/collector';

const { Header, Content, Sider } = Layout;

/**
 * 面板配置
 */
export interface DashboardConfig {
  // 基础配置
  title?: string;
  theme?: 'light' | 'dark';
  refreshInterval?: number;

  // 组件配置
  monitor?: RealTimeMonitor;
  alertManager?: AlertManager;
  tracer?: PerformanceTracer;
  resourceLimiter?: ResourceLimiter;
  metricsCollector?: MetricsCollector;

  // 布局配置
  layout?: Array<{
    id: string;
    type: 'metrics' | 'resources' | 'alerts' | 'traces';
    title: string;
    span?: number;
  }>;
}

/**
 * 监控面板
 */
export const MonitorDashboard: React.FC<DashboardConfig> = ({
  title = '系统监控',
  theme = 'light',
  refreshInterval = 1000,
  monitor,
  alertManager,
  tracer,
  resourceLimiter,
  metricsCollector,
  layout = [
    { id: 'metrics', type: 'metrics', title: '性能指标', span: 12 },
    { id: 'resources', type: 'resources', title: '资源使用', span: 12 },
    { id: 'alerts', type: 'alerts', title: '告警信息', span: 24 },
    { id: 'traces', type: 'traces', title: '性能追踪', span: 24 }
  ]
}) => {
  // 状态
  const [data, setData] = useState<MonitorDataPoint | null>(null);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [selectedMenu, setSelectedMenu] = useState('dashboard');

  // 更新数据
  useEffect(() => {
    if (!monitor) return;

    const handleData = (point: MonitorDataPoint) => {
      setData(point);
    };

    monitor.on('data', handleData);
    return () => {
      monitor.off('data', handleData);
    };
  }, [monitor]);

  // 更新告警
  useEffect(() => {
    if (!alertManager) return;

    const handleAlert = (alert: AlertType) => {
      setAlerts(prev => [...prev, alert]);
    };

    const handleResolve = (ruleId: string) => {
      setAlerts(prev => prev.filter(a => a.ruleId !== ruleId));
    };

    alertManager.on('alertCreated', handleAlert);
    alertManager.on('alertResolved', handleResolve);

    return () => {
      alertManager.off('alertCreated', handleAlert);
      alertManager.off('alertResolved', handleResolve);
    };
  }, [alertManager]);

  // 渲染指标卡片
  const renderMetricsCard = useCallback(() => {
    if (!data) return null;

    return (
      <Card title="性能指标">
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <Statistic
              title="CPU 使用率"
              value={data.resources.cpu}
              precision={2}
              suffix="%"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="内存使用率"
              value={data.resources.memory}
              precision={2}
              suffix="%"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="磁盘使用率"
              value={data.resources.disk}
              precision={2}
              suffix="%"
            />
          </Col>
        </Row>
      </Card>
    );
  }, [data]);

  // 渲染资源卡片
  const renderResourcesCard = useCallback(() => {
    if (!data) return null;

    return (
      <Card title="资源使用">
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Statistic
              title="活动追踪"
              value={data.performance.activeTraces}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="错误率"
              value={data.performance.errorRate * 100}
              precision={2}
              suffix="%"
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="平均耗时"
              value={data.performance.avgDuration}
              precision={2}
              suffix="ms"
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="网络使用率"
              value={data.resources.network}
              precision={2}
              suffix="%"
            />
          </Col>
        </Row>
      </Card>
    );
  }, [data]);

  // 渲染告警卡片
  const renderAlertsCard = useCallback(() => {
    return (
      <Card
        title="告警信息"
        extra={
          <Space>
            <Button type="primary" onClick={() => setAlerts([])}>
              清除所有
            </Button>
          </Space>
        }
      >
        {alerts.map(alert => (
          <Alert
            key={alert.id}
            message={alert.message}
            type={alert.severity === AlertSeverity.CRITICAL ? 'error' :
              alert.severity === AlertSeverity.ERROR ? 'error' :
              alert.severity === AlertSeverity.WARNING ? 'warning' :
              'info'}
            showIcon
            closable
            onClose={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
            style={{ marginBottom: 8 }}
          />
        ))}
        {alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            暂无告警
          </div>
        )}
      </Card>
    );
  }, [alerts]);

  // 渲染追踪卡片
  const renderTracesCard = useCallback(() => {
    if (!tracer) return null;

    return (
      <Card title="性能追踪">
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          性能追踪功能开发中...
        </div>
      </Card>
    );
  }, [tracer]);

  // 渲染内容
  const renderContent = useCallback(() => {
    if (selectedMenu !== 'dashboard') {
      return (
        <div style={{ padding: 24 }}>
          {selectedMenu} 页面开发中...
        </div>
      );
    }

    return (
      <Row gutter={[16, 16]}>
        {layout.map(item => (
          <Col key={item.id} span={item.span || 24}>
            {item.type === 'metrics' && renderMetricsCard()}
            {item.type === 'resources' && renderResourcesCard()}
            {item.type === 'alerts' && renderAlertsCard()}
            {item.type === 'traces' && renderTracesCard()}
          </Col>
        ))}
      </Row>
    );
  }, [
    selectedMenu,
    layout,
    renderMetricsCard,
    renderResourcesCard,
    renderAlertsCard,
    renderTracesCard
  ]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        display: 'flex',
        alignItems: 'center',
        background: theme === 'dark' ? '#001529' : '#fff'
      }}>
        <div style={{
          color: theme === 'dark' ? '#fff' : '#000',
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          {title}
        </div>
      </Header>
      <Layout>
        <Sider
          theme={theme}
          width={200}
          style={{
            background: theme === 'dark' ? '#001529' : '#fff'
          }}
        >
          <Menu
            mode="inline"
            theme={theme}
            selectedKeys={[selectedMenu]}
            style={{ height: '100%', borderRight: 0 }}
            onSelect={({ key }) => setSelectedMenu(key)}
          >
            <Menu.Item key="dashboard">仪表盘</Menu.Item>
            <Menu.Item key="metrics">指标</Menu.Item>
            <Menu.Item key="resources">资源</Menu.Item>
            <Menu.Item key="alerts">告警</Menu.Item>
            <Menu.Item key="traces">追踪</Menu.Item>
            <Menu.Item key="settings">设置</Menu.Item>
          </Menu>
        </Sider>
        <Layout style={{ padding: '24px' }}>
          <Content style={{
            background: theme === 'dark' ? '#141414' : '#fff',
            padding: 24,
            margin: 0,
            minHeight: 280
          }}>
            {renderContent()}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}; 