import { ReportContent } from '../report-generator';
import puppeteer from 'puppeteer';
import { logger } from '../../../monitoring';

/**
 * PDF模板配置接口
 */
export interface PDFTemplateConfig {
  format: 'A4' | 'A3' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margin: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  headerTemplate?: string;
  footerTemplate?: string;
  displayHeaderFooter?: boolean;
  printBackground?: boolean;
  scale?: number;
  pageRanges?: string;
  preferCSSPageSize?: boolean;
}

/**
 * PDF报告模板生成器
 */
export class PDFTemplate {
  private config: Required<PDFTemplateConfig>;

  constructor(config: Partial<PDFTemplateConfig> = {}) {
    this.config = {
      format: config.format || 'A4',
      orientation: config.orientation || 'portrait',
      margin: config.margin || {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      },
      headerTemplate: config.headerTemplate || this.defaultHeaderTemplate(),
      footerTemplate: config.footerTemplate || this.defaultFooterTemplate(),
      displayHeaderFooter: config.displayHeaderFooter !== undefined ? config.displayHeaderFooter : true,
      printBackground: config.printBackground !== undefined ? config.printBackground : true,
      scale: config.scale || 1,
      pageRanges: config.pageRanges || '',
      preferCSSPageSize: config.preferCSSPageSize !== undefined ? config.preferCSSPageSize : false
    };
  }

  /**
   * 生成PDF报告
   */
  public async generate(content: ReportContent, html: string): Promise<Buffer> {
    try {
      // 启动浏览器
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // 创建新页面
      const page = await browser.newPage();

      // 设置页面内容
      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      // 等待图表渲染完成
      await this.waitForCharts(page);

      // 生成PDF
      const pdf = await page.pdf({
        format: this.config.format as any,
        landscape: this.config.orientation === 'landscape',
        margin: this.config.margin,
        headerTemplate: this.config.headerTemplate,
        footerTemplate: this.config.footerTemplate,
        displayHeaderFooter: this.config.displayHeaderFooter,
        printBackground: this.config.printBackground,
        scale: this.config.scale,
        pageRanges: this.config.pageRanges,
        preferCSSPageSize: this.config.preferCSSPageSize
      });

      // 关闭浏览器
      await browser.close();

      return pdf;
    } catch (error) {
      logger.error('PDFTemplate', 'Failed to generate PDF', { error });
      throw error;
    }
  }

  /**
   * 等待图表渲染完成
   */
  private async waitForCharts(page: puppeteer.Page): Promise<void> {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        // 检查是否所有图表都已渲染完成
        const checkCharts = () => {
          const charts = document.querySelectorAll('.chart-container');
          let allReady = true;

          charts.forEach(chart => {
            if (!chart.querySelector('canvas')) {
              allReady = false;
            }
          });

          if (allReady) {
            resolve();
          } else {
            setTimeout(checkCharts, 100);
          }
        };

        checkCharts();
      });
    });
  }

  /**
   * 默认页眉模板
   */
  private defaultHeaderTemplate(): string {
    return `
      <div style="width: 100%; font-size: 10px; padding: 5px 20px; border-bottom: 1px solid #ddd;">
        <div style="float: left;">
          <span class="title"></span>
        </div>
        <div style="float: right;">
          <span class="date"></span>
        </div>
      </div>
    `;
  }

  /**
   * 默认页脚模板
   */
  private defaultFooterTemplate(): string {
    return `
      <div style="width: 100%; font-size: 10px; padding: 5px 20px; border-top: 1px solid #ddd;">
        <div style="float: left;">
          <span>Powered by Lumix</span>
        </div>
        <div style="float: right;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      </div>
    `;
  }

  /**
   * PDF专用样式
   */
  public static pdfStyles(): string {
    return `
      @page {
        size: ${this.config.format} ${this.config.orientation};
        margin: ${this.config.margin.top} ${this.config.margin.right} ${this.config.margin.bottom} ${this.config.margin.left};
      }

      body {
        font-family: 'Arial', sans-serif;
        line-height: 1.6;
        color: #333;
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: 'Arial', sans-serif;
        margin-top: 2em;
        margin-bottom: 1em;
        page-break-after: avoid;
      }

      h1 { font-size: 24pt; }
      h2 { font-size: 20pt; }
      h3 { font-size: 16pt; }
      h4 { font-size: 14pt; }
      h5 { font-size: 12pt; }
      h6 { font-size: 10pt; }

      p {
        margin: 1em 0;
        text-align: justify;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1em 0;
        page-break-inside: avoid;
      }

      th, td {
        padding: 8px;
        border: 1px solid #ddd;
        font-size: 9pt;
      }

      th {
        background-color: #f5f5f5;
        font-weight: bold;
      }

      .chart-container {
        page-break-inside: avoid;
        margin: 2em 0;
      }

      .metric-card {
        page-break-inside: avoid;
        margin: 1em 0;
        padding: 1em;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      .warning-card {
        page-break-inside: avoid;
        margin: 1em 0;
        padding: 1em;
        border-left: 4px solid;
        background-color: #fff;
      }

      .warning-card.high {
        border-color: #dc3545;
      }

      .warning-card.medium {
        border-color: #ffc107;
      }

      .warning-card.low {
        border-color: #28a745;
      }

      .recommendations-container {
        page-break-inside: avoid;
        margin: 2em 0;
      }

      .recommendation-section {
        margin: 1em 0;
      }

      .recommendation-section ul {
        list-style-type: none;
        padding-left: 0;
      }

      .recommendation-section li {
        margin: 0.5em 0;
        padding-left: 1.5em;
        position: relative;
      }

      .recommendation-section li:before {
        content: '•';
        position: absolute;
        left: 0;
      }

      @media print {
        .no-print {
          display: none;
        }

        .page-break {
          page-break-before: always;
        }

        .avoid-break {
          page-break-inside: avoid;
        }
      }
    `;
  }

  /**
   * 生成目录
   */
  private generateTOC(content: ReportContent): string {
    return `
      <div class="toc">
        <h2>目录</h2>
        <ul>
          <li><a href="#summary">执行摘要</a></li>
          <li><a href="#performance">性能分析</a></li>
          <li><a href="#risk">风险分析</a></li>
          <li><a href="#trades">交易分析</a></li>
          <li><a href="#analysis">归因分析</a></li>
          <li><a href="#recommendations">建议</a></li>
        </ul>
      </div>
    `;
  }

  /**
   * 生成封面
   */
  private generateCover(content: ReportContent): string {
    return `
      <div class="cover">
        <h1>${content.metadata.title}</h1>
        <div class="metadata">
          <p>作者: ${content.metadata.author}</p>
          <p>日期: ${content.metadata.date.toLocaleDateString()}</p>
          <p>版本: ${content.metadata.version}</p>
        </div>
        <div class="description">
          <p>${content.metadata.description}</p>
        </div>
      </div>
    `;
  }
} 