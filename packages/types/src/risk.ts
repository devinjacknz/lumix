export type RiskFactorType = 
  | 'gas_price'
  | 'market_volatility'
  | 'liquidity'
  | 'contract_risk'
  | 'operational_risk'
  | 'regulatory_risk'
  | 'network_risk'
  | 'concentration_risk'
  | 'mev_risk'
  | 'systemic_risk';

export interface RiskFactor {
  type: RiskFactorType;
  name: string;
  description: string;
  value: number;
  weight: number;
  confidence: number;
  threshold: number;
  details: Record<string, any>;
}

export interface RiskAssessment {
  transactionId: string;
  timestamp: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  recommendations: string[];
  details: Record<string, any>;
} 