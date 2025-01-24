// src/strategies/types.ts
import { PriceData } from '../indicators/types';

export interface Strategy {
  analyze(priceData: PriceData[]): Promise<boolean>;
  execute(): Promise<void>;
  getName(): string;
  isEnabled(): boolean;
}

export interface HFTState {
  lastAction: 'buy' | 'sell' | null;
  activePositions: Map<string, number>;
  walletBalance: number;
}

export interface Strategy {
  analyze(data: PriceData[]): Promise<boolean>;
  execute(): Promise<void>;
  getName(): string;
  isEnabled(): boolean;
}

export interface TradeSignal {
  type: 'buy' | 'sell';
  token: string;
  price: number;
  timestamp: number;  
  confidence: number;
}

export interface StrategyState {
  lastSignal: TradeSignal | null;
  activePositions: Map<string, number>;
  walletBalance: number;
}