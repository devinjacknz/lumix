/**
 * 图表配置接口
 */
export interface ChartConfig {
  theme: 'light' | 'dark';
  animation: boolean;
  tooltip: boolean;
  legend: boolean;
  dataZoom: boolean;
  toolbox: boolean;
}

/**
 * ECharts图表初始化
 */
export function initializeECharts(config: ChartConfig): string {
  return `
    function initializeECharts() {
      // 设置主题
      const theme = '${config.theme}';
      
      // 初始化权益曲线图表
      initializeEquityChart();
      
      // 初始化收益分布图表
      initializeReturnsChart();
      
      // 初始化回撤图表
      initializeDrawdownChart();
      
      // 初始化风险图表
      initializeRiskChart();
    }

    function initializeEquityChart() {
      const chart = echarts.init(document.getElementById('equity-chart'), '${config.theme}');
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
          data: ['权益', '基准']
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'time',
          boundaryGap: false
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: '{value}%'
          }
        },
        series: [
          {
            name: '权益',
            type: 'line',
            data: window.equityData,
            symbol: 'none',
            lineStyle: {
              width: 1
            },
            areaStyle: {
              opacity: 0.1
            }
          },
          {
            name: '基准',
            type: 'line',
            data: window.benchmarkData,
            symbol: 'none',
            lineStyle: {
              width: 1
            }
          }
        ],
        dataZoom: ${config.dataZoom} ? [
          {
            type: 'inside',
            start: 0,
            end: 100
          },
          {
            show: true,
            type: 'slider',
            bottom: 10
          }
        ] : [],
        toolbox: ${config.toolbox} ? {
          feature: {
            dataZoom: {
              yAxisIndex: 'none'
            },
            restore: {},
            saveAsImage: {}
          }
        } : null
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }

    function initializeReturnsChart() {
      const chart = echarts.init(document.getElementById('returns-chart'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          trigger: 'axis',
          axisPointer: {
            type: 'shadow'
          }
        },
        legend: {
          show: ${config.legend},
          data: ['收益分布']
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: window.returnsBins
        },
        yAxis: {
          type: 'value'
        },
        series: [
          {
            name: '收益分布',
            type: 'bar',
            data: window.returnsFrequency,
            itemStyle: {
              color: function(params) {
                return params.value >= 0 ? '#28a745' : '#dc3545';
              }
            }
          }
        ],
        dataZoom: ${config.dataZoom} ? [
          {
            type: 'inside',
            start: 0,
            end: 100
          }
        ] : [],
        toolbox: ${config.toolbox} ? {
          feature: {
            restore: {},
            saveAsImage: {}
          }
        } : null
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }

    function initializeDrawdownChart() {
      const chart = echarts.init(document.getElementById('drawdown-chart'), '${config.theme}');
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
          data: ['回撤']
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'time',
          boundaryGap: false
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: '{value}%'
          },
          inverse: true
        },
        series: [
          {
            name: '回撤',
            type: 'line',
            data: window.drawdownData,
            symbol: 'none',
            lineStyle: {
              width: 1,
              color: '#dc3545'
            },
            areaStyle: {
              color: '#dc3545',
              opacity: 0.1
            }
          }
        ],
        dataZoom: ${config.dataZoom} ? [
          {
            type: 'inside',
            start: 0,
            end: 100
          },
          {
            show: true,
            type: 'slider',
            bottom: 10
          }
        ] : [],
        toolbox: ${config.toolbox} ? {
          feature: {
            dataZoom: {
              yAxisIndex: 'none'
            },
            restore: {},
            saveAsImage: {}
          }
        } : null
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }

    function initializeRiskChart() {
      const chart = echarts.init(document.getElementById('risk-chart'), '${config.theme}');
      const option = {
        animation: ${config.animation},
        tooltip: {
          show: ${config.tooltip},
          trigger: 'item'
        },
        legend: {
          show: ${config.legend},
          orient: 'vertical',
          left: 'left'
        },
        series: [
          {
            name: '风险分布',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: '20',
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data: window.riskData
          }
        ],
        toolbox: ${config.toolbox} ? {
          feature: {
            restore: {},
            saveAsImage: {}
          }
        } : null
      };
      
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
  `;
}

/**
 * Highcharts图表初始化
 */
