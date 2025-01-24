import { PriceData, MovingAverageResult, IndicatorConfig } from './types';

export class MovingAverage {
  private period: number;

  constructor(config: IndicatorConfig) {
    this.period = config.period || 14;
  }

  calculate(data: PriceData[]): MovingAverageResult[] {
    if (data.length < this.period) return [];

    const results: MovingAverageResult[] = [];
    for (let i = this.period - 1; i < data.length; i++) {
      const slice = data.slice(i - this.period + 1, i + 1);
      const average = slice.reduce((sum, item) => sum + item.price, 0) / this.period;
      results.push({ value: average, timestamp: data[i].timestamp });
    }
    return results;
  }
}
