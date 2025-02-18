import { BaseError } from '@lumix/core';
import { AddressProfile, TransactionActivity } from '../profile/types';

export class MoneyLaunderingError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MoneyLaunderingError';
  }
}

export interface TransactionFlow {
  from: string;
  to: string;
  amount: bigint;
  token: string;
  timestamp: number;
  txHash: string;
  type: 'direct' | 'split' | 'merge' | 'swap' | 'bridge';
  metadata?: Record<string, any>;
}

export interface FlowPattern {
  type: 'layering' | 'structuring' | 'mixing' | 'smurfing' | 'cycling';
  score: number;
  flows: TransactionFlow[];
  participants: string[];
  startTime: number;
  endTime: number;
  totalValue: bigint;
  evidence: Array<{
    type: string;
    weight: number;
    data: any;
  }>;
}

export interface MoneyLaunderingAlert {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: FlowPattern;
  riskScore: number;
  sourceAddresses: Array<{
    address: string;
    profile?: AddressProfile;
    role: 'source' | 'intermediary' | 'destination';
  }>;
  description: string;
  metadata: Record<string, any>;
}

export interface FlowAnalysisConfig {
  minFlowValue: bigint;
  maxHops: number;
  timeWindowDays: number;
  minPatternConfidence: number;
  excludedAddresses?: string[];
}

export interface AlertConfig {
  minSeverityScore: number;
  maxAlertsPerAddress: number;
  deduplicationWindow: number; // 毫秒
  notificationThreshold?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface DetectionResult {
  alerts: MoneyLaunderingAlert[];
  stats: {
    totalFlows: number;
    totalValue: bigint;
    uniqueAddresses: number;
    patternDistribution: Record<FlowPattern['type'], number>;
    averageHops: number;
    timeRange: {
      start: number;
      end: number;
    };
  };
} 