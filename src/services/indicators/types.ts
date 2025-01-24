export interface PriceData {
  price: number;
  volume: number;
  timestamp: number;
  high: number;
  low: number;
}

export interface IndicatorConfig {
  period?: number;
  multiplier?: number;
  signalPeriod?: number;
}

export interface MovingAverageResult {
  value: number;
  timestamp: number;
}

export interface RSIResult {
  value: number;
  overbought: boolean;
  oversold: boolean;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface StochasticResult {
  k: number;
  d: number;
}

export interface VolumeProfileResult {
  buyPressure: number;
  sellPressure: number;
  volumeRatio: number;
}

export interface VolatilityResult {
  value: number;
  isHigh: boolean;
}

export interface MarketDepthResult {
  bidDepth: number;
  askDepth: number;
  ratio: number;
}
