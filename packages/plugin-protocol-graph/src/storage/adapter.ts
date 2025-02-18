import {
  NodeType,
  EdgeType,
  NodeProperties,
  EdgeProperties,
  GraphFilter,
  GraphError
} from '../types';

export interface StorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: GraphError;
}

export interface QueryOptions {
  batchSize?: number;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  consistency?: 'strong' | 'eventual';
}

export interface BulkOperationResult {
  success: boolean;
  totalCount: number;
  successCount: number;
  failureCount: number;
  errors: Array<{
    item: any;
    error: GraphError;
  }>;
}

export interface StorageStats {
  nodeCount: number;
  edgeCount: number;
  nodeTypes: Map<NodeType, number>;
  edgeTypes: Map<EdgeType, number>;
  storageSize: number;
  indexSize: number;
  lastBackup?: number;
  uptime: number;
}

export interface GraphQuery {
  // 节点查询
  matchNode?: {
    type?: NodeType[];
    properties?: Partial<NodeProperties>;
    filter?: string; // Cypher 或 Gremlin 查询语句
  };

  // 边查询
  matchEdge?: {
    type?: EdgeType[];
    properties?: Partial<EdgeProperties>;
    filter?: string;
  };

  // 路径查询
  matchPath?: {
    startNode?: string;
    endNode?: string;
    edgeTypes?: EdgeType[];
    minLength?: number;
    maxLength?: number;
    filter?: string;
  };

  // 聚合查询
  aggregate?: {
    groupBy?: string[];
    functions: Array<{
      type: 'count' | 'sum' | 'avg' | 'min' | 'max';
      field: string;
      alias: string;
    }>;
  };

  // 排序和分页
  sort?: Array<{
    field: string;
    order: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
}

export interface StorageAdapter {
  /**
   * 初始化存储
   */
  initialize(): Promise<StorageResult>;

  /**
   * 关闭存储连接
   */
  close(): Promise<StorageResult>;

  /**
   * 创建节点
   */
  createNode(
    properties: NodeProperties,
    options?: QueryOptions
  ): Promise<StorageResult<string>>;

  /**
   * 批量创建节点
   */
  createNodes(
    nodes: NodeProperties[],
    options?: QueryOptions
  ): Promise<BulkOperationResult>;

  /**
   * 更新节点
   */
  updateNode(
    id: string,
    properties: Partial<NodeProperties>,
    options?: QueryOptions
  ): Promise<StorageResult>;

  /**
   * 删除节点
   */
  deleteNode(
    id: string,
    options?: QueryOptions
  ): Promise<StorageResult>;

  /**
   * 创建边
   */
  createEdge(
    properties: EdgeProperties,
    options?: QueryOptions
  ): Promise<StorageResult<string>>;

  /**
   * 批量创建边
   */
  createEdges(
    edges: EdgeProperties[],
    options?: QueryOptions
  ): Promise<BulkOperationResult>;

  /**
   * 更新边
   */
  updateEdge(
    id: string,
    properties: Partial<EdgeProperties>,
    options?: QueryOptions
  ): Promise<StorageResult>;

  /**
   * 删除边
   */
  deleteEdge(
    id: string,
    options?: QueryOptions
  ): Promise<StorageResult>;

  /**
   * 获取节点
   */
  getNode(
    id: string,
    options?: QueryOptions
  ): Promise<StorageResult<NodeProperties>>;

  /**
   * 获取边
   */
  getEdge(
    id: string,
    options?: QueryOptions
  ): Promise<StorageResult<EdgeProperties>>;

  /**
   * 查询节点
   */
  queryNodes(
    query: GraphQuery,
    options?: QueryOptions
  ): Promise<StorageResult<NodeProperties[]>>;

  /**
   * 查询边
   */
  queryEdges(
    query: GraphQuery,
    options?: QueryOptions
  ): Promise<StorageResult<EdgeProperties[]>>;

  /**
   * 查询路径
   */
  queryPaths(
    query: GraphQuery,
    options?: QueryOptions
  ): Promise<StorageResult<Array<{
    nodes: NodeProperties[];
    edges: EdgeProperties[];
  }>>>;

  /**
   * 获取相邻节点
   */
  getNeighbors(
    nodeId: string,
    filter?: GraphFilter,
    options?: QueryOptions
  ): Promise<StorageResult<Array<{
    node: NodeProperties;
    edge: EdgeProperties;
    direction: 'in' | 'out';
  }>>>;

  /**
   * 获取子图
   */
  getSubgraph(
    rootNodeIds: string[],
    filter?: GraphFilter,
    options?: QueryOptions
  ): Promise<StorageResult<{
    nodes: NodeProperties[];
    edges: EdgeProperties[];
  }>>;

  /**
   * 执行自定义查询
   */
  executeQuery(
    query: string,
    params?: Record<string, any>,
    options?: QueryOptions
  ): Promise<StorageResult<any>>;

  /**
   * 创建索引
   */
  createIndex(
    type: 'node' | 'edge',
    properties: string[],
    options?: {
      unique?: boolean;
      sparse?: boolean;
      name?: string;
    }
  ): Promise<StorageResult>;

  /**
   * 删除索引
   */
  dropIndex(
    name: string
  ): Promise<StorageResult>;

  /**
   * 获取存储统计信息
   */
  getStats(): Promise<StorageResult<StorageStats>>;

  /**
   * 备份数据
   */
  backup(
    path: string,
    options?: {
      compress?: boolean;
      includeIndexes?: boolean;
    }
  ): Promise<StorageResult>;

  /**
   * 恢复数据
   */
  restore(
    path: string,
    options?: {
      dropExisting?: boolean;
      validateData?: boolean;
    }
  ): Promise<StorageResult>;
} 