import * as BigNumber from '../utils/bignumber';
import { logger } from '../monitoring';

export interface State {
  price: bigint;
  volume: bigint;
  position: bigint;
  balance: bigint;
  marketTrend: number;
  volatility: number;
}

export interface Action {
  type: 'buy' | 'sell' | 'hold';
  amount: bigint;
  price: bigint;
}

export interface RLConfig {
  learningRate: number;
  discountFactor: number;
  explorationRate: number;
  minExplorationRate: number;
  explorationDecay: number;
  batchSize: number;
  memorySize: number;
  updateInterval: number;
  minPosition: bigint;
  maxPosition: bigint;
  hyperparameters: {
    gamma: number;
    updateFrequency: number;
    batchSize: number;
  };
}

export interface RLExperience {
  state: State;
  action: Action;
  reward: number;
  nextState: State;
  done: boolean;
}

export interface RLModel {
  actor: NeuralNetwork;
  critic: NeuralNetwork;
  policy: NeuralNetwork;
  value: NeuralNetwork;
  q1: NeuralNetwork;
  q2: NeuralNetwork;
}

export interface NeuralNetwork {
  predict(input: number[][]): Promise<number[][]>;
  train(states: number[][], actions: number[][], targets: number[][]): Promise<void>;
  getWeights(): Promise<number[]>;
  setWeights(weights: number[]): Promise<void>;
}

export interface TrainingMetrics {
  episodeRewards: number[];
  portfolioValues: number[];
  actions: Array<{
    type: Action['type'];
    timestamp: number;
  }>;
  losses: {
    actor?: number[];
    critic?: number[];
    policy?: number[];
    value?: number[];
  };
}

export class ReinforcementLearning {
  private qTable: Map<string, Map<string, number>> = new Map();
  private replayMemory: RLExperience[] = [];
  private currentEpisode: number = 0;
  private totalSteps: number = 0;
  private model!: RLModel;
  private targetModel!: RLModel;
  private trainingMetrics: TrainingMetrics = {
    episodeRewards: [],
    portfolioValues: [],
    actions: [],
    losses: {}
  };

  constructor(private config: RLConfig) {
    this.initializeModels();
  }

  private async initializeModels() {
    // 初始化模型结构
    this.model = {
      actor: await this.createNetwork([6, 128, 64, 3]),
      critic: await this.createNetwork([6, 128, 64, 1]),
      policy: await this.createNetwork([6, 128, 64, 3]),
      value: await this.createNetwork([6, 128, 64, 1]),
      q1: await this.createNetwork([9, 128, 64, 1]), // state + action
      q2: await this.createNetwork([9, 128, 64, 1])  // state + action
    };
    this.targetModel = { ...this.model };
  }

  private async createNetwork(layers: number[]): Promise<NeuralNetwork> {
    // 这里应该实现具体的神经网络创建逻辑
    // 示例实现
    return {
      async predict(input: number[][]): Promise<number[][]> {
        // 实现预测逻辑
        return [Array(layers[layers.length - 1]).fill(0).map(() => Math.random())];
      },
      async train(states: number[][], actions: number[][], targets: number[][]): Promise<void> {
        // 实现训练逻辑
      },
      async getWeights(): Promise<number[]> {
        // 实现获取权重逻辑
        return Array(layers.reduce((a, b) => a + b, 0)).fill(0).map(() => Math.random());
      },
      async setWeights(weights: number[]): Promise<void> {
        // 实现设置权重逻辑
      }
    };
  }

  async train(
    initialState: State,
    episodes: number,
    maxSteps: number
  ): Promise<void> {
    this.currentEpisode = 0;
    
    while (this.currentEpisode < episodes) {
      let state = { ...initialState };
      let totalReward = 0;
      
      for (let step = 0; step < maxSteps; step++) {
        // 选择动作
        const action = this.selectAction(state);
        
        // 执行动作并获取奖励
        const { nextState, reward } = await this.executeAction(state, action);
        
        // 存储经验
        this.storeExperience({
          state,
          action,
          reward,
          nextState,
          done: step === maxSteps - 1
        });
        
        // 更新模型
        if (this.replayMemory.length >= this.config.batchSize) {
          await this.updateModel();
        }
        
        totalReward += reward;
        state = nextState;
        this.totalSteps++;
        
        // 记录训练进度
        if (step % this.config.updateInterval === 0) {
          logger.info('RL', `Episode ${this.currentEpisode + 1}/${episodes}, Step ${step + 1}, Reward ${totalReward}`);
        }
      }
      
      // 更新训练指标
      this.trainingMetrics.episodeRewards.push(totalReward);
      
      this.currentEpisode++;
      this.updateExplorationRate();
    }
  }

  private selectAction(state: State): Action {
    // ε-贪心策略
    if (Math.random() < this.config.explorationRate) {
      return this.randomAction(state);
    }
    
    return this.bestAction(state);
  }

  private async executeAction(state: State, action: Action): Promise<{
    nextState: State;
    reward: number;
  }> {
    // 模拟执行动作
    const nextState = { ...state };
    
    switch (action.type) {
      case 'buy':
        if (BigNumber.lt(state.balance, BigNumber.mul(action.amount, action.price))) {
          return { nextState, reward: -1 }; // 余额不足
        }
        nextState.position = BigNumber.add(state.position, action.amount);
        nextState.balance = BigNumber.sub(state.balance, BigNumber.mul(action.amount, action.price));
        break;
        
      case 'sell':
        if (BigNumber.lt(state.position, action.amount)) {
          return { nextState, reward: -1 }; // 持仓不足
        }
        nextState.position = BigNumber.sub(state.position, action.amount);
        nextState.balance = BigNumber.add(state.balance, BigNumber.mul(action.amount, action.price));
        break;
        
      case 'hold':
        // 不做任何改变
        break;
    }
    
    // 计算奖励
    const reward = this.calculateReward(state, action, nextState);
    
    return { nextState, reward };
  }

  private calculateReward(state: State, action: Action, nextState: State): number {
    // 计算动作的奖励
    let reward = 0;
    
    // 基于利润计算奖励
    const profitLoss = Number(BigNumber.sub(nextState.balance, state.balance));
    reward += profitLoss > 0 ? Math.log(profitLoss + 1) : -Math.log(Math.abs(profitLoss) + 1);
    
    // 基于市场趋势的奖励
    if (action.type === 'buy' && state.marketTrend > 0) {
      reward += 0.5;
    } else if (action.type === 'sell' && state.marketTrend < 0) {
      reward += 0.5;
    }
    
    // 基于波动性的惩罚
    if (action.type !== 'hold' && state.volatility > 0.1) {
      reward -= state.volatility;
    }
    
    // 持仓限制的惩罚
    if (BigNumber.lt(nextState.position, this.config.minPosition) ||
        BigNumber.gt(nextState.position, this.config.maxPosition)) {
      reward -= 1;
    }
    
    return reward;
  }

  private storeExperience(experience: RLExperience): void {
    this.replayMemory.push(experience);
    
    // 限制经验回放内存大小
    if (this.replayMemory.length > this.config.memorySize) {
      this.replayMemory.shift();
    }
  }

  private async updateModel(): Promise<void> {
    const batch = this.sampleExperiences();
    
    switch (this.getModelType()) {
      case 'dqn':
        await this.updateDQN(batch);
        break;
      case 'ppo':
        await this.updatePPO(batch);
        break;
      case 'a2c':
        await this.updateA2C(batch);
        break;
      case 'sac':
        await this.updateSAC(batch);
        break;
    }
  }

  private getModelType(): 'dqn' | 'ppo' | 'a2c' | 'sac' {
    // 根据模型结构判断类型
    if (this.model.q1 && this.model.q2) return 'sac';
    if (this.model.actor && this.model.critic) return 'a2c';
    if (this.model.policy) return 'ppo';
    return 'dqn';
  }

  private sampleExperiences(): RLExperience[] {
    const batchSize = Math.min(
      this.config.batchSize,
      this.replayMemory.length
    );
    const batch: RLExperience[] = [];

    for (let i = 0; i < batchSize; i++) {
      const index = Math.floor(Math.random() * this.replayMemory.length);
      batch.push(this.replayMemory[index]);
    }

    return batch;
  }

  private preprocessState(state: State): number[][] {
    // 将状态转换为二维数组格式，每个状态是一个样本
    return [[
      Number(state.price),
      Number(state.volume),
      Number(state.position),
      Number(state.balance),
      state.marketTrend,
      state.volatility
    ]];
  }

  private async updateDQN(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state)[0]);
    const nextStates = batch.map(exp => this.preprocessState(exp.nextState)[0]);
    const actions = batch.map(exp => [this.getActionIndex(exp.action)]);
    const rewards = batch.map(exp => [exp.reward]);
    const dones = batch.map(exp => [exp.done ? 1 : 0]);

    // 计算目标Q值
    const nextQValues = await this.targetModel.q1.predict(nextStates);
    const targetQValues = rewards.map((r, i) => [
      r[0] + (1 - dones[i][0]) * this.config.hyperparameters.gamma * Math.max(...nextQValues[i])
    ]);

    // 更新主网络
    await this.model.q1.train(states, actions, targetQValues);

    // 定期更新目标网络
    if (this.totalSteps % this.config.hyperparameters.updateFrequency === 0) {
      this.targetModel = {
        actor: await this.cloneNetwork(this.model.actor),
        critic: await this.cloneNetwork(this.model.critic),
        policy: await this.cloneNetwork(this.model.policy),
        value: await this.cloneNetwork(this.model.value),
        q1: await this.cloneNetwork(this.model.q1),
        q2: await this.cloneNetwork(this.model.q2)
      };
    }
  }

  private async cloneNetwork(network: NeuralNetwork): Promise<NeuralNetwork> {
    const weights = await network.getWeights();
    const clone = await this.createNetwork([6, 128, 64, 3]); // 使用相同的网络结构
    await clone.setWeights(weights);
    return clone;
  }

  private getActionIndex(action: Action): number {
    switch (action.type) {
      case 'buy': return 0;
      case 'sell': return 1;
      case 'hold': return 2;
    }
  }

  private async updatePPO(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state)[0]);
    const nextStates = batch.map(exp => this.preprocessState(exp.nextState)[0]);
    const actions = batch.map(exp => [this.getActionIndex(exp.action)]);
    const rewards = batch.map(exp => [exp.reward]);
    const dones = batch.map(exp => [exp.done ? 1 : 0]);

    // 计算优势值
    const values = await this.model.critic.predict(states);
    const nextValues = await this.model.critic.predict(nextStates);
    
    const advantages = this.calculateAdvantages(rewards.map(r => r[0]), values, nextValues, dones.map(d => d[0]));
    const advantagesArray = advantages.map(adv => [adv]);

    // 更新Actor和Critic网络
    await this.model.actor.train(states, actions, advantagesArray);
    await this.model.critic.train(states, actions, rewards);
  }

  private calculateAdvantages(
    rewards: number[],
    values: number[][],
    nextValues: number[][],
    dones: number[]
  ): number[] {
    return rewards.map((r, i) => {
      const nextValue = (1 - dones[i]) * nextValues[i][0];
      return r + this.config.hyperparameters.gamma * nextValue - values[i][0];
    });
  }

  private async updateA2C(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state)[0]);
    const nextStates = batch.map(exp => this.preprocessState(exp.nextState)[0]);
    const actions = batch.map(exp => [this.getActionIndex(exp.action)]);
    const rewards = batch.map(exp => [exp.reward]);
    const dones = batch.map(exp => [exp.done ? 1 : 0]);

    // 计算优势值
    const values = await this.model.critic.predict(states);
    const nextValues = await this.model.critic.predict(nextStates);
    
    const advantages = this.calculateAdvantages(rewards.map(r => r[0]), values, nextValues, dones.map(d => d[0]));
    const advantagesArray = advantages.map(adv => [adv]);

    // 更新Actor网络
    const actionProbs = await this.model.actor.predict(states);
    const actorLoss = this.calculateA2CActorLoss(actionProbs, actions, advantagesArray);
    await this.model.actor.train(states, actions, [[actorLoss]]);

    // 更新Critic网络
    const criticLoss = this.calculateA2CCriticLoss(values, rewards, nextValues, dones);
    await this.model.critic.train(states, actions, [[criticLoss]]);
  }

  private calculateA2CActorLoss(
    actionProbs: number[][],
    actions: number[][],
    advantages: number[][]
  ): number {
    // 计算策略梯度损失
    const actionProb = actionProbs[0][actions[0][0]];
    return -Math.log(actionProb) * advantages[0][0];
  }

  private calculateA2CCriticLoss(
    values: number[][],
    rewards: number[][],
    nextValues: number[][],
    dones: number[][]
  ): number {
    // 计算值函数损失
    const target = rewards[0][0] + (1 - dones[0][0]) * this.config.hyperparameters.gamma * nextValues[0][0];
    return Math.pow(target - values[0][0], 2);
  }

  private async updateSAC(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state)[0]);
    const nextStates = batch.map(exp => this.preprocessState(exp.nextState)[0]);
    const actions = batch.map(exp => [this.getActionIndex(exp.action)]);
    const rewards = batch.map(exp => [exp.reward]);
    const dones = batch.map(exp => [exp.done ? 1 : 0]);

    // 更新Q网络
    const currentQ1 = await this.model.q1.predict(states);
    const currentQ2 = await this.model.q2.predict(states);
    
    // 计算目标Q值
    const nextActions = await this.model.policy.predict(nextStates);
    const nextQ1 = await this.model.q1.predict(nextStates);
    const nextQ2 = await this.model.q2.predict(nextStates);
    const nextV = await this.model.value.predict(nextStates);
    
    const targetQ = rewards.map((r, i) => [
      r[0] + (1 - dones[i][0]) * this.config.hyperparameters.gamma * nextV[i][0]
    ]);

    // 更新Q网络
    await this.model.q1.train(states, actions, targetQ);
    await this.model.q2.train(states, actions, targetQ);

    // 更新策略网络
    const policyLoss = await this.calculateSACPolicyLoss(states);
    await this.model.policy.train(states, actions, [[policyLoss]]);

    // 更新值网络
    const valueLoss = await this.calculateSACValueLoss(states);
    await this.model.value.train(states, actions, [[valueLoss]]);
  }

  private async calculateSACPolicyLoss(states: number[][]): Promise<number> {
    const actions = await this.model.policy.predict(states);
    const q1Values = await this.model.q1.predict(states);
    const q2Values = await this.model.q2.predict(states);
    const qValues = q1Values.map((q1, i) => Math.min(q1[0], q2Values[i][0]));
    
    // 计算策略损失（最大化Q值）
    return -qValues.reduce((sum, q) => sum + q, 0) / qValues.length;
  }

  private async calculateSACValueLoss(states: number[][]): Promise<number> {
    const values = await this.model.value.predict(states);
    const actions = await this.model.policy.predict(states);
    const q1Values = await this.model.q1.predict(states);
    const q2Values = await this.model.q2.predict(states);
    
    // 计算值网络损失
    return values.reduce((loss, v, i) => {
      const q = Math.min(q1Values[i][0], q2Values[i][0]);
      return loss + Math.pow(q - v[0], 2);
    }, 0) / values.length;
  }

  private randomAction(state: State): Action {
    const types: Action['type'][] = ['buy', 'sell', 'hold'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    // 根据当前状态生成合理的随机动作
    let amount = 0n;
    if (type !== 'hold') {
      const maxAmount = type === 'buy'
        ? BigNumber.div(state.balance, state.price)
        : state.position;
      amount = BigNumber.toBigInt(Math.floor(Math.random() * Number(maxAmount)));
    }
    
    return {
      type,
      amount,
      price: state.price
    };
  }

  private bestAction(state: State): Action {
    const stateKey = this.getStateKey(state);
    const stateActions = this.qTable.get(stateKey);
    
    if (!stateActions || stateActions.size === 0) {
      return this.randomAction(state);
    }
    
    let bestActionKey = Array.from(stateActions.keys())[0];
    let maxQ = stateActions.get(bestActionKey)!;
    
    for (const [actionKey, qValue] of stateActions) {
      if (qValue > maxQ) {
        maxQ = qValue;
        bestActionKey = actionKey;
      }
    }
    
    return JSON.parse(bestActionKey);
  }

  private getStateKey(state: State): string {
    // 将状态离散化并生成唯一键
    return JSON.stringify({
      price: BigNumber.toString(state.price),
      volume: BigNumber.toString(state.volume),
      position: BigNumber.toString(state.position),
      balance: BigNumber.toString(state.balance),
      marketTrend: Math.round(state.marketTrend * 10) / 10,
      volatility: Math.round(state.volatility * 10) / 10
    });
  }

  private getActionKey(action: Action): string {
    // 生成动作的唯一键
    return JSON.stringify({
      type: action.type,
      amount: BigNumber.toString(action.amount),
      price: BigNumber.toString(action.price)
    });
  }

  private updateExplorationRate(): void {
    this.config.explorationRate = Math.max(
      this.config.minExplorationRate,
      this.config.explorationRate * this.config.explorationDecay
    );
  }

  // 获取当前策略
  getPolicy(): Map<string, Action> {
    const policy = new Map<string, Action>();
    
    for (const [stateKey, stateActions] of this.qTable) {
      let bestAction = null;
      let maxQ = -Infinity;
      
      for (const [actionKey, qValue] of stateActions) {
        if (qValue > maxQ) {
          maxQ = qValue;
          bestAction = JSON.parse(actionKey);
        }
      }
      
      if (bestAction) {
        policy.set(stateKey, bestAction);
      }
    }
    
    return policy;
  }

  // 获取训练指标
  getTrainingMetrics(): TrainingMetrics {
    return { ...this.trainingMetrics };
  }

  // 获取性能指标
  getPerformanceMetrics(): {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    averageWin: number;
    averageLoss: number;
  } {
    const returns = this.calculateReturns();
    const volatility = this.calculateVolatility(returns);
    
    return {
      totalReturn: this.calculateTotalReturn(),
      sharpeRatio: this.calculateSharpeRatio(returns, volatility),
      maxDrawdown: this.calculateMaxDrawdown(),
      winRate: this.calculateWinRate(),
      averageWin: this.calculateAverageWin(),
      averageLoss: this.calculateAverageLoss(),
    };
  }

  private calculateReturns(): number[] {
    const values = this.trainingMetrics.portfolioValues;
    const returns: number[] = [];
    
    for (let i = 1; i < values.length; i++) {
      returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
    
    return returns;
  }

  private calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / returns.length);
  }

  private calculateTotalReturn(): number {
    const values = this.trainingMetrics.portfolioValues;
    if (values.length < 2) return 0;
    return (values[values.length - 1] - values[0]) / values[0];
  }

  private calculateSharpeRatio(returns: number[], volatility: number): number {
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const riskFreeRate = 0.02; // 假设年化无风险利率为2%
    return (meanReturn - riskFreeRate) / volatility;
  }

  private calculateMaxDrawdown(): number {
    const values = this.trainingMetrics.portfolioValues;
    let maxDrawdown = 0;
    let peak = values[0];
    
    for (const value of values) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateWinRate(): number {
    const returns = this.calculateReturns();
    const wins = returns.filter(r => r > 0).length;
    return wins / returns.length;
  }

  private calculateAverageWin(): number {
    const returns = this.calculateReturns();
    const wins = returns.filter(r => r > 0);
    return wins.reduce((a, b) => a + b, 0) / wins.length;
  }

  private calculateAverageLoss(): number {
    const returns = this.calculateReturns();
    const losses = returns.filter(r => r < 0);
    return losses.reduce((a, b) => a + b, 0) / losses.length;
  }

  // 获取统计信息
  getStatistics(): {
    episodes: number;
    totalSteps: number;
    averageReward: number;
  } {
    const totalReward = this.replayMemory.reduce((sum, exp) => sum + exp.reward, 0);
    return {
      episodes: this.currentEpisode,
      totalSteps: this.totalSteps,
      averageReward: totalReward / this.replayMemory.length || 0,
    };
  }

  // 保存模型
  async save(path: string): Promise<void> {
    const modelState = {
      config: this.config,
      currentEpisode: this.currentEpisode,
      totalSteps: this.totalSteps,
      experiences: this.replayMemory,
      trainingMetrics: this.trainingMetrics,
      modelWeights: {
        actor: await this.serializeModelWeights(this.model.actor),
        critic: await this.serializeModelWeights(this.model.critic),
        policy: await this.serializeModelWeights(this.model.policy),
        value: await this.serializeModelWeights(this.model.value),
        q1: await this.serializeModelWeights(this.model.q1),
        q2: await this.serializeModelWeights(this.model.q2),
      },
    };

    await this.saveToFile(path, modelState);
  }

  private async serializeModelWeights(model: any): Promise<number[]> {
    if (!model) return [];
    // 实际实现需要根据具体的深度学习框架来序列化模型权重
    return [];
  }

  private async saveToFile(path: string, data: any): Promise<void> {
    // 实际实现需要使用文件系统API保存数据
    logger.info('RL', `Saving model to ${path}`);
  }

  // 加载模型
  async load(path: string): Promise<void> {
    const modelState = await this.loadFromFile(path);
    
    if (!modelState) {
      throw new Error(`Failed to load model from ${path}`);
    }

    // 恢复配置和状态
    this.config = modelState.config;
    this.currentEpisode = modelState.currentEpisode;
    this.totalSteps = modelState.totalSteps;
    this.replayMemory = modelState.experiences;
    this.trainingMetrics = modelState.trainingMetrics;

    // 重新初始化模型
    await this.initializeModels();

    // 加载模型权重
    await this.loadModelWeights(this.model.actor, modelState.modelWeights.actor);
    await this.loadModelWeights(this.model.critic, modelState.modelWeights.critic);
    await this.loadModelWeights(this.model.policy, modelState.modelWeights.policy);
    await this.loadModelWeights(this.model.value, modelState.modelWeights.value);
    await this.loadModelWeights(this.model.q1, modelState.modelWeights.q1);
    await this.loadModelWeights(this.model.q2, modelState.modelWeights.q2);
  }

  private async loadFromFile(path: string): Promise<any> {
    // 实际实现需要使用文件系统API加载数据
    logger.info('RL', `Loading model from ${path}`);
    return null;
  }

  private async loadModelWeights(model: any, weights: number[]): Promise<void> {
    if (!model || !weights) return;
    // 实际实现需要根据具体的深度学习框架来加载模型权重
  }
}