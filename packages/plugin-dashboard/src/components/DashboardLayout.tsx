import React, { useState, useEffect } from 'react';
import { Layout, Menu, Switch, Space } from 'antd';
import { GridLayout } from 'react-grid-layout';
import { ChainStatus } from './widgets/ChainStatus';
import { ProtocolGraph } from './widgets/ProtocolGraph';
import { OracleMonitor } from './widgets/OracleMonitor';
import { SystemMonitor } from './widgets/SystemMonitor';
import { WidgetType, WidgetLayout as WidgetLayoutType } from '../types';

const { Header, Content } = Layout;

interface DashboardLayoutProps {
  layout: WidgetLayoutType[];
  data: Record<string, any>;
  onLayoutChange?: (layout: WidgetLayoutType[]) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  layout,
  data,
  onLayoutChange
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [currentLayout, setCurrentLayout] = useState(layout);

  useEffect(() => {
    setCurrentLayout(layout);
  }, [layout]);

  const handleLayoutChange = (newLayout: any[]) => {
    const updatedLayout = currentLayout.map(widget => {
      const layoutItem = newLayout.find(item => item.i === widget.id);
      if (layoutItem) {
        return {
          ...widget,
          x: layoutItem.x,
          y: layoutItem.y,
          width: layoutItem.w,
          height: layoutItem.h
        };
      }
      return widget;
    });
    setCurrentLayout(updatedLayout);
    onLayoutChange?.(updatedLayout);
  };

  const renderWidget = (widget: WidgetLayoutType) => {
    const widgetData = data[widget.id];
    if (!widgetData) return null;

    switch (widget.type) {
      case WidgetType.CHAIN_STATUS:
        return <ChainStatus data={widgetData} theme={theme} />;
      case WidgetType.PROTOCOL_GRAPH:
        return <ProtocolGraph data={widgetData} theme={theme} />;
      case WidgetType.ORACLE_PRICES:
        return <OracleMonitor data={widgetData} theme={theme} />;
      case WidgetType.SYSTEM_HEALTH:
        return <SystemMonitor data={widgetData} theme={theme} />;
      default:
        return null;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: theme === 'dark' ? '#1f1f1f' : '#fff'
      }}>
        <div style={{ color: theme === 'dark' ? '#fff' : '#000' }}>
          Lumix 监控仪表盘
        </div>
        <Space>
          <span style={{ color: theme === 'dark' ? '#fff' : '#000' }}>
            主题模式
          </span>
          <Switch
            checked={theme === 'dark'}
            onChange={checked => setTheme(checked ? 'dark' : 'light')}
            checkedChildren="🌙"
            unCheckedChildren="☀️"
          />
        </Space>
      </Header>
      <Content style={{
        padding: '24px',
        background: theme === 'dark' ? '#141414' : '#f0f2f5'
      }}>
        <GridLayout
          className="layout"
          layout={currentLayout.map(widget => ({
            i: widget.id,
            x: widget.x,
            y: widget.y,
            w: widget.width,
            h: widget.height
          }))}
          cols={12}
          rowHeight={30}
          width={1200}
          onLayoutChange={handleLayoutChange}
          draggable
          resizable
        >
          {currentLayout.map(widget => (
            <div key={widget.id}>
              {renderWidget(widget)}
            </div>
          ))}
        </GridLayout>
      </Content>
    </Layout>
  );
}; 