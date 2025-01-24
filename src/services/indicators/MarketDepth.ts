import { PriceData, MarketDepthResult } from './types';

export class MarketDepth {
  calculate(data: PriceData[]): MarketDepthResult {
    const currentPrice = data[data.length - 1].price;
    const bidVolume = data.filter(item => item.price < currentPrice)
      .reduce((sum, item) => sum + item.volume, 0);
    const askVolume = data.filter(item => item.price > currentPrice)
      .reduce((sum, item) => sum + item.volume, 0);

    return {
      bidDepth: bidVolume,
      askDepth: askVolume,
      ratio: bidVolume / (askVolume || 1)
    };
  }
}
