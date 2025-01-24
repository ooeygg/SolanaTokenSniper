import { PriceData, RSIResult, IndicatorConfig } from './types';

export class RSI {
  private period: number;
  private overboughtThreshold: number = 70;
  private oversoldThreshold: number = 30;

  constructor(config: IndicatorConfig) {
    this.period = config.period || 14;
  }

  calculate(data: PriceData[]): RSIResult {
    if (data.length < this.period + 1) {
      return { value: 50, overbought: false, oversold: false };
    }

    const changes = data.slice(1).map((item, i) => item.price - data[i].price);
    const gains = changes.filter(change => change > 0);
    const losses = changes.filter(change => change < 0).map(Math.abs);

    const avgGain = gains.length ? gains.reduce((a, b) => a + b) / this.period : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b) / this.period : 0;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return {
      value: rsi,
      overbought: rsi > this.overboughtThreshold,
      oversold: rsi < this.oversoldThreshold
    };
  }
}
