import { PriceData, VolatilityResult, IndicatorConfig } from './types';

export class Volatility {
  private period: number;
  private highThreshold: number;

  constructor(config: IndicatorConfig) {
    this.period = config.period || 14;
    this.highThreshold = config.multiplier || 2;
  }

  calculate(data: PriceData[]): VolatilityResult {
    if (data.length < 2) return { value: 0, isHigh: false };

    const returns = data.slice(1).map((item, i) => {
      const percentChange = (item.price - data[i].price) / data[i].price;
      return percentChange;
    });

    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const squaredDiffs = returns.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((sum, value) => sum + value, 0) / returns.length;
    const volatility = Math.sqrt(variance);

    return {
      value: volatility,
      isHigh: volatility > this.highThreshold
    };
  }
}
