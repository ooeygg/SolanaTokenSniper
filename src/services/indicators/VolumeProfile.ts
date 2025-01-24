import { PriceData, VolumeProfileResult } from './types';

export class VolumeProfile {
  calculate(data: PriceData[]): VolumeProfileResult {
    const totalVolume = data.reduce((sum, item) => sum + item.volume, 0);
    const buyVolume = data.filter(item => item.price > data[0].price)
      .reduce((sum, item) => sum + item.volume, 0);
    const sellVolume = totalVolume - buyVolume;

    return {
      buyPressure: buyVolume / totalVolume,
      sellPressure: sellVolume / totalVolume,
      volumeRatio: buyVolume / (sellVolume || 1)
    };
  }
}
