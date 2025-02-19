import React, { useEffect, useRef } from 'react';
import { Card, Table, Tag, Descriptions } from 'antd';
import * as d3 from 'd3';
import { ProtocolAnalysisData } from '../../types';

interface ProtocolGraphProps {
  data: ProtocolAnalysisData['data'];
  theme: 'light' | 'dark';
}

export const ProtocolGraph: React.FC<ProtocolGraphProps> = ({ data, theme }) => {
  const graphRef = useRef<SVGSVGElement>(null);
  const simulation = useRef<d3.Simulation<any, any>>();

  useEffect(() => {
    if (graphRef.current) {
      const svg = d3.select(graphRef.current);
      const width = svg.node()?.getBoundingClientRect().width || 800;
      const height = 600;

      // 清理旧图形
      svg.selectAll('*').remove();

      // 创建力导向图
      simulation.current = d3.forceSimulation(data.graph.nodes)
        .force('link', d3.forceLink(data.graph.edges)
          .id((d: any) => d.id)
          .distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(50));

      // 绘制边
      const links = svg.append('g')
        .selectAll('line')
        .data(data.graph.edges)
        .enter()
        .append('line')
        .attr('stroke', theme === 'dark' ? '#666' : '#999')
        .attr('stroke-width', (d: any) => Math.sqrt(d.weight));

      // 绘制节点
      const nodes = svg.append('g')
        .selectAll('circle')
        .data(data.graph.nodes)
        .enter()
        .append('circle')
        .attr('r', (d: any) => 5 + d.riskScore * 10)
        .attr('fill', (d: any) => {
          const score = d.riskScore || 0;
          return d3.interpolateReds(score);
        });

      // 添加节点标签
      const labels = svg.append('g')
        .selectAll('text')
        .data(data.graph.nodes)
        .enter()
        .append('text')
        .text((d: any) => d.name)
        .attr('font-size', '12px')
        .attr('fill', theme === 'dark' ? '#fff' : '#000')
        .attr('dx', 12)
        .attr('dy', 4);

      // 更新位置
      simulation.current.on('tick', () => {
        links
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

        nodes
          .attr('cx', (d: any) => d.x)
          .attr('cy', (d: any) => d.y);

        labels
          .attr('x', (d: any) => d.x)
          .attr('y', (d: any) => d.y);
      });

      // 添加交互
      nodes
        .on('mouseover', (event, d: any) => {
          nodes.attr('opacity', 0.3);
          labels.attr('opacity', 0.3);
          links.attr('opacity', 0.1);

          const node = d3.select(event.currentTarget);
          const nodeLabel = labels.filter((l: any) => l.id === d.id);
          const connectedLinks = links.filter((l: any) =>
            l.source.id === d.id || l.target.id === d.id
          );
          const connectedNodes = nodes.filter((n: any) =>
            connectedLinks.data().some((l: any) =>
              l.source.id === n.id || l.target.id === n.id
            )
          );
          const connectedLabels = labels.filter((l: any) =>
            connectedLinks.data().some((link: any) =>
              link.source.id === l.id || link.target.id === l.id
            )
          );

          node.attr('opacity', 1);
          nodeLabel.attr('opacity', 1);
          connectedLinks.attr('opacity', 1);
          connectedNodes.attr('opacity', 1);
          connectedLabels.attr('opacity', 1);
        })
        .on('mouseout', () => {
          nodes.attr('opacity', 1);
          labels.attr('opacity', 1);
          links.attr('opacity', 1);
        });

      return () => {
        simulation.current?.stop();
      };
    }
  }, [data, theme]);

  const columns = [
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol'
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={
          type === 'error' ? 'red' :
          type === 'warning' ? 'orange' :
          'blue'
        }>{type}</Tag>
      )
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: number) =>
        new Date(timestamp).toLocaleString()
    },
    {
      title: '详情',
      dataIndex: 'data',
      key: 'data',
      render: (data: any) => (
        <pre style={{ maxHeight: '100px', overflow: 'auto' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )
    }
  ];

  return (
    <Card title="协议关联分析" bordered={false}>
      <Descriptions bordered size="small">
        <Descriptions.Item label="总协议数">
          {data.metrics.totalProtocols}
        </Descriptions.Item>
        <Descriptions.Item label="总锁仓价值">
          {Number(data.metrics.totalValue).toLocaleString()} USD
        </Descriptions.Item>
        <Descriptions.Item label="风险评分">
          {data.metrics.riskScore.toFixed(2)}
        </Descriptions.Item>
        <Descriptions.Item label="活跃用户">
          {data.metrics.activeUsers.toLocaleString()}
        </Descriptions.Item>
      </Descriptions>

      <svg
        ref={graphRef}
        style={{
          width: '100%',
          height: '600px',
          marginTop: '16px',
          border: `1px solid ${theme === 'dark' ? '#303030' : '#f0f0f0'}`
        }}
      />

      <Table
        title={() => '最近事件'}
        columns={columns}
        dataSource={data.events}
        size="small"
        pagination={{ pageSize: 5 }}
        style={{ marginTop: '16px' }}
      />
    </Card>
  );
}; 