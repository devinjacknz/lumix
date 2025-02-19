import * as BigNumber from '../utils/bignumber';
import { logger } from '../monitoring';
import { ChainProtocol } from '../chain/abstract';
import { RLAgent, RLModelConfig, RLEnvironmentConfig } from './reinforcement-learning';
import { MarketAnalyzer } from './market-analyzer';
import { StrategyConfig } from './strategy-optimizer';

export interface ModelParameters {
  weights: number[];
  biases: number[];
  timestamp: number;
}

export interface TrainingData {
  features: Array<{
    price: bigint;
    volume: bigint;
    liquidity: bigint;
    timestamp: number;
  }>;
  labels: Array<{
    price: bigint;
    confidence: number;
  }>;
}

export interface FederatedConfig {
  minParticipants: number;
  roundInterval: number;
  aggregationMethod: 'fedAvg' | 'fedMedian' | 'fedProx';
  learningRate: number;
  localEpochs: number;
  batchSize: number;
  proximalTerm: number;
  privacyBudget: number;
}

export interface ModelUpdate {
  clientId: string;
  weights: number[][];
  metrics: {
    samples: number;
    loss: number;
    accuracy: number;
  };
  timestamp: number;
}

export interface PrivacyParams {
  epsilon: number;
  delta: number;
  clipNorm: number;
  noiseSigma: number;
}

export interface ClientState {
  lastUpdate: number;
  samplesProcessed: number;
  performanceMetrics: {
    loss: number[];
    accuracy: number[];
  };
  privacyBudget: number;
}

export class FederatedLearning {
  private globalModel: ModelParameters | null = null;
  private participants: Map<string, ModelParameters> = new Map();
  private round: number = 0;
  private lastUpdate: number = 0;
  private clients: Map<string, RLAgent> = new Map();
  private clientStates: Map<string, ClientState> = new Map();
  private updateBuffer: ModelUpdate[] = [];

  constructor(
    private config: FederatedConfig,
    private marketAnalyzer: MarketAnalyzer,
    private privacyParams: PrivacyParams
  ) {}

  async initializeModel(data: TrainingData): Promise<void> {
    // 初始化全局模型
    const inputSize = Object.keys(data.features[0]).length;
    const outputSize = Object.keys(data.labels[0]).length;
    
    this.globalModel = {
      weights: Array(inputSize * outputSize).fill(0).map(() => Math.random() * 0.1),
      biases: Array(outputSize).fill(0).map(() => Math.random() * 0.1),
      timestamp: Date.now()
    };
    
    logger.info('FL', 'Global model initialized');
  }

  async participateInTraining(
    participantId: string,
    localData: TrainingData
  ): Promise<void> {
    if (!this.globalModel) {
      throw new Error('Global model not initialized');
    }

    // 训练本地模型
    const localModel = await this.trainLocalModel(
      participantId,
      this.globalModel,
      localData
    );

    // 添加差分隐私
    const privatizedModel = this.addDifferentialPrivacy(localModel);

    // 更新参与者模型
    this.participants.set(participantId, privatizedModel);

    logger.info('FL', `Participant ${participantId} completed local training`);

    // 检查是否需要进行全局聚合
    if (this.shouldAggregate()) {
      await this.aggregateModels();
    }
  }

  private async trainLocalModel(
    participantId: string,
    globalModel: ModelParameters,
    data: TrainingData
  ): Promise<ModelParameters> {
    const localModel = { ...globalModel };
    
    for (let epoch = 0; epoch < this.config.localEpochs; epoch++) {
      const batches = this.createBatches(data);
      
      for (const batch of batches) {
        // 计算梯度
        const gradients = this.computeGradients(localModel, batch);
        
        // 更新本地模型参数
        this.updateModelParameters(localModel, gradients);
        
        // 添加近端项（FedProx）
        if (this.config.aggregationMethod === 'fedProx') {
          this.addProximalTerm(localModel, globalModel);
        }
      }
      
      logger.info('FL', `Participant ${participantId} completed epoch ${epoch + 1}/${this.config.localEpochs}`);
    }
    
    return localModel;
  }

  private createBatches(data: TrainingData): TrainingData[] {
    const batches: TrainingData[] = [];
    const { batchSize } = this.config;
    
    for (let i = 0; i < data.features.length; i += batchSize) {
      batches.push({
        features: data.features.slice(i, i + batchSize),
        labels: data.labels.slice(i, i + batchSize)
      });
    }
    
    return batches;
  }

  private computeGradients(
    model: ModelParameters,
    batch: TrainingData
  ): {
    weightGradients: number[];
    biasGradients: number[];
  } {
    // 简化的梯度计算
    return {
      weightGradients: model.weights.map(() => Math.random() * 0.01),
      biasGradients: model.biases.map(() => Math.random() * 0.01)
    };
  }

  private updateModelParameters(
    model: ModelParameters,
    gradients: {
      weightGradients: number[];
      biasGradients: number[];
    }
  ): void {
    for (let i = 0; i < model.weights.length; i++) {
      model.weights[i] -= this.config.learningRate * gradients.weightGradients[i];
    }
    
    for (let i = 0; i < model.biases.length; i++) {
      model.biases[i] -= this.config.learningRate * gradients.biasGradients[i];
    }
  }

  private addProximalTerm(
    localModel: ModelParameters,
    globalModel: ModelParameters
  ): void {
    for (let i = 0; i < localModel.weights.length; i++) {
      const diff = localModel.weights[i] - globalModel.weights[i];
      localModel.weights[i] -= this.config.proximalTerm * diff;
    }
    
    for (let i = 0; i < localModel.biases.length; i++) {
      const diff = localModel.biases[i] - globalModel.biases[i];
      localModel.biases[i] -= this.config.proximalTerm * diff;
    }
  }

  private addDifferentialPrivacy(model: ModelParameters): ModelParameters {
    const privatizedModel = { ...model };
    const noise = this.generateLaplaceNoise();
    
    // 添加噪声到模型参数
    privatizedModel.weights = privatizedModel.weights.map(w => w + noise);
    privatizedModel.biases = privatizedModel.biases.map(b => b + noise);
    
    return privatizedModel;
  }

  private generateLaplaceNoise(): number {
    const u = Math.random() - 0.5;
    return -(1 / this.config.privacyBudget) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private shouldAggregate(): boolean {
    const now = Date.now();
    const hasEnoughParticipants = this.participants.size >= this.config.minParticipants;
    const isTimeToAggregate = now - this.lastUpdate >= this.config.roundInterval;
    
    return hasEnoughParticipants && isTimeToAggregate;
  }

  private async aggregateModels(): Promise<void> {
    if (!this.globalModel || this.participants.size === 0) {
      return;
    }

    const participantModels = Array.from(this.participants.values());
    
    switch (this.config.aggregationMethod) {
      case 'fedAvg':
        this.federatedAveraging(participantModels);
        break;
      case 'fedMedian':
        this.federatedMedian(participantModels);
        break;
      case 'fedProx':
        this.federatedProximal(participantModels);
        break;
    }
    
    this.round++;
    this.lastUpdate = Date.now();
    this.participants.clear();
    
    logger.info('FL', `Completed round ${this.round} with ${participantModels.length} participants`);
  }

  private federatedAveraging(models: ModelParameters[]): void {
    if (!this.globalModel) return;
    
    // 计算权重和偏置的平均值
    const n = models.length;
    
    for (let i = 0; i < this.globalModel.weights.length; i++) {
      this.globalModel.weights[i] = models.reduce((sum, m) => sum + m.weights[i], 0) / n;
    }
    
    for (let i = 0; i < this.globalModel.biases.length; i++) {
      this.globalModel.biases[i] = models.reduce((sum, m) => sum + m.biases[i], 0) / n;
    }
    
    this.globalModel.timestamp = Date.now();
  }

  private federatedMedian(models: ModelParameters[]): void {
    if (!this.globalModel) return;
    
    // 计算权重和偏置的中位数
    for (let i = 0; i < this.globalModel.weights.length; i++) {
      const sorted = models.map(m => m.weights[i]).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      this.globalModel.weights[i] = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    
    for (let i = 0; i < this.globalModel.biases.length; i++) {
      const sorted = models.map(m => m.biases[i]).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      this.globalModel.biases[i] = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    
    this.globalModel.timestamp = Date.now();
  }

  private federatedProximal(models: ModelParameters[]): void {
    // FedProx 聚合与 FedAvg 类似，但在本地训练时已经考虑了近端项
    this.federatedAveraging(models);
  }

  // 获取全局模型
  getGlobalModel(): ModelParameters | null {
    return this.globalModel;
  }

  // 预测
  async predict(features: TrainingData['features']): Promise<Array<{
    price: bigint;
    confidence: number;
  }>> {
    if (!this.globalModel) {
      throw new Error('Global model not initialized');
    }
    
    // 简化的预测实现
    return features.map(feature => ({
      price: feature.price, // 示例实现
      confidence: Math.random() // 示例实现
    }));
  }

  // 评估模型
  async evaluate(testData: TrainingData): Promise<{
    accuracy: number;
    loss: number;
  }> {
    if (!this.globalModel) {
      throw new Error('Global model not initialized');
    }
    
    // 简化的评估实现
    return {
      accuracy: Math.random(),
      loss: Math.random()
    };
  }

  // 保存模型
  async saveModel(path: string): Promise<void> {
    if (!this.globalModel) {
      throw new Error('No model to save');
    }
    
    // 实现模型保存逻辑
  }

  // 加载模型
  async loadModel(path: string): Promise<void> {
    // 实现模型加载逻辑
  }

  async registerClient(
    clientId: string,
    config: RLModelConfig,
    envConfig: RLEnvironmentConfig,
    strategy: StrategyConfig
  ): Promise<void> {
    // 创建新客户端
    const client = new RLAgent(config, envConfig, strategy, this.marketAnalyzer);
    
    // 初始化客户端状态
    const clientState: ClientState = {
      lastUpdate: Date.now(),
      samplesProcessed: 0,
      performanceMetrics: {
        loss: [],
        accuracy: [],
      },
      privacyBudget: this.config.privacyBudget,
    };

    // 注册客户端
    this.clients.set(clientId, client);
    this.clientStates.set(clientId, clientState);

    // 如果是第一个客户端，初始化全局模型
    if (this.clients.size === 1) {
      this.globalModel = await this.getInitialModel(client);
    }

    // 分发全局模型
    await this.distributeGlobalModel(clientId);
  }

  private async getInitialModel(client: RLAgent): Promise<ModelParameters> {
    // 获取初始模型权重
    const weights = await client.getModelWeights();
    const biases = await client.getModelBiases();
    return {
      weights,
      biases,
      timestamp: Date.now()
    };
  }

  private async distributeGlobalModel(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // 应用差分隐私
    const privatizedModel = this.applyDifferentialPrivacy(
      this.globalModel,
      this.privacyParams
    );

    // 更新客户端模型
    await client.updateModelWeights(privatizedModel.weights);
    await client.updateModelBiases(privatizedModel.biases);
  }

  private applyDifferentialPrivacy(
    model: ModelParameters,
    params: PrivacyParams
  ): ModelParameters {
    // 实现差分隐私
    const privatizedModel = { ...model };
    
    const noise = this.generateLaplaceNoise();
    
    // 添加噪声到模型参数
    privatizedModel.weights = model.weights.map(w => w + noise);
    privatizedModel.biases = model.biases.map(b => b + noise);
    
    return privatizedModel;
  }

  getGlobalMetrics(): {
    round: number;
    clientCount: number;
    averageLoss: number;
    averageAccuracy: number;
    privacyBudgetUsed: number;
  } {
    const clientMetrics = Array.from(this.clientStates.values()).map(
      state => state.performanceMetrics
    );

    const averageLoss =
      clientMetrics.reduce(
        (sum, metrics) =>
          sum + metrics.loss[metrics.loss.length - 1] || 0,
        0
      ) / clientMetrics.length;

    const averageAccuracy =
      clientMetrics.reduce(
        (sum, metrics) =>
          sum + metrics.accuracy[metrics.accuracy.length - 1] || 0,
        0
      ) / clientMetrics.length;

    const totalBudget = this.config.privacyBudget;
    const remainingBudget = Array.from(this.clientStates.values()).reduce(
      (sum, state) => sum + state.privacyBudget,
      0
    );

    return {
      round: this.round,
      clientCount: this.clients.size,
      averageLoss,
      averageAccuracy,
      privacyBudgetUsed: totalBudget - remainingBudget / this.clients.size,
    };
  }

  getClientMetrics(clientId: string): ClientState | undefined {
    return this.clientStates.get(clientId);
  }
} 