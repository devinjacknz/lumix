import { Tool } from "langchain/tools";
import { PriceData, TokenPair, PriceSourceType } from "../types";
import { logger } from "@lumix/core";

export interface ValidationRule {
  name: string;
  description: string;
  validate: (data: PriceData) => {
    isValid: boolean;
    message?: string;
    severity: "error" | "warning" | "info";
  };
}

export interface DataValidatorConfig {
  rules?: ValidationRule[];
  minConfidence: number;
  maxPriceAge: number;
  maxPriceDeviation: number;
  requiredFields: string[];
}

export class DataValidatorTool extends Tool {
  name = "data_validator";
  description = "Validates price data for accuracy and reliability";

  private config: DataValidatorConfig;
  private rules: ValidationRule[];

  constructor(config: Partial<DataValidatorConfig> = {}) {
    super();
    this.config = {
      minConfidence: 0.8,
      maxPriceAge: 300000, // 5分钟
      maxPriceDeviation: 0.1, // 10%
      requiredFields: ["price", "timestamp", "source", "confidence"],
      ...config
    };

    // 初始化默认验证规则
    this.rules = [
      ...(config.rules || []),
      this.createConfidenceRule(),
      this.createTimestampRule(),
      this.createRequiredFieldsRule(),
      this.createPriceRangeRule()
    ];
  }

  protected async _call(input: string): Promise<string> {
    try {
      const params = JSON.parse(input);
      
      switch (params.action) {
        case "validate":
          return await this.validateData(params.data);
        case "add-rule":
          this.addRule(params.rule);
          return "Rule added successfully";
        case "remove-rule":
          this.removeRule(params.ruleName);
          return "Rule removed successfully";
        case "get-rules":
          return JSON.stringify(this.rules.map(r => ({ name: r.name, description: r.description })));
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error("Data Validator Tool", error.message);
      }
      throw error;
    }
  }

  private async validateData(data: PriceData): Promise<string> {
    const validationResults = this.rules.map(rule => ({
      rule: rule.name,
      ...rule.validate(data)
    }));

    const errors = validationResults.filter(r => r.severity === "error");
    const warnings = validationResults.filter(r => r.severity === "warning");
    const infos = validationResults.filter(r => r.severity === "info");

    const isValid = errors.length === 0;

    return JSON.stringify({
      isValid,
      data,
      validation: {
        errors,
        warnings,
        infos
      },
      timestamp: Date.now()
    });
  }

  private createConfidenceRule(): ValidationRule {
    return {
      name: "confidence_check",
      description: "Validates the confidence level of price data",
      validate: (data: PriceData) => {
        const isValid = data.confidence >= this.config.minConfidence;
        return {
          isValid,
          message: isValid ? undefined : `Confidence ${data.confidence} below minimum threshold ${this.config.minConfidence}`,
          severity: "error"
        };
      }
    };
  }

  private createTimestampRule(): ValidationRule {
    return {
      name: "timestamp_check",
      description: "Validates the age of price data",
      validate: (data: PriceData) => {
        const age = Date.now() - data.timestamp;
        const isValid = age <= this.config.maxPriceAge;
        return {
          isValid,
          message: isValid ? undefined : `Price data is too old (${age}ms)`,
          severity: "error"
        };
      }
    };
  }

  private createRequiredFieldsRule(): ValidationRule {
    return {
      name: "required_fields_check",
      description: "Validates the presence of required fields",
      validate: (data: PriceData) => {
        const missingFields = this.config.requiredFields.filter(
          field => !(field in data)
        );
        const isValid = missingFields.length === 0;
        return {
          isValid,
          message: isValid ? undefined : `Missing required fields: ${missingFields.join(", ")}`,
          severity: "error"
        };
      }
    };
  }

  private createPriceRangeRule(): ValidationRule {
    return {
      name: "price_range_check",
      description: "Validates the price is within reasonable range",
      validate: (data: PriceData) => {
        // 这里可以实现更复杂的价格范围检查逻辑
        const isValid = data.price > 0;
        return {
          isValid,
          message: isValid ? undefined : "Price must be greater than 0",
          severity: "error"
        };
      }
    };
  }

  public addRule(rule: ValidationRule): void {
    const existingIndex = this.rules.findIndex(r => r.name === rule.name);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  public removeRule(ruleName: string): void {
    this.rules = this.rules.filter(r => r.name !== ruleName);
  }

  public updateConfig(newConfig: Partial<DataValidatorConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
} 