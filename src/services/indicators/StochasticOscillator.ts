import { PriceData, StochasticResult, IndicatorConfig } from './types';

export class StochasticOscillator {
  private period: number;

  constructor(config: IndicatorConfig) {
    this.period = config.period || 14;
  }

  calculate(data: PriceData[]): StochasticResult {
    if (data.length < this.period) {
      return { k: 50, d: 50 };
    }

    const currentClose = data[data.length - 1].price;
    const periodData = data.slice(-this.period);
    const highestHigh = Math.max(...periodData.map(d => d.price));
    const lowestLow = Math.min(...periodData.map(d => d.price));

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = this.calculateSMA([k], 3);

    return { k, d };
  }

  private calculateSMA(values: number[], period: number): number {
    return values.reduce((sum, value) => sum + value, 0) / period;
  }
}
