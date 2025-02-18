import { BigNumber } from 'ethers';
import { ChainProtocol } from '../chain/abstract';
import { MarketMetrics } from './market-analyzer';
import { StrategyConfig } from './strategy-optimizer';
import { MarketAnalyzer } from './market-analyzer';

export interface RLEnvironmentConfig {
  maxEpisodes: number;
  maxStepsPerEpisode: number;
  initialBalance: BigNumber;
  tradingFee: number;
  slippageTolerance: number;
  rewardScaling: number;
}

export interface RLState {
  balance: BigNumber;
  positions: Array<{
    asset: string;
    amount: BigNumber;
    entryPrice: number;
  }>;
  marketMetrics: MarketMetrics;
  technicalIndicators: {
    rsi: number;
    macd: {
      value: number;
      signal: number;
      histogram: number;
    };
    bollingerBands: {
      upper: number;
      middle: number;
      lower: number;
    };
    atr: number;
    obv: number;
  };
  marketSentiment: {
    overall: number;
    volatility: number;
    momentum: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  timestamp: number;
}

export interface RLAction {
  type: 'buy' | 'sell' | 'hold';
  asset: string;
  amount?: BigNumber;
  price?: number;
}

export interface RLExperience {
  state: RLState;
  action: RLAction;
  reward: number;
  nextState: RLState;
  done: boolean;
}

export interface RLModelConfig {
  architecture: 'dqn' | 'ppo' | 'a2c' | 'sac';
  hyperparameters: {
    learningRate: number;
    gamma: number;
    epsilon: number;
    batchSize: number;
    updateFrequency: number;
    memorySize: number;
  };
  networkStructure: {
    hiddenLayers: number[];
    activation: string;
  };
}

export class RLAgent {
  private experiences: RLExperience[] = [];
  private currentEpisode = 0;
  private totalSteps = 0;
  private model: any; // 实际实现时使用具体的深度学习模型类型
  private targetModel: any; // 目标网络 (用于DQN)
  private optimizer: any; // 优化器

  private trainingMetrics: {
    episodeRewards: number[];
    portfolioValues: number[];
    actions: Array<{
      type: RLAction['type'];
      timestamp: number;
    }>;
    losses: {
      actor?: number[];
      critic?: number[];
      policy?: number[];
      value?: number[];
    };
  } = {
    episodeRewards: [],
    portfolioValues: [],
    actions: [],
    losses: {
      actor: [],
      critic: [],
      policy: [],
      value: [],
    },
  };

  constructor(
    private config: RLModelConfig,
    private envConfig: RLEnvironmentConfig,
    private strategy: StrategyConfig,
    private marketAnalyzer: MarketAnalyzer
  ) {
    this.initializeModels();
  }

  private async initializeModels() {
    // 根据架构类型初始化模型
    switch (this.config.architecture) {
      case 'dqn':
        this.initializeDQN();
        break;
      case 'ppo':
        this.initializePPO();
        break;
      case 'a2c':
        this.initializeA2C();
        break;
      case 'sac':
        this.initializeSAC();
        break;
    }
  }

  private initializeDQN() {
    // 创建DQN网络
    this.model = {
      layers: [
        { type: 'dense', units: 128, activation: 'relu' },
        { type: 'dense', units: 64, activation: 'relu' },
        { type: 'dense', units: 3, activation: 'linear' }, // 3个动作：买入、卖出、持有
      ],
    };

    // 创建目标网络
    this.targetModel = { ...this.model };

    // 配置优化器
    this.optimizer = {
      type: 'adam',
      learningRate: this.config.hyperparameters.learningRate,
    };
  }

  private initializePPO() {
    // 创建Actor网络
    this.model = {
      actor: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 3, activation: 'softmax' },
        ],
      },
      // 创建Critic网络
      critic: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 1, activation: 'linear' },
        ],
      },
    };
  }

  private initializeA2C() {
    // 创建Actor网络
    this.model = {
      actor: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 3, activation: 'softmax' },
        ],
      },
      // 创建Critic网络
      critic: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 1, activation: 'linear' },
        ],
      },
    };

    // 配置优化器
    this.optimizer = {
      actor: {
        type: 'adam',
        learningRate: this.config.hyperparameters.learningRate,
      },
      critic: {
        type: 'adam',
        learningRate: this.config.hyperparameters.learningRate,
      },
    };
  }

  private initializeSAC() {
    // 创建策略网络
    this.model = {
      policy: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 6, activation: 'tanh' }, // 均值和标准差
        ],
      },
      // 创建Q网络1
      q1: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 1, activation: 'linear' },
        ],
      },
      // 创建Q网络2
      q2: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 1, activation: 'linear' },
        ],
      },
      // 创建值网络
      value: {
        layers: [
          { type: 'dense', units: 128, activation: 'relu' },
          { type: 'dense', units: 64, activation: 'relu' },
          { type: 'dense', units: 1, activation: 'linear' },
        ],
      },
    };

    // 配置优化器
    this.optimizer = {
      policy: {
        type: 'adam',
        learningRate: this.config.hyperparameters.learningRate,
      },
      q1: {
        type: 'adam',
        learningRate: this.config.hyperparameters.learningRate,
      },
      q2: {
        type: 'adam',
        learningRate: this.config.hyperparameters.learningRate,
      },
      value: {
        type: 'adam',
        learningRate: this.config.hyperparameters.learningRate,
      },
    };
  }

  async train(
    asset: string,
    chain: ChainProtocol,
    timeframe: string
  ): Promise<void> {
    for (
      this.currentEpisode = 0;
      this.currentEpisode < this.envConfig.maxEpisodes;
      this.currentEpisode++
    ) {
      await this.runEpisode(asset, chain, timeframe);
    }
  }

  private async runEpisode(
    asset: string,
    chain: ChainProtocol,
    timeframe: string
  ): Promise<void> {
    let state = await this.initializeState(asset, chain);
    let done = false;
    let stepCount = 0;

    while (!done && stepCount < this.envConfig.maxStepsPerEpisode) {
      // 选择动作
      const action = await this.selectAction(state);

      // 执行动作
      const { nextState, reward, isDone } = await this.step(state, action);

      // 存储经验
      this.storeExperience({
        state,
        action,
        reward,
        nextState,
        done: isDone,
      });

      // 更新状态
      state = nextState;
      done = isDone;
      stepCount++;
      this.totalSteps++;

      // 训练模型
      if (this.totalSteps % this.config.hyperparameters.updateFrequency === 0) {
        await this.updateModel();
      }
    }
  }

  private async initializeState(
    asset: string,
    chain: ChainProtocol
  ): Promise<RLState> {
    return {
      balance: this.envConfig.initialBalance,
      positions: [],
      marketMetrics: {
        price: 0,
        volume24h: 0,
        liquidity: 0,
        volatility: 0,
        correlation: 0,
      },
      technicalIndicators: {
        rsi: 0,
        macd: {
          value: 0,
          signal: 0,
          histogram: 0,
        },
        bollingerBands: {
          upper: 0,
          middle: 0,
          lower: 0,
        },
        atr: 0,
        obv: 0,
      },
      marketSentiment: {
        overall: 0,
        volatility: 0,
        momentum: 0,
        trend: 'neutral',
      },
      timestamp: Date.now(),
    };
  }

  private async selectAction(state: RLState): Promise<RLAction> {
    // 使用ε-贪婪策略选择动作
    if (Math.random() < this.config.hyperparameters.epsilon) {
      // 探索：随机选择动作
      return this.randomAction(state);
    } else {
      // 利用：使用模型预测最佳动作
      return this.predictBestAction(state);
    }
  }

  private randomAction(state: RLState): RLAction {
    const actionTypes: RLAction['type'][] = ['buy', 'sell', 'hold'];
    const randomType = actionTypes[Math.floor(Math.random() * actionTypes.length)];

    if (randomType === 'hold') {
      return { type: 'hold', asset: '' };
    }

    // 计算可用余额
    const maxAmount = randomType === 'buy' ? state.balance : this.getPositionAmount(state);

    return {
      type: randomType,
      asset: state.positions[0]?.asset || '',
      amount: maxAmount.div(BigNumber.from(Math.floor(Math.random() * 10) + 1)),
      price: state.marketMetrics.price,
    };
  }

  private async predictBestAction(state: RLState): Promise<RLAction> {
    const stateVector = this.preprocessState(state);
    
    switch (this.config.architecture) {
      case 'dqn':
        return this.predictDQNAction(stateVector);
      case 'ppo':
        return this.predictPPOAction(stateVector);
      case 'a2c':
        return this.predictA2CAction(stateVector);
      case 'sac':
        return this.predictSACAction(stateVector);
      default:
        return { type: 'hold', asset: '' };
    }
  }

  private preprocessState(state: RLState): number[] {
    // 将状态转换为神经网络输入向量
    return [
      state.balance.toNumber(),
      state.positions.length,
      state.marketMetrics.price,
      state.marketMetrics.volume24h,
      state.marketMetrics.liquidity,
      state.marketMetrics.volatility,
      state.technicalIndicators.rsi,
      state.technicalIndicators.macd.value,
      state.technicalIndicators.macd.histogram,
      state.technicalIndicators.bollingerBands.upper,
      state.technicalIndicators.bollingerBands.lower,
      state.technicalIndicators.atr,
      state.technicalIndicators.obv,
      state.marketSentiment.overall,
      state.marketSentiment.volatility,
      state.marketSentiment.momentum,
    ];
  }

  private async predictDQNAction(stateVector: number[]): Promise<RLAction> {
    // 使用DQN网络预测Q值
    const qValues = await this.model.predict(stateVector);
    const actionIndex = qValues.indexOf(Math.max(...qValues));

    // 将动作索引转换为具体动作
    switch (actionIndex) {
      case 0:
        return {
          type: 'buy',
          asset: this.strategy.parameters.asset,
          amount: this.calculateTradeAmount('buy'),
          price: this.getCurrentPrice(),
        };
      case 1:
        return {
          type: 'sell',
          asset: this.strategy.parameters.asset,
          amount: this.calculateTradeAmount('sell'),
          price: this.getCurrentPrice(),
        };
      default:
        return { type: 'hold', asset: '' };
    }
  }

  private async predictPPOAction(stateVector: number[]): Promise<RLAction> {
    // 使用Actor网络预测动作概率分布
    const actionProbs = await this.model.actor.predict(stateVector);
    const actionIndex = this.sampleFromDistribution(actionProbs);

    // 将动作索引转换为具体动作
    return this.convertActionIndexToAction(actionIndex);
  }

  private sampleFromDistribution(probs: number[]): number {
    const rand = Math.random();
    let sum = 0;
    for (let i = 0; i < probs.length; i++) {
      sum += probs[i];
      if (rand <= sum) return i;
    }
    return probs.length - 1;
  }

  private convertActionIndexToAction(index: number): RLAction {
    switch (index) {
      case 0:
        return {
          type: 'buy',
          asset: this.strategy.parameters.asset,
          amount: this.calculateTradeAmount('buy'),
          price: this.getCurrentPrice(),
        };
      case 1:
        return {
          type: 'sell',
          asset: this.strategy.parameters.asset,
          amount: this.calculateTradeAmount('sell'),
          price: this.getCurrentPrice(),
        };
      default:
        return { type: 'hold', asset: '' };
    }
  }

  private calculateTradeAmount(type: 'buy' | 'sell'): BigNumber {
    // 实现动态仓位管理
    const positionSize = this.strategy.constraints.maxPositionSize;
    const currentBalance = this.getCurrentBalance();
    
    if (type === 'buy') {
      return currentBalance.mul(BigNumber.from(positionSize * 100)).div(BigNumber.from(100));
    } else {
      const currentPosition = this.getCurrentPosition();
      return currentPosition.amount.mul(BigNumber.from(positionSize * 100)).div(BigNumber.from(100));
    }
  }

  private getCurrentPrice(): number {
    // 获取当前市场价格
    return 0; // 实际实现需要从市场数据中获取
  }

  private getCurrentBalance(): BigNumber {
    // 获取当前账户余额
    return BigNumber.from(0); // 实际实现需要从状态中获取
  }

  private getCurrentPosition(): { asset: string; amount: BigNumber; entryPrice: number } {
    // 获取当前持仓信息
    return {
      asset: '',
      amount: BigNumber.from(0),
      entryPrice: 0,
    }; // 实际实现需要从状态中获取
  }

  private async step(
    state: RLState,
    action: RLAction
  ): Promise<{
    nextState: RLState;
    reward: number;
    isDone: boolean;
  }> {
    // 执行交易动作
    const nextState = await this.executeAction(state, action);

    // 计算奖励
    const reward = this.calculateReward(state, nextState, action);

    // 检查是否结束
    const isDone = this.checkTermination(nextState);

    return {
      nextState,
      reward,
      isDone,
    };
  }

  private async executeAction(
    state: RLState,
    action: RLAction
  ): Promise<RLState> {
    const nextState = { ...state };

    if (action.type === 'hold') {
      return nextState;
    }

    if (action.type === 'buy' && action.amount && action.price) {
      // 执行买入操作
      const cost = action.amount.mul(BigNumber.from(action.price));
      if (cost.lte(state.balance)) {
        nextState.balance = state.balance.sub(cost);
        nextState.positions.push({
          asset: action.asset,
          amount: action.amount,
          entryPrice: action.price,
        });
      }
    } else if (action.type === 'sell' && action.amount && action.price) {
      // 执行卖出操作
      const position = state.positions.find(p => p.asset === action.asset);
      if (position && action.amount.lte(position.amount)) {
        const revenue = action.amount.mul(BigNumber.from(action.price));
        nextState.balance = state.balance.add(revenue);
        position.amount = position.amount.sub(action.amount);
      }
    }

    return nextState;
  }

  private calculateReward(
    state: RLState,
    nextState: RLState,
    action: RLAction
  ): number {
    // 计算基础收益率
    const baseReward = this.calculateBaseReward(state, nextState);
    
    // 计算风险调整后的奖励
    const riskAdjustedReward = this.adjustRewardForRisk(baseReward, state, nextState, action);
    
    // 计算交易成本惩罚
    const costPenalty = this.calculateCostPenalty(action);
    
    // 计算持仓多样性奖励
    const diversityReward = this.calculateDiversityReward(nextState);
    
    // 计算技术指标奖励
    const technicalReward = this.calculateTechnicalReward(state, nextState);
    
    // 计算市场情绪奖励
    const sentimentReward = this.calculateSentimentReward(nextState);
    
    // 组合所有奖励分量
    return (
      baseReward * 0.4 +
      riskAdjustedReward * 0.2 +
      diversityReward * 0.1 +
      technicalReward * 0.15 +
      sentimentReward * 0.15 -
      costPenalty
    ) * this.envConfig.rewardScaling;
  }

  private calculateBaseReward(state: RLState, nextState: RLState): number {
    const portfolioValueBefore = this.calculatePortfolioValue(state);
    const portfolioValueAfter = this.calculatePortfolioValue(nextState);
    return portfolioValueAfter.sub(portfolioValueBefore).div(portfolioValueBefore).toNumber();
  }

  private adjustRewardForRisk(
    baseReward: number,
    state: RLState,
    nextState: RLState,
    action: RLAction
  ): number {
    // 计算波动率风险
    const volatilityRisk = nextState.marketMetrics.volatility;
    
    // 计算回撤风险
    const drawdownRisk = this.calculateDrawdownRisk(state, nextState);
    
    // 计算流动性风险
    const liquidityRisk = this.calculateLiquidityRisk(nextState);
    
    // 计算集中度风险
    const concentrationRisk = this.calculateConcentrationRisk(nextState);
    
    // 综合风险评分
    const riskScore = (
      volatilityRisk * 0.3 +
      drawdownRisk * 0.3 +
      liquidityRisk * 0.2 +
      concentrationRisk * 0.2
    );
    
    // 根据风险调整奖励
    return baseReward * (1 - riskScore);
  }

  private calculateDrawdownRisk(state: RLState, nextState: RLState): number {
    const peak = this.getHistoricalPeak();
    const currentValue = this.calculatePortfolioValue(nextState);
    return Math.max(0, peak.sub(currentValue).div(peak).toNumber());
  }

  private calculateLiquidityRisk(state: RLState): number {
    return Math.max(0, 1 - state.marketMetrics.liquidity / 1000000); // 假设100万为高流动性基准
  }

  private calculateConcentrationRisk(state: RLState): number {
    if (state.positions.length === 0) return 0;
    
    const totalValue = this.calculatePortfolioValue(state);
    let maxPositionRatio = 0;
    
    for (const position of state.positions) {
      const positionValue = position.amount.mul(BigNumber.from(position.entryPrice));
      const ratio = positionValue.div(totalValue).toNumber();
      maxPositionRatio = Math.max(maxPositionRatio, ratio);
    }
    
    return maxPositionRatio;
  }

  private calculateCostPenalty(action: RLAction): number {
    if (action.type === 'hold') return 0;
    
    // 基础交易成本
    let penalty = this.envConfig.tradingFee;
    
    // 滑点成本
    if (action.amount) {
      penalty += this.envConfig.slippageTolerance * action.amount.toNumber();
    }
    
    return penalty;
  }

  private calculateDiversityReward(state: RLState): number {
    if (state.positions.length === 0) return 0;
    
    // 计算持仓分散度
    const positionValues = state.positions.map(pos => 
      pos.amount.mul(BigNumber.from(pos.entryPrice)).toNumber()
    );
    
    const totalValue = positionValues.reduce((a, b) => a + b, 0);
    const weights = positionValues.map(v => v / totalValue);
    
    // 使用Herfindahl-Hirschman指数的倒数作为多样性指标
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    return 1 - hhi;
  }

  private calculateTechnicalReward(state: RLState, nextState: RLState): number {
    let reward = 0;
    
    // RSI信号奖励
    if (nextState.technicalIndicators.rsi < 30) {
      reward += 0.1; // 超卖信号
    } else if (nextState.technicalIndicators.rsi > 70) {
      reward -= 0.1; // 超买信号
    }
    
    // MACD信号奖励
    const macdCrossover = 
      state.technicalIndicators.macd.histogram < 0 &&
      nextState.technicalIndicators.macd.histogram > 0;
    if (macdCrossover) {
      reward += 0.15;
    }
    
    // 布林带信号奖励
    const price = nextState.marketMetrics.price;
    const { upper, lower } = nextState.technicalIndicators.bollingerBands;
    if (price < lower) {
      reward += 0.1; // 价格接近下轨
    } else if (price > upper) {
      reward -= 0.1; // 价格接近上轨
    }
    
    return reward;
  }

  private calculateSentimentReward(state: RLState): number {
    let reward = 0;
    
    // 整体市场情绪奖励
    reward += state.marketSentiment.overall * 0.4;
    
    // 趋势方向奖励
    if (state.marketSentiment.trend === 'bullish') {
      reward += 0.3;
    } else if (state.marketSentiment.trend === 'bearish') {
      reward -= 0.3;
    }
    
    // 动量奖励
    reward += state.marketSentiment.momentum * 0.3;
    
    return reward;
  }

  private calculatePortfolioValue(state: RLState): BigNumber {
    const positionsValue = state.positions.reduce(
      (total, pos) => total.add(pos.amount.mul(BigNumber.from(pos.entryPrice))),
      BigNumber.from(0)
    );
    return state.balance.add(positionsValue);
  }

  private checkTermination(state: RLState): boolean {
    // 检查是否达到终止条件
    const portfolioValue = this.calculatePortfolioValue(state);
    return portfolioValue.lte(BigNumber.from(0));
  }

  private storeExperience(experience: RLExperience): void {
    this.experiences.push(experience);
    if (this.experiences.length > this.config.hyperparameters.memorySize) {
      this.experiences.shift();
    }
  }

  private async updateModel(): Promise<void> {
    const batch = this.sampleExperiences();
    if (batch.length === 0) return;

    switch (this.config.architecture) {
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

  private sampleExperiences(): RLExperience[] {
    const batchSize = Math.min(
      this.config.hyperparameters.batchSize,
      this.experiences.length
    );
    const batch: RLExperience[] = [];

    for (let i = 0; i < batchSize; i++) {
      const index = Math.floor(Math.random() * this.experiences.length);
      batch.push(this.experiences[index]);
    }

    return batch;
  }

  private async updateDQN(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state));
    const nextStates = batch.map(exp => this.preprocessState(exp.nextState));
    const actions = batch.map(exp => this.getActionIndex(exp.action));
    const rewards = batch.map(exp => exp.reward);
    const dones = batch.map(exp => exp.done ? 1 : 0);

    // 计算目标Q值
    const nextQValues = await this.targetModel.predict(nextStates);
    const targetQValues = rewards.map((r, i) => 
      r + (1 - dones[i]) * this.config.hyperparameters.gamma * Math.max(...nextQValues[i])
    );

    // 更新主网络
    await this.model.train(states, actions, targetQValues);

    // 定期更新目标网络
    if (this.totalSteps % this.config.hyperparameters.updateFrequency === 0) {
      this.targetModel = { ...this.model };
    }
  }

  private getActionIndex(action: RLAction): number {
    switch (action.type) {
      case 'buy':
        return 0;
      case 'sell':
        return 1;
      case 'hold':
        return 2;
    }
  }

  private async updatePPO(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state));
    const actions = batch.map(exp => this.getActionIndex(exp.action));
    const rewards = batch.map(exp => exp.reward);
    const dones = batch.map(exp => exp.done ? 1 : 0);

    // 计算优势值
    const values = await this.model.critic.predict(states);
    const nextValues = await this.model.critic.predict(
      batch.map(exp => this.preprocessState(exp.nextState))
    );
    
    const advantages = this.calculateAdvantages(rewards, values, nextValues, dones);

    // 更新Actor和Critic网络
    await this.model.actor.train(states, actions, advantages);
    await this.model.critic.train(states, rewards);
  }

  private calculateAdvantages(
    rewards: number[],
    values: number[],
    nextValues: number[],
    dones: number[]
  ): number[] {
    return rewards.map((r, i) => {
      const nextValue = (1 - dones[i]) * nextValues[i];
      return r + this.config.hyperparameters.gamma * nextValue - values[i];
    });
  }

  private async updateA2C(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state));
    const actions = batch.map(exp => this.getActionIndex(exp.action));
    const rewards = batch.map(exp => exp.reward);
    const dones = batch.map(exp => exp.done ? 1 : 0);

    // 计算优势值
    const values = await this.model.critic.predict(states);
    const nextValues = await this.model.critic.predict(
      batch.map(exp => this.preprocessState(exp.nextState))
    );
    
    const advantages = this.calculateAdvantages(rewards, values, nextValues, dones);

    // 更新Actor网络
    const actionProbs = await this.model.actor.predict(states);
    const actorLoss = this.calculateA2CActorLoss(actionProbs, actions, advantages);
    await this.model.actor.train(states, actorLoss);

    // 更新Critic网络
    const criticLoss = this.calculateA2CCriticLoss(values, rewards, nextValues, dones);
    await this.model.critic.train(states, criticLoss);
  }

  private calculateA2CActorLoss(
    actionProbs: number[][],
    actions: number[],
    advantages: number[]
  ): number {
    // 计算策略梯度损失
    return actionProbs.reduce((loss, probs, i) => {
      const actionProb = probs[actions[i]];
      return loss - Math.log(actionProb) * advantages[i];
    }, 0);
  }

  private calculateA2CCriticLoss(
    values: number[],
    rewards: number[],
    nextValues: number[],
    dones: number[]
  ): number {
    // 计算值函数损失
    return values.reduce((loss, value, i) => {
      const target = rewards[i] + (1 - dones[i]) * this.config.hyperparameters.gamma * nextValues[i];
      return loss + Math.pow(target - value, 2);
    }, 0);
  }

  private async updateSAC(batch: RLExperience[]): Promise<void> {
    // 准备训练数据
    const states = batch.map(exp => this.preprocessState(exp.state));
    const actions = batch.map(exp => this.getActionIndex(exp.action));
    const rewards = batch.map(exp => exp.reward);
    const nextStates = batch.map(exp => this.preprocessState(exp.nextState));
    const dones = batch.map(exp => exp.done ? 1 : 0);

    // 更新Q网络
    const currentQ1 = await this.model.q1.predict(states, actions);
    const currentQ2 = await this.model.q2.predict(states, actions);
    
    // 计算目标Q值
    const nextActions = await this.model.policy.predict(nextStates);
    const nextQ1 = await this.model.q1.predict(nextStates, nextActions);
    const nextQ2 = await this.model.q2.predict(nextStates, nextActions);
    const nextV = await this.model.value.predict(nextStates);
    
    const targetQ = rewards.map((r, i) => 
      r + (1 - dones[i]) * this.config.hyperparameters.gamma * nextV[i]
    );

    // 更新Q网络
    await this.model.q1.train(states, actions, targetQ);
    await this.model.q2.train(states, actions, targetQ);

    // 更新策略网络
    const policyLoss = this.calculateSACPolicyLoss(states);
    await this.model.policy.train(states, policyLoss);

    // 更新值网络
    const valueLoss = this.calculateSACValueLoss(states);
    await this.model.value.train(states, valueLoss);
  }

  private async calculateSACPolicyLoss(states: number[][]): Promise<number> {
    const actions = await this.model.policy.predict(states);
    const q1Values = await this.model.q1.predict(states, actions);
    const q2Values = await this.model.q2.predict(states, actions);
    const qValues = q1Values.map((q1, i) => Math.min(q1, q2Values[i]));
    
    // 计算策略损失（最大化Q值）
    return -qValues.reduce((sum, q) => sum + q, 0) / qValues.length;
  }

  private async calculateSACValueLoss(states: number[][]): Promise<number> {
    const values = await this.model.value.predict(states);
    const actions = await this.model.policy.predict(states);
    const q1Values = await this.model.q1.predict(states, actions);
    const q2Values = await this.model.q2.predict(states, actions);
    
    // 计算值网络损失
    return values.reduce((loss, v, i) => {
      const q = Math.min(q1Values[i], q2Values[i]);
      return loss + Math.pow(q - v, 2);
    }, 0) / values.length;
  }

  async save(path: string): Promise<void> {
    const modelState = {
      config: this.config,
      envConfig: this.envConfig,
      currentEpisode: this.currentEpisode,
      totalSteps: this.totalSteps,
      experiences: this.experiences,
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

  private async serializeModelWeights(model: any): Promise<number[][]> {
    if (!model) return [];
    // 实际实现需要根据具体的深度学习框架来序列化模型权重
    return [];
  }

  private async saveToFile(path: string, data: any): Promise<void> {
    // 实际实现需要使用文件系统API保存数据
    console.log(`Saving model to ${path}`);
  }

  async load(path: string): Promise<void> {
    const modelState = await this.loadFromFile(path);
    
    if (!modelState) {
      throw new Error(`Failed to load model from ${path}`);
    }

    // 恢复配置和状态
    this.config = modelState.config;
    this.envConfig = modelState.envConfig;
    this.currentEpisode = modelState.currentEpisode;
    this.totalSteps = modelState.totalSteps;
    this.experiences = modelState.experiences;
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
    console.log(`Loading model from ${path}`);
    return null;
  }

  private async loadModelWeights(model: any, weights: number[][]): Promise<void> {
    if (!model || !weights) return;
    // 实际实现需要根据具体的深度学习框架来加载模型权重
  }

  getTrainingMetrics(): {
    episodeRewards: number[];
    portfolioValues: number[];
    actions: Array<{
      type: RLAction['type'];
      timestamp: number;
    }>;
    losses: {
      actor?: number[];
      critic?: number[];
      policy?: number[];
      value?: number[];
    };
  } {
    return this.trainingMetrics;
  }

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

  getStatistics(): {
    episodes: number;
    totalSteps: number;
    averageReward: number;
  } {
    const totalReward = this.experiences.reduce((sum, exp) => sum + exp.reward, 0);
    return {
      episodes: this.currentEpisode,
      totalSteps: this.totalSteps,
      averageReward: totalReward / this.experiences.length || 0,
    };
  }
} 