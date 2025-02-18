import { BigNumber } from 'ethers';
import { ChainProtocol } from '../chain/abstract';
import { RLAgent, RLModelConfig, RLEnvironmentConfig } from './reinforcement-learning';
import { MarketAnalyzer } from './market-analyzer';
import { StrategyConfig } from './strategy-optimizer';

export interface FederatedConfig {
  roundInterval: number;
  minParticipants: number;
  aggregationStrategy: 'fedAvg' | 'fedProx' | 'fedAdam';
  privacyBudget: number;
  communicationCompression: number;
  modelUpdateThreshold: number;
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
  private clients: Map<string, RLAgent> = new Map();
  private clientStates: Map<string, ClientState> = new Map();
  private globalModel: number[][] = [];
  private updateBuffer: ModelUpdate[] = [];
  private currentRound = 0;

  constructor(
    private config: FederatedConfig,
    private marketAnalyzer: MarketAnalyzer,
    private privacyParams: PrivacyParams
  ) {}

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

  private async getInitialModel(client: RLAgent): Promise<number[][]> {
    // 获取初始模型权重
    return client.getModelWeights();
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
    await client.updateModelWeights(privatizedModel);
  }

  async trainRound(
    asset: string,
    chain: ChainProtocol,
    timeframe: string
  ): Promise<void> {
    this.currentRound++;
    
    // 并行训练所有客户端
    const trainingPromises = Array.from(this.clients.entries()).map(
      async ([clientId, client]) => {
        // 检查隐私预算
        if (!this.hasPrivacyBudget(clientId)) return;

        // 本地训练
        await this.trainClient(client, asset, chain, timeframe);

        // 获取模型更新
        const update = await this.getModelUpdate(clientId, client);
        
        // 添加到更新缓冲区
        if (update) {
          this.updateBuffer.push(update);
        }
      }
    );

    await Promise.all(trainingPromises);

    // 检查是否有足够的更新进行聚合
    if (this.updateBuffer.length >= this.config.minParticipants) {
      await this.aggregateUpdates();
      this.updateBuffer = [];
    }
  }

  private async trainClient(
    client: RLAgent,
    asset: string,
    chain: ChainProtocol,
    timeframe: string
  ): Promise<void> {
    // 本地训练
    await client.train(asset, chain, timeframe);
    
    // 更新客户端状态
    const clientId = this.getClientId(client);
    if (clientId) {
      const state = this.clientStates.get(clientId);
      if (state) {
        state.samplesProcessed += 1;
        state.lastUpdate = Date.now();
        
        const metrics = client.getTrainingMetrics();
        state.performanceMetrics.loss.push(metrics.loss);
        state.performanceMetrics.accuracy.push(metrics.accuracy);
      }
    }
  }

  private async getModelUpdate(
    clientId: string,
    client: RLAgent
  ): Promise<ModelUpdate | null> {
    const weights = await client.getModelWeights();
    const metrics = client.getTrainingMetrics();

    // 计算更新幅度
    const updateMagnitude = this.calculateUpdateMagnitude(
      weights,
      this.globalModel
    );

    // 如果更新幅度小于阈值，跳过此次更新
    if (updateMagnitude < this.config.modelUpdateThreshold) {
      return null;
    }

    // 应用差分隐私
    const privatizedWeights = this.applyDifferentialPrivacy(
      weights,
      this.privacyParams
    );

    // 压缩权重
    const compressedWeights = this.compressWeights(
      privatizedWeights,
      this.config.communicationCompression
    );

    return {
      clientId,
      weights: compressedWeights,
      metrics: {
        samples: this.clientStates.get(clientId)?.samplesProcessed || 0,
        loss: metrics.loss,
        accuracy: metrics.accuracy,
      },
      timestamp: Date.now(),
    };
  }

  private async aggregateUpdates(): Promise<void> {
    // 根据聚合策略选择方法
    switch (this.config.aggregationStrategy) {
      case 'fedAvg':
        await this.federatedAveraging();
        break;
      case 'fedProx':
        await this.federatedProximal();
        break;
      case 'fedAdam':
        await this.federatedAdam();
        break;
    }

    // 分发更新后的全局模型
    await this.distributeGlobalModelToAll();
  }

  private async federatedAveraging(): Promise<void> {
    // 实现联邦平均算法
    const totalSamples = this.updateBuffer.reduce(
      (sum, update) => sum + update.metrics.samples,
      0
    );

    // 初始化加权平均模型
    const aggregatedModel = this.initializeZeroModel(this.globalModel);

    // 计算加权平均
    for (const update of this.updateBuffer) {
      const weight = update.metrics.samples / totalSamples;
      this.addWeightedModel(aggregatedModel, update.weights, weight);
    }

    this.globalModel = aggregatedModel;
  }

  private async federatedProximal(): Promise<void> {
    // 实现FedProx算法（带近端项正则化的联邦学习）
    const mu = 0.01; // 近端项系数
    
    // 首先进行联邦平均
    await this.federatedAveraging();
    
    // 添加近端项正则化
    for (let i = 0; i < this.globalModel.length; i++) {
      for (let j = 0; j < this.globalModel[i].length; j++) {
        const proximalTerm = mu * (
          this.globalModel[i][j] - this.getAverageClientWeight(i, j)
        );
        this.globalModel[i][j] -= proximalTerm;
      }
    }
  }

  private async federatedAdam(): Promise<void> {
    // 实现FedAdam算法（使用Adam优化器的联邦学习）
    const beta1 = 0.9;
    const beta2 = 0.999;
    const epsilon = 1e-8;
    
    // 初始化动量和二阶矩估计
    if (!this.adamState) {
      this.initializeAdamState();
    }
    
    // 计算梯度
    const gradients = this.calculateGradients();
    
    // 更新动量和二阶矩估计
    this.updateAdamState(gradients, beta1, beta2);
    
    // 应用Adam更新
    this.applyAdamUpdate(epsilon);
  }

  private hasPrivacyBudget(clientId: string): boolean {
    const state = this.clientStates.get(clientId);
    if (!state) return false;
    return state.privacyBudget > 0;
  }

  private applyDifferentialPrivacy(
    weights: number[][],
    params: PrivacyParams
  ): number[][] {
    // 实现差分隐私
    const privatizedWeights = weights.map(layer => {
      // 裁剪梯度
      const clippedLayer = this.clipGradients(layer, params.clipNorm);
      
      // 添加高斯噪声
      return this.addGaussianNoise(clippedLayer, params.noiseSigma);
    });

    return privatizedWeights;
  }

  private clipGradients(gradients: number[], clipNorm: number): number[] {
    const norm = Math.sqrt(
      gradients.reduce((sum, grad) => sum + grad * grad, 0)
    );
    
    if (norm > clipNorm) {
      const scale = clipNorm / norm;
      return gradients.map(grad => grad * scale);
    }
    
    return gradients;
  }

  private addGaussianNoise(
    values: number[],
    sigma: number
  ): number[] {
    return values.map(value => {
      const noise = this.generateGaussianNoise(0, sigma);
      return value + noise;
    });
  }

  private generateGaussianNoise(
    mean: number,
    stdDev: number
  ): number {
    // Box-Muller 变换
    const u1 = Math.random();
    const u2 = Math.random();
    
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + stdDev * z0;
  }

  private compressWeights(
    weights: number[][],
    compressionRate: number
  ): number[][] {
    // 实现权重压缩
    return weights.map(layer => {
      // 量化权重值
      const quantizedLayer = this.quantizeWeights(layer, compressionRate);
      
      // 稀疏化
      return this.sparsifyWeights(quantizedLayer, compressionRate);
    });
  }

  private quantizeWeights(
    weights: number[],
    bits: number
  ): number[] {
    const scale = Math.pow(2, bits) - 1;
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const range = max - min;

    return weights.map(w => {
      const normalized = (w - min) / range;
      const quantized = Math.round(normalized * scale) / scale;
      return quantized * range + min;
    });
  }

  private sparsifyWeights(
    weights: number[],
    keepRatio: number
  ): number[] {
    const threshold = this.calculateSparsityThreshold(weights, keepRatio);
    return weights.map(w => Math.abs(w) >= threshold ? w : 0);
  }

  private calculateSparsityThreshold(
    weights: number[],
    keepRatio: number
  ): number {
    const sortedMagnitudes = weights.map(Math.abs).sort((a, b) => b - a);
    const keepCount = Math.ceil(weights.length * keepRatio);
    return sortedMagnitudes[keepCount - 1];
  }

  private calculateUpdateMagnitude(
    weights1: number[][],
    weights2: number[][]
  ): number {
    let sumSquaredDiff = 0;
    let count = 0;

    for (let i = 0; i < weights1.length; i++) {
      for (let j = 0; j < weights1[i].length; j++) {
        const diff = weights1[i][j] - weights2[i][j];
        sumSquaredDiff += diff * diff;
        count++;
      }
    }

    return Math.sqrt(sumSquaredDiff / count);
  }

  private async distributeGlobalModelToAll(): Promise<void> {
    for (const [clientId, client] of this.clients.entries()) {
      await this.distributeGlobalModel(clientId);
    }
  }

  private getClientId(client: RLAgent): string | undefined {
    for (const [id, c] of this.clients.entries()) {
      if (c === client) return id;
    }
    return undefined;
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
      round: this.currentRound,
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