import { ChainProtocol } from '../chain/abstract';
import { MarketMetrics, MarketSignal } from './market-analyzer';
import { StrategyConfig, StrategyPerformance } from './strategy-optimizer';

export interface KnowledgeNode {
  id: string;
  type: string;
  data: Record<string, any>;
  relationships: KnowledgeRelationship[];
}

export interface KnowledgeRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  data: Record<string, any>;
}

export interface KnowledgeQuery {
  type?: string;
  properties?: Record<string, any>;
  relationships?: {
    type?: string;
    direction?: 'in' | 'out';
    target?: KnowledgeQuery;
  }[];
}

export interface KnowledgeGraph {
  addNode(node: KnowledgeNode): Promise<void>;
  addRelationship(relationship: KnowledgeRelationship): Promise<void>;
  query(query: KnowledgeQuery): Promise<KnowledgeNode[]>;
  getNode(id: string): Promise<KnowledgeNode | null>;
  getRelationship(id: string): Promise<KnowledgeRelationship | null>;
  updateNode(id: string, data: Partial<KnowledgeNode>): Promise<void>;
  updateRelationship(id: string, data: Partial<KnowledgeRelationship>): Promise<void>;
  deleteNode(id: string): Promise<void>;
  deleteRelationship(id: string): Promise<void>;
}