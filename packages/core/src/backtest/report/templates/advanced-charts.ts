import { ChartConfig } from './charts';

/**
 * 高级图表类型
 */
export enum AdvancedChartType {
  CORRELATION_MATRIX = 'correlation_matrix',
  HEAT_MAP = 'heat_map',
  SCATTER = 'scatter',
  BUBBLE = 'bubble',
  RADAR = 'radar',
  TREE_MAP = 'tree_map',
  SUNBURST = 'sunburst',
  PARALLEL = 'parallel',
  SANKEY = 'sankey',
  CALENDAR = 'calendar'
}

/**
 * 高级图表配置
 */
export interface AdvancedChartConfig extends ChartConfig {
  linkage: boolean;
  brush: boolean;
  timeline: boolean;
  dataView: boolean;
  animation: {
    duration: number;
    easing: string;
  };
}

/**
 * 生成相关性矩阵图
 */
export function generateCorrelationMatrix(config: AdvancedChartConfig): string {
  return `
    function initializeCorrelationMatrix() {
      const chart = echarts.init(document.getElementById('correlation-matrix'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          position: 'top'
        },
        grid: {
          height: '50%',
          top: '10%'
        },
        xAxis: {
          type: 'category',
          data: window.correlationData.assets,
          splitArea: {
            show: true
          }
        },
        yAxis: {
          type: 'category',
          data: window.correlationData.assets,
          splitArea: {
            show: true
          }
        },
        visualMap: {
          min: -1,
          max: 1,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: '15%',
          inRange: {
            color: ['#d73027', '#f7f7f7', '#1a9850']
          }
        },
        series: [{
          name: '相关性',
          type: 'heatmap',
          data: window.correlationData.matrix,
          label: {
            show: true,
            formatter: function(params) {
              return params.value[2].toFixed(2);
            }
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成热力图
 */
export function generateHeatMap(config: AdvancedChartConfig): string {
  return `
    function initializeHeatMap() {
      const chart = echarts.init(document.getElementById('heat-map'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          position: 'top',
          formatter: function(params) {
            return \`\${params.name}: \${params.value[2].toFixed(2)}%\`;
          }
        },
        grid: {
          height: '50%',
          top: '10%'
        },
        xAxis: {
          type: 'category',
          data: window.heatMapData.times,
          splitArea: {
            show: true
          }
        },
        yAxis: {
          type: 'category',
          data: window.heatMapData.assets,
          splitArea: {
            show: true
          }
        },
        visualMap: {
          min: -10,
          max: 10,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: '15%',
          inRange: {
            color: ['#c23531', '#e8e8e8', '#3398db']
          }
        },
        series: [{
          name: '收益率',
          type: 'heatmap',
          data: window.heatMapData.values,
          label: {
            show: true,
            formatter: function(params) {
              return params.value[2].toFixed(1) + '%';
            }
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成散点图
 */
export function generateScatterPlot(config: AdvancedChartConfig): string {
  return `
    function initializeScatterPlot() {
      const chart = echarts.init(document.getElementById('scatter-plot'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          }
        },
        legend: {
          show: ${config.legend},
          data: ['交易']
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          name: '持仓时间',
          nameLocation: 'middle',
          nameGap: 30,
          axisLabel: {
            formatter: '{value}天'
          }
        },
        yAxis: {
          type: 'value',
          name: '收益率',
          nameLocation: 'middle',
          nameGap: 30,
          axisLabel: {
            formatter: '{value}%'
          }
        },
        series: [{
          name: '交易',
          type: 'scatter',
          data: window.scatterData,
          symbolSize: function(data) {
            return Math.sqrt(data[2]) * 5;
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          itemStyle: {
            color: function(params) {
              return params.value[1] >= 0 ? '#28a745' : '#dc3545';
            }
          }
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成雷达图
 */
export function generateRadarChart(config: AdvancedChartConfig): string {
  return `
    function initializeRadarChart() {
      const chart = echarts.init(document.getElementById('radar-chart'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          trigger: 'item'
        },
        legend: {
          show: ${config.legend},
          data: ['策略', '基准']
        },
        radar: {
          indicator: window.radarData.indicators,
          shape: 'circle',
          splitNumber: 5,
          name: {
            textStyle: {
              color: '#999'
            }
          },
          splitLine: {
            lineStyle: {
              color: [
                'rgba(238, 197, 102, 0.1)',
                'rgba(238, 197, 102, 0.2)',
                'rgba(238, 197, 102, 0.4)',
                'rgba(238, 197, 102, 0.6)',
                'rgba(238, 197, 102, 0.8)',
                'rgba(238, 197, 102, 1)'
              ].reverse()
            }
          },
          splitArea: {
            show: false
          },
          axisLine: {
            lineStyle: {
              color: 'rgba(238, 197, 102, 0.5)'
            }
          }
        },
        series: [{
          name: '策略 vs 基准',
          type: 'radar',
          data: [
            {
              value: window.radarData.strategy,
              name: '策略',
              lineStyle: {
                normal: {
                  width: 1
                }
              },
              areaStyle: {
                normal: {
                  opacity: 0.1
                }
              }
            },
            {
              value: window.radarData.benchmark,
              name: '基准',
              lineStyle: {
                normal: {
                  width: 1
                }
              },
              areaStyle: {
                normal: {
                  opacity: 0.05
                }
              }
            }
          ]
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成树图
 */
export function generateTreeMap(config: AdvancedChartConfig): string {
  return `
    function initializeTreeMap() {
      const chart = echarts.init(document.getElementById('tree-map'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          formatter: function(info) {
            const value = info.value;
            const treePathInfo = info.treePathInfo;
            const treePath = [];
            
            for (let i = 1; i < treePathInfo.length; i++) {
              treePath.push(treePathInfo[i].name);
            }
            
            return [
              '<div class="tooltip-title">' + treePath.join('/') + '</div>',
              '规模: ' + value.toFixed(2)
            ].join('');
          }
        },
        series: [{
          name: '持仓分布',
          type: 'treemap',
          visibleMin: 300,
          label: {
            show: true,
            formatter: '{b}'
          },
          upperLabel: {
            show: true,
            height: 30
          },
          itemStyle: {
            normal: {
              borderColor: '#fff'
            }
          },
          levels: [
            {
              itemStyle: {
                normal: {
                  borderColor: '#777',
                  borderWidth: 0,
                  gapWidth: 1
                }
              },
              upperLabel: {
                show: false
              }
            },
            {
              itemStyle: {
                normal: {
                  borderColor: '#555',
                  borderWidth: 5,
                  gapWidth: 1
                },
                emphasis: {
                  borderColor: '#ddd'
                }
              }
            },
            {
              colorSaturation: [0.35, 0.5],
              itemStyle: {
                normal: {
                  borderWidth: 5,
                  gapWidth: 1,
                  borderColorSaturation: 0.6
                }
              }
            }
          ],
          data: window.treeMapData
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成平行坐标图
 */
export function generateParallelChart(config: AdvancedChartConfig): string {
  return `
    function initializeParallelChart() {
      const chart = echarts.init(document.getElementById('parallel-chart'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          trigger: 'item'
        },
        parallelAxis: window.parallelData.dimensions.map((dim, index) => ({
          dim: index,
          name: dim.name,
          type: dim.type,
          min: dim.min,
          max: dim.max
        })),
        parallel: {
          left: '5%',
          right: '13%',
          bottom: '10%',
          top: '20%',
          parallelAxisDefault: {
            type: 'value',
            nameLocation: 'end',
            nameGap: 20
          }
        },
        series: [{
          name: '交易分析',
          type: 'parallel',
          lineStyle: {
            width: 1,
            opacity: 0.5
          },
          data: window.parallelData.values
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成桑基图
 */
export function generateSankeyChart(config: AdvancedChartConfig): string {
  return `
    function initializeSankeyChart() {
      const chart = echarts.init(document.getElementById('sankey-chart'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          trigger: 'item',
          triggerOn: 'mousemove'
        },
        series: [{
          type: 'sankey',
          layout: 'none',
          emphasis: {
            focus: 'adjacency'
          },
          data: window.sankeyData.nodes,
          links: window.sankeyData.links,
          lineStyle: {
            color: 'gradient',
            curveness: 0.5
          }
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成日历图
 */
export function generateCalendarChart(config: AdvancedChartConfig): string {
  return `
    function initializeCalendarChart() {
      const chart = echarts.init(document.getElementById('calendar-chart'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          position: 'top',
          formatter: function(p) {
            const format = echarts.format.formatTime('yyyy-MM-dd', p.data[0]);
            return format + ': ' + p.data[1].toFixed(2) + '%';
          }
        },
        visualMap: {
          min: -5,
          max: 5,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          top: 'top',
          inRange: {
            color: ['#c23531', '#e8e8e8', '#3398db']
          }
        },
        calendar: [{
          range: window.calendarData.range,
          cellSize: ['auto', 20],
          itemStyle: {
            borderWidth: 0.5
          },
          yearLabel: {show: true}
        }],
        series: [{
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: window.calendarData.values
        }]
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * 生成图表联动脚本
 */
export function generateChartLinkage(config: AdvancedChartConfig): string {
  return `
    function setupChartLinkage() {
      if (!${config.linkage}) return;

      const charts = {
        equity: echarts.getInstanceByDom(document.getElementById('equity-chart')),
        returns: echarts.getInstanceByDom(document.getElementById('returns-chart')),
        drawdown: echarts.getInstanceByDom(document.getElementById('drawdown-chart')),
        risk: echarts.getInstanceByDom(document.getElementById('risk-chart')),
        correlation: echarts.getInstanceByDom(document.getElementById('correlation-matrix')),
        heatMap: echarts.getInstanceByDom(document.getElementById('heat-map')),
        scatter: echarts.getInstanceByDom(document.getElementById('scatter-plot')),
        radar: echarts.getInstanceByDom(document.getElementById('radar-chart')),
        treeMap: echarts.getInstanceByDom(document.getElementById('tree-map')),
        parallel: echarts.getInstanceByDom(document.getElementById('parallel-chart')),
        sankey: echarts.getInstanceByDom(document.getElementById('sankey-chart')),
        calendar: echarts.getInstanceByDom(document.getElementById('calendar-chart'))
      };

      // 时间轴联动
      const timeCharts = [charts.equity, charts.drawdown, charts.calendar];
      timeCharts.forEach(chart => {
        if (!chart) return;
        
        chart.on('datazoom', function(params) {
          timeCharts.forEach(c => {
            if (c && c !== chart) {
              c.dispatchAction({
                type: 'dataZoom',
                start: params.batch[0].start,
                end: params.batch[0].end
              });
            }
          });
        });
      });

      // 高亮联动
      Object.values(charts).forEach(chart => {
        if (!chart) return;

        chart.on('highlight', function(params) {
          Object.values(charts).forEach(c => {
            if (c && c !== chart) {
              c.dispatchAction({
                type: 'highlight',
                seriesIndex: params.seriesIndex,
                dataIndex: params.dataIndex
              });
            }
          });
        });

        chart.on('downplay', function(params) {
          Object.values(charts).forEach(c => {
            if (c && c !== chart) {
              c.dispatchAction({
                type: 'downplay',
                seriesIndex: params.seriesIndex,
                dataIndex: params.dataIndex
              });
            }
          });
        });
      });
    }
  `;
}

/**
 * 生成高级图表数据脚本
 */
export function generateAdvancedChartDataScript(data: any): string {
  return `
    window.correlationData = ${JSON.stringify(data.correlation)};
    window.heatMapData = ${JSON.stringify(data.heatMap)};
    window.scatterData = ${JSON.stringify(data.scatter)};
    window.radarData = ${JSON.stringify(data.radar)};
    window.treeMapData = ${JSON.stringify(data.treeMap)};
    window.parallelData = ${JSON.stringify(data.parallel)};
    window.sankeyData = ${JSON.stringify(data.sankey)};
    window.calendarData = ${JSON.stringify(data.calendar)};
  `;
} 