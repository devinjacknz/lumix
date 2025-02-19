import { TechnicalIndicators } from './types';
import { Statistics } from './statistics';

export class Indicators implements TechnicalIndicators {
  private statistics: Statistics;

  constructor() {
    this.statistics = new Statistics();
  }

  // 简单移动平均线 (SMA)
  public sma(data: number[], period: number): number[] {
    return this.statistics.movingAverage(data, period);
  }

  // 指数移动平均线 (EMA)
  public ema(data: number[], period: number): number[] {
    return this.statistics.exponentialMovingAverage(data, period);
  }

  // 相对强弱指标 (RSI)
  public rsi(data: number[], period: number): number[] {
    const rsi: number[] = [];
    const changes: number[] = [];

    // 计算价格变化
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1]);
    }

    // 计算初始的平均涨跌幅
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      if (changes[i] < 0) avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    // 计算第一个RSI值
    let rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));

    // 计算后续的RSI值
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;

      rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }

    return rsi;
  }

  // 移动平均收敛散度 (MACD)
  public macd(
    data: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): {
    macd: number[];
    signal: number[];
    histogram: number[];
  } {
    // 计算快速和慢速EMA
    const fastEMA = this.ema(data, fastPeriod);
    const slowEMA = this.ema(data, slowPeriod);

    // 计算MACD线
    const macdLine: number[] = [];
    const startIndex = slowPeriod - 1;
    for (let i = startIndex; i < data.length; i++) {
      macdLine.push(fastEMA[i - (slowPeriod - fastPeriod)] - slowEMA[i]);
    }

    // 计算信号线
    const signalLine = this.ema(macdLine, signalPeriod);

    // 计算MACD柱状图
    const histogram = macdLine.slice(signalPeriod - 1).map((macd, i) => 
      macd - signalLine[i]
    );

    return {
      macd: macdLine.slice(signalPeriod - 1),
      signal: signalLine,
      histogram
    };
  }

  // 布林带
  public bollinger(
    data: number[],
    period: number = 20,
    stdDev: number = 2
  ): {
    middle: number[];
    upper: number[];
    lower: number[];
  } {
    const middle = this.sma(data, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const std = this.statistics.stdDev(slice);
      const band = stdDev * std;
      upper.push(middle[i - (period - 1)] + band);
      lower.push(middle[i - (period - 1)] - band);
    }

    return { middle, upper, lower };
  }

  // 平均真实范围 (ATR)
  public atr(
    high: number[],
    low: number[],
    close: number[],
    period: number = 14
  ): number[] {
    if (high.length !== low.length || low.length !== close.length) {
      throw new Error('Input arrays must have the same length');
    }

    // 计算真实范围 (TR)
    const tr: number[] = [high[0] - low[0]];
    for (let i = 1; i < high.length; i++) {
      const tr1 = high[i] - low[i];
      const tr2 = Math.abs(high[i] - close[i - 1]);
      const tr3 = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(tr1, tr2, tr3));
    }

    // 计算ATR
    const atr: number[] = [];
    let currentATR = this.statistics.mean(tr.slice(0, period));
    atr.push(currentATR);

    for (let i = period; i < tr.length; i++) {
      currentATR = ((period - 1) * currentATR + tr[i]) / period;
      atr.push(currentATR);
    }

    return atr;
  }

  // 成交量分析
  public volume(data: number[], period: number = 20): number[] {
    // 计算成交量移动平均
    const volumeSMA = this.sma(data, period);

    // 计算成交量相对强度
    const volumeStrength: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const currentVolume = data[i];
      const averageVolume = volumeSMA[i - (period - 1)];
      volumeStrength.push(currentVolume / averageVolume);
    }

    return volumeStrength;
  }

  // 动量指标
  public momentum(data: number[], period: number = 10): number[] {
    const momentum: number[] = [];
    for (let i = period; i < data.length; i++) {
      momentum.push(data[i] - data[i - period]);
    }
    return momentum;
  }

  // 随机指标 (KDJ)
  public stochastic(
    high: number[],
    low: number[],
    close: number[],
    period: number = 14,
    kPeriod: number = 3,
    dPeriod: number = 3
  ): {
    k: number[];
    d: number[];
    j: number[];
  } {
    const k: number[] = [];
    const d: number[] = [];
    const j: number[] = [];

    // 计算%K
    for (let i = period - 1; i < close.length; i++) {
      const highestHigh = Math.max(...high.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...low.slice(i - period + 1, i + 1));
      const currentClose = close[i];
      
      const kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
      k.push(kValue);
    }

    // 计算%D (K的移动平均)
    d.push(...this.sma(k, kPeriod));

    // 计算%J
    for (let i = 0; i < d.length; i++) {
      j.push(3 * k[i + (k.length - d.length)] - 2 * d[i]);
    }

    return { k, d, j };
  }

  // 资金流向指标 (MFI)
  public moneyFlowIndex(
    high: number[],
    low: number[],
    close: number[],
    volume: number[],
    period: number = 14
  ): number[] {
    const typicalPrice: number[] = [];
    const moneyFlow: number[] = [];
    const mfi: number[] = [];

    // 计算典型价格和资金流
    for (let i = 0; i < close.length; i++) {
      const tp = (high[i] + low[i] + close[i]) / 3;
      typicalPrice.push(tp);
      moneyFlow.push(tp * volume[i]);
    }

    // 计算MFI
    for (let i = period; i < moneyFlow.length; i++) {
      let positiveFlow = 0;
      let negativeFlow = 0;

      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrice[j] > typicalPrice[j - 1]) {
          positiveFlow += moneyFlow[j];
        } else {
          negativeFlow += moneyFlow[j];
        }
      }

      const moneyRatio = positiveFlow / negativeFlow;
      mfi.push(100 - (100 / (1 + moneyRatio)));
    }

    return mfi;
  }

  // 趋势强度指标 (ADX)
  public adx(
    high: number[],
    low: number[],
    close: number[],
    period: number = 14
  ): {
    adx: number[];
    pdi: number[];
    ndi: number[];
  } {
    // 计算方向变动
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    for (let i = 1; i < high.length; i++) {
      const highChange = high[i] - high[i - 1];
      const lowChange = low[i - 1] - low[i];

      if (highChange > lowChange && highChange > 0) {
        plusDM.push(highChange);
      } else {
        plusDM.push(0);
      }

      if (lowChange > highChange && lowChange > 0) {
        minusDM.push(lowChange);
      } else {
        minusDM.push(0);
      }
    }

    // 计算真实范围
    const tr = this.atr(high, low, close, period);

    // 计算方向指标
    const pdi: number[] = [];
    const ndi: number[] = [];
    const dx: number[] = [];

    for (let i = period - 1; i < plusDM.length; i++) {
      const plusDI = 100 * this.ema(plusDM.slice(i - period + 1, i + 1), period)[period - 1] / tr[i];
      const minusDI = 100 * this.ema(minusDM.slice(i - period + 1, i + 1), period)[period - 1] / tr[i];
      
      pdi.push(plusDI);
      ndi.push(minusDI);
      
      const dxValue = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI);
      dx.push(dxValue);
    }

    // 计算ADX
    const adx = this.ema(dx, period);

    return { adx, pdi, ndi };
  }
} 