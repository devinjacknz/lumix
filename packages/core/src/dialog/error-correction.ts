import { z } from 'zod';

export const ErrorCorrectionConfigSchema = z.object({
  maxSuggestions: z.number().min(1).default(3),
  minSimilarity: z.number().min(0).max(1).default(0.7),
  language: z.enum(['en', 'zh']).default('en'),
  customCorrections: z.record(z.string()).optional()
});

export type ErrorCorrectionConfig = z.infer<typeof ErrorCorrectionConfigSchema>;

export interface CorrectionResult {
  original: string;
  corrected: string;
  confidence: number;
  alternatives?: string[];
}

export class DialogErrorCorrector {
  private config: ErrorCorrectionConfig;
  private tokenCorrections: {
    en: Map<string, string>;
    zh: Map<string, string>;
  } = {
    en: new Map(),
    zh: new Map()
  };

  constructor(config: Partial<ErrorCorrectionConfig> = {}) {
    this.config = ErrorCorrectionConfigSchema.parse(config);
    this.initializeCorrections();
  }

  private initializeCorrections() {
    // English token corrections
    this.tokenCorrections.en.set('eth', 'ETH');
    this.tokenCorrections.en.set('ether', 'ETH');
    this.tokenCorrections.en.set('ethereum', 'ETH');
    this.tokenCorrections.en.set('btc', 'BTC');
    this.tokenCorrections.en.set('bitcoin', 'BTC');
    this.tokenCorrections.en.set('sol', 'SOL');
    this.tokenCorrections.en.set('solana', 'SOL');
    this.tokenCorrections.en.set('usdc', 'USDC');
    this.tokenCorrections.en.set('usdt', 'USDT');
    this.tokenCorrections.en.set('tether', 'USDT');

    // Chinese token corrections
    this.tokenCorrections.zh.set('以太坊', 'ETH');
    this.tokenCorrections.zh.set('以太币', 'ETH');
    this.tokenCorrections.zh.set('比特币', 'BTC');
    this.tokenCorrections.zh.set('索拉纳', 'SOL');
    this.tokenCorrections.zh.set('泰达币', 'USDT');
    this.tokenCorrections.zh.set('优世币', 'USDC');

    // Add custom corrections if provided
    if (this.config.customCorrections) {
      for (const [incorrect, correct] of Object.entries(this.config.customCorrections)) {
        if (incorrect.match(/[\u4e00-\u9fff]/)) {
          this.tokenCorrections.zh.set(incorrect, correct);
        } else {
          this.tokenCorrections.en.set(incorrect.toLowerCase(), correct);
        }
      }
    }
  }

  async correctText(text: string): Promise<CorrectionResult> {
    // Detect language
    const isChineseChar = (char: string) => {
      const code = char.charCodeAt(0);
      return code >= 0x4E00 && code <= 0x9FFF;
    };

    const chineseCharCount = Array.from(text).filter(isChineseChar).length;
    const isChinese = chineseCharCount / text.length > 0.5;

    const corrections = isChinese ? this.tokenCorrections.zh : this.tokenCorrections.en;
    let correctedText = text;
    let maxConfidence = 0;
    const alternatives: string[] = [];

    // Tokenize the text
    const tokens = isChinese 
      ? this.tokenizeChineseText(text)
      : this.tokenizeEnglishText(text);

    // Process each token
    for (const token of tokens) {
      const [correctedToken, confidence] = this.findBestMatch(
        token,
        corrections,
        isChinese
      );

      if (correctedToken && confidence >= this.config.minSimilarity) {
        // Update max confidence
        maxConfidence = Math.max(maxConfidence, confidence);

        // Replace the token in the text
        const tokenRegex = new RegExp(token, 'gi');
        correctedText = correctedText.replace(tokenRegex, correctedToken);

        // Find alternative corrections
        const otherMatches = this.findAlternativeMatches(
          token,
          corrections,
          isChinese,
          correctedToken
        );

        alternatives.push(...otherMatches);
      }
    }

    // Limit alternatives to maxSuggestions
    const uniqueAlternatives = [...new Set(alternatives)]
      .slice(0, this.config.maxSuggestions);

    return {
      original: text,
      corrected: correctedText,
      confidence: maxConfidence,
      alternatives: uniqueAlternatives.length > 0 ? uniqueAlternatives : undefined
    };
  }

  private tokenizeEnglishText(text: string): string[] {
    // Split on word boundaries and filter out empty strings
    return text.split(/\b/)
      .map(token => token.trim())
      .filter(token => token.length > 0);
  }

  private tokenizeChineseText(text: string): string[] {
    // For Chinese text, we'll use a sliding window approach
    const tokens: string[] = [];
    const maxLength = 4; // Maximum token length to consider

    for (let i = 0; i < text.length; i++) {
      for (let len = maxLength; len > 0; len--) {
        if (i + len <= text.length) {
          tokens.push(text.slice(i, i + len));
        }
      }
    }

    return tokens;
  }

  private findBestMatch(
    token: string,
    corrections: Map<string, string>,
    isChinese: boolean
  ): [string | null, number] {
    let bestMatch: string | null = null;
    let bestConfidence = 0;

    const normalizedToken = isChinese ? token : token.toLowerCase();

    // Direct match
    if (corrections.has(normalizedToken)) {
      return [corrections.get(normalizedToken)!, 1.0];
    }

    // Fuzzy match
    for (const [incorrect, correct] of corrections.entries()) {
      const similarity = this.calculateSimilarity(normalizedToken, incorrect);
      if (similarity > bestConfidence && similarity >= this.config.minSimilarity) {
        bestMatch = correct;
        bestConfidence = similarity;
      }
    }

    return [bestMatch, bestConfidence];
  }

  private findAlternativeMatches(
    token: string,
    corrections: Map<string, string>,
    isChinese: boolean,
    excludeMatch: string
  ): string[] {
    const alternatives: Array<[string, number]> = [];
    const normalizedToken = isChinese ? token : token.toLowerCase();

    for (const [incorrect, correct] of corrections.entries()) {
      if (correct === excludeMatch) continue;

      const similarity = this.calculateSimilarity(normalizedToken, incorrect);
      if (similarity >= this.config.minSimilarity) {
        alternatives.push([correct, similarity]);
      }
    }

    // Sort by similarity and return only the corrections
    return alternatives
      .sort((a, b) => b[1] - a[1])
      .map(([correction]) => correction);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    const distance = matrix[str1.length][str2.length];
    
    return 1 - (distance / maxLength);
  }

  addCustomCorrection(incorrect: string, correct: string, language: 'en' | 'zh' = 'en') {
    if (language === 'zh') {
      this.tokenCorrections.zh.set(incorrect, correct);
    } else {
      this.tokenCorrections.en.set(incorrect.toLowerCase(), correct);
    }
  }

  removeCustomCorrection(incorrect: string, language: 'en' | 'zh' = 'en') {
    if (language === 'zh') {
      this.tokenCorrections.zh.delete(incorrect);
    } else {
      this.tokenCorrections.en.delete(incorrect.toLowerCase());
    }
  }
}
