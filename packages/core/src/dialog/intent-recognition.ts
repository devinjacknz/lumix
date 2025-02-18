import { DialogIntent, IntentMatch } from './types';
import { z } from 'zod';

export const IntentRecognitionConfigSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.6),
  maxMatches: z.number().min(1).default(3),
  language: z.enum(['en', 'zh']).default('en'),
  customPatterns: z.record(z.array(z.string())).optional()
});

export type IntentRecognitionConfig = z.infer<typeof IntentRecognitionConfigSchema>;

export class DialogIntentRecognizer {
  private config: IntentRecognitionConfig;
  private patterns: {
    en: Map<string, RegExp[]>;
    zh: Map<string, RegExp[]>;
  } = {
    en: new Map(),
    zh: new Map()
  };
  private keywords: {
    en: Map<string, Set<string>>;
    zh: Map<string, Set<string>>;
  } = {
    en: new Map(),
    zh: new Map()
  };

  constructor(config: Partial<IntentRecognitionConfig> = {}) {
    this.config = IntentRecognitionConfigSchema.parse(config);
    this.initializePatterns();
  }

  private initializePatterns() {
    // English patterns
    this.patterns.en.set('balance_query', [
      /balance(?:\s+of\s+)?(?<token>\w+)?/i,
      /how\s+much\s+(?<token>\w+)(?:\s+do\s+i\s+have)?/i
    ]);

    this.patterns.en.set('swap', [
      /swap\s+(?<amount>\d+(?:\.\d+)?)\s+(?<fromToken>\w+)(?:\s+to\s+)?(?<toToken>\w+)?/i,
      /exchange\s+(?<amount>\d+(?:\.\d+)?)\s+(?<fromToken>\w+)(?:\s+for\s+)?(?<toToken>\w+)?/i
    ]);

    this.patterns.en.set('price_check', [
      /price\s+of\s+(?<token>\w+)/i,
      /how\s+much\s+is\s+(?<token>\w+)(?:\s+worth)?/i
    ]);

    // Chinese patterns
    this.patterns.zh.set('balance_query', [
      /(?<token>\S+)余额/,
      /(?<token>\S+)(?:还有多少|剩余多少)/,
      /查询(?<token>\S+)(?:余额)?/
    ]);

    this.patterns.zh.set('swap', [
      /(?:兑换|交换)\s*(?<amount>\d+(?:\.\d+)?)\s*(?<fromToken>\S+)(?:\s*(?:到|成|换成)\s*)?(?<toToken>\S+)?/,
      /(?:把|将)\s*(?<amount>\d+(?:\.\d+)?)\s*(?<fromToken>\S+)(?:\s*(?:换成|兑换成|转换成)\s*)(?<toToken>\S+)/
    ]);

    this.patterns.zh.set('price_check', [
      /(?<token>\S+)(?:的)?(?:价格|报价)/,
      /(?<token>\S+)(?:现在)?(?:值多少|多少钱)/
    ]);

    // Add custom patterns if provided
    if (this.config.customPatterns) {
      for (const [intent, patternStrings] of Object.entries(this.config.customPatterns)) {
        const regexPatterns = patternStrings.map(p => new RegExp(p, 'i'));
        if (intent.startsWith('zh_')) {
          this.patterns.zh.set(intent.substring(3), regexPatterns);
        } else {
          this.patterns.en.set(intent, regexPatterns);
        }
      }
    }

    // Initialize keywords for each intent
    this.initializeKeywords();
  }

  private initializeKeywords() {
    // English keywords
    this.keywords.en.set('balance_query', new Set([
      'balance', 'amount', 'holdings', 'have', 'own', 'hold'
    ]));

    this.keywords.en.set('swap', new Set([
      'swap', 'exchange', 'trade', 'convert', 'sell', 'buy'
    ]));

    this.keywords.en.set('price_check', new Set([
      'price', 'worth', 'value', 'cost', 'rate'
    ]));

    // Chinese keywords
    this.keywords.zh.set('balance_query', new Set([
      '余额', '持有', '剩余', '查询', '还有', '多少'
    ]));

    this.keywords.zh.set('swap', new Set([
      '兑换', '交换', '换成', '转换', '买入', '卖出'
    ]));

    this.keywords.zh.set('price_check', new Set([
      '价格', '报价', '值多少', '多少钱', '行情'
    ]));
  }

  async recognizeIntent(text: string): Promise<DialogIntent | null> {
    const matches: IntentMatch[] = [];
    const normalizedText = text.toLowerCase();
    
    // Detect language
    const isChineseChar = (char: string) => {
      const code = char.charCodeAt(0);
      return code >= 0x4E00 && code <= 0x9FFF;
    };
    
    const chineseCharCount = Array.from(text).filter(isChineseChar).length;
    const isChinese = chineseCharCount / text.length > 0.5;
    
    const patterns = isChinese ? this.patterns.zh : this.patterns.en;
    const keywords = isChinese ? this.keywords.zh : this.keywords.en;

    // First pass: Check against regex patterns
    for (const [intentType, patternList] of patterns.entries()) {
      for (const pattern of patternList) {
        const match = pattern.exec(normalizedText);
        if (match) {
          const confidence = this.calculatePatternConfidence(match, normalizedText);
          if (confidence >= this.config.threshold) {
            matches.push({
              type: intentType,
              confidence,
              parameters: this.extractParameters(match.groups || {})
            });
          }
        }
      }
    }

    // Second pass: Keyword-based matching if no strong matches found
    if (matches.length === 0) {
      const keywordMatches = this.performKeywordMatching(normalizedText, isChinese);
      matches.push(...keywordMatches);
    }

    // Sort matches by confidence and limit to maxMatches
    const sortedMatches = matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxMatches);

    if (sortedMatches.length === 0) {
      return null;
    }

    // Return the best match as DialogIntent
    const bestMatch = sortedMatches[0];
    return {
      type: bestMatch.type,
      confidence: bestMatch.confidence,
      parameters: bestMatch.parameters,
      alternativeMatches: sortedMatches.slice(1)
    };
  }

  private calculatePatternConfidence(match: RegExpExecArray, text: string): number {
    // Base confidence from match length relative to text length
    const coverageScore = match[0].length / text.length;
    
    // Adjust confidence based on captured groups
    const groupScore = match.groups ? Object.keys(match.groups).length * 0.1 : 0;
    
    // Combine scores with weights
    const confidence = (coverageScore * 0.7) + (groupScore * 0.3);
    
    return Math.min(1, Math.max(0, confidence));
  }

  private performKeywordMatching(text: string, isChinese: boolean): IntentMatch[] {
    const matches: IntentMatch[] = [];
    const keywords = isChinese ? this.keywords.zh : this.keywords.en;
    
    // For Chinese text, use character-based matching
    const words = isChinese ? Array.from(text) : text.split(/\s+/);

    for (const [intentType, keywordSet] of keywords.entries()) {
      let matchCount = 0;
      for (const word of words) {
        if (keywordSet.has(word)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = matchCount / words.length;
        if (confidence >= this.config.threshold) {
          matches.push({
            type: intentType,
            confidence,
            parameters: {}
          });
        }
      }
    }

    return matches;
  }

  private extractParameters(groups: { [key: string]: string }): Record<string, string | number> {
    const parameters: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(groups)) {
      if (value === undefined) continue;

      // Try to convert numeric values
      if (/^\d+(\.\d+)?$/.test(value)) {
        parameters[key] = parseFloat(value);
      } else {
        parameters[key] = value;
      }
    }

    return parameters;
  }

  addCustomPattern(intent: string, pattern: string | RegExp, language: 'en' | 'zh' = 'en') {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    const patterns = this.patterns[language].get(intent) || [];
    patterns.push(regex);
    this.patterns[language].set(intent, patterns);
  }

  addCustomKeywords(intent: string, keywords: string[], language: 'en' | 'zh' = 'en') {
    const keywordSet = this.keywords[language].get(intent) || new Set();
    keywords.forEach(keyword => keywordSet.add(keyword.toLowerCase()));
    this.keywords[language].set(intent, keywordSet);
  }
}