export function initializeHighcharts(config: ChartConfig): string {
  return `
    function initializeHighcharts() {
      // 设置主题
      const theme = '${config.theme}';
      
      // 初始化权益曲线图表
      initializeEquityChart();
      
      // 初始化收益分布图表
      initializeReturnsChart();
      
      // 初始化回撤图表
      initializeDrawdownChart();
      
      // 初始化风险图表
      initializeRiskChart();
    }

    function initializeEquityChart() {
      Highcharts.chart('equity-chart', {
        chart: {
          type: 'area',
          zoomType: 'x',
          animation: ${config.animation}
        },
        title: {
          text: '权益曲线'
        },
        xAxis: {
          type: 'datetime'
        },
        yAxis: {
          title: {
            text: '收益率 (%)'
          }
        },
        tooltip: {
          shared: true,
          valueDecimals: 2,
          valueSuffix: '%'
        },
        legend: {
          enabled: ${config.legend}
        },
        series: [{
          name: '权益',
          data: window.equityData,
          fillColor: {
            linearGradient: {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 1
            },
            stops: [
              [0, Highcharts.getOptions().colors[0]],
              [1, Highcharts.color(Highcharts.getOptions().colors[0]).setOpacity(0).get('rgba')]
            ]
          }
        }, {
          name: '基准',
          data: window.benchmarkData
        }]
      });
    }

    function initializeReturnsChart() {
      Highcharts.chart('returns-chart', {
        chart: {
          type: 'column',
          animation: ${config.animation}
        },
        title: {
          text: '收益分布'
        },
        xAxis: {
          categories: window.returnsBins
        },
        yAxis: {
          title: {
            text: '频率'
          }
        },
        tooltip: {
          headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
          pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
            '<td style="padding:0"><b>{point.y:.1f}</b></td></tr>',
          footerFormat: '</table>',
          shared: true,
          useHTML: true
        },
        legend: {
          enabled: ${config.legend}
        },
        series: [{
          name: '收益分布',
          data: window.returnsFrequency.map((value, index) => ({
            y: value,
            color: value >= 0 ? '#28a745' : '#dc3545'
          }))
        }]
      });
    }

    function initializeDrawdownChart() {
      Highcharts.chart('drawdown-chart', {
        chart: {
          type: 'area',
          zoomType: 'x',
          animation: ${config.animation}
        },
        title: {
          text: '回撤分析'
        },
        xAxis: {
          type: 'datetime'
        },
        yAxis: {
          title: {
            text: '回撤 (%)'
          },
          reversed: true
        },
        tooltip: {
          valueDecimals: 2,
          valueSuffix: '%'
        },
        legend: {
          enabled: ${config.legend}
        },
        series: [{
          name: '回撤',
          data: window.drawdownData,
          color: '#dc3545',
          fillColor: {
            linearGradient: {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 1
            },
            stops: [
              [0, '#dc3545'],
              [1, Highcharts.color('#dc3545').setOpacity(0).get('rgba')]
            ]
          }
        }]
      });
    }

    function initializeRiskChart() {
      Highcharts.chart('risk-chart', {
        chart: {
          type: 'pie',
          animation: ${config.animation}
        },
        title: {
          text: '风险分析'
        },
        tooltip: {
          pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
        },
        accessibility: {
          point: {
            valueSuffix: '%'
          }
        },
        plotOptions: {
          pie: {
            allowPointSelect: true,
            cursor: 'pointer',
            dataLabels: {
              enabled: true,
              format: '<b>{point.name}</b>: {point.percentage:.1f} %'
            }
          }
        },
        legend: {
          enabled: ${config.legend}
        },
        series: [{
          name: '风险分布',
          colorByPoint: true,
          data: window.riskData
        }]
      });
    }
  `;
}

/**
 * Plotly图表初始化
 */
export function initializePlotly(config: ChartConfig): string {
  return `
    function initializePlotly() {
      // 设置主题
      const theme = '${config.theme}';
      
      // 初始化权益曲线图表
      initializeEquityChart();
      
      // 初始化收益分布图表
      initializeReturnsChart();
      
      // 初始化回撤图表
      initializeDrawdownChart();
      
      // 初始化风险图表
      initializeRiskChart();
    }

    function initializeEquityChart() {
      const trace1 = {
        type: 'scatter',
        mode: 'lines',
        name: '权益',
        x: window.equityData.map(d => d[0]),
        y: window.equityData.map(d => d[1]),
        line: {width: 1},
        fill: 'tonexty'
      };

      const trace2 = {
        type: 'scatter',
        mode: 'lines',
        name: '基准',
        x: window.benchmarkData.map(d => d[0]),
        y: window.benchmarkData.map(d => d[1]),
        line: {width: 1}
      };

      const layout = {
        title: '权益曲线',
        showlegend: ${config.legend},
        xaxis: {
          type: 'date',
          title: '日期'
        },
        yaxis: {
          title: '收益率 (%)'
        }
      };

      Plotly.newPlot('equity-chart', [trace1, trace2], layout);
    }

    function initializeReturnsChart() {
      const trace = {
        type: 'bar',
        x: window.returnsBins,
        y: window.returnsFrequency,
        marker: {
          color: window.returnsFrequency.map(v => v >= 0 ? '#28a745' : '#dc3545')
        }
      };

      const layout = {
        title: '收益分布',
        showlegend: ${config.legend},
        xaxis: {
          title: '收益率'
        },
        yaxis: {
          title: '频率'
        }
      };

      Plotly.newPlot('returns-chart', [trace], layout);
    }

    function initializeDrawdownChart() {
      const trace = {
        type: 'scatter',
        mode: 'lines',
        name: '回撤',
        x: window.drawdownData.map(d => d[0]),
        y: window.drawdownData.map(d => d[1]),
        line: {
          color: '#dc3545',
          width: 1
        },
        fill: 'tonexty'
      };

      const layout = {
        title: '回撤分析',
        showlegend: ${config.legend},
        xaxis: {
          type: 'date',
          title: '日期'
        },
        yaxis: {
          title: '回撤 (%)',
          autorange: 'reversed'
        }
      };

      Plotly.newPlot('drawdown-chart', [trace], layout);
    }

    function initializeRiskChart() {
      const trace = {
        type: 'pie',
        labels: window.riskData.map(d => d.name),
        values: window.riskData.map(d => d.value),
        textinfo: 'label+percent',
        hole: 0.4
      };

      const layout = {
        title: '风险分析',
        showlegend: ${config.legend}
      };

      Plotly.newPlot('risk-chart', [trace], layout);
    }
  `;
}

/**
 * 生成图表数据脚本
 */
export function generateChartDataScript(data: any): string {
  return `
    window.equityData = ${JSON.stringify(data.equity)};
    window.benchmarkData = ${JSON.stringify(data.benchmark)};
    window.returnsBins = ${JSON.stringify(data.returnsBins)};
    window.returnsFrequency = ${JSON.stringify(data.returnsFrequency)};
    window.drawdownData = ${JSON.stringify(data.drawdown)};
    window.riskData = ${JSON.stringify(data.risk)};
  `;
} 