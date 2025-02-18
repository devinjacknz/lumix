import { ConsultationMode } from '@lumix/core';
import { AnalysisResult } from '@lumix/plugin-chain-adapter';

export function formatAnalysisResult(
  result: AnalysisResult,
  mode: ConsultationMode
): string {
  if (mode === 'beginner') {
    return simplifyAnalysis(result);
  }
  return formatTechnicalAnalysis(result);
}

function simplifyAnalysis(result: AnalysisResult): string {
  const riskLevelMap = {
    LOW: '安全',
    MEDIUM: '需要注意',
    HIGH: '风险较高'
  } as const;

  const findings = result.findings.map(f => ({
    ...f,
    description: simplifyDescription(f.description)
  }));

  return `
分析结果：
- 安全等级：${riskLevelMap[result.riskLevel]}
- 主要发现：
${findings.map(f => `  * ${f.description}`).join('\n')}
- 建议：
${result.recommendations.map(r => `  * ${r}`).join('\n')}
  `;
}

function formatTechnicalAnalysis(result: AnalysisResult): string {
  return `
Technical Analysis Results:
Risk Level: ${result.riskLevel}

Findings:
${result.findings.map(f => `
- Type: ${f.type}
  Severity: ${f.severity}
  Description: ${f.description}
`).join('')}

Recommendations:
${result.recommendations.map(r => `- ${r}`).join('\n')}
  `;
}

function simplifyDescription(description: string): string {
  // 替换专业术语为更通俗的解释
  const simplifications = {
    'BPF加载器': '程序加载器',
    '程序大小': '代码大小',
    '性能': '运行速度',
    // 添加更多术语简化
  } as const;

  let simplified = description;
  Object.entries(simplifications).forEach(([term, simple]) => {
    simplified = simplified.replace(new RegExp(term, 'g'), simple);
  });

  return simplified;
} 