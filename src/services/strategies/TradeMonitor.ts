// src/services/strategies/TradeMonitor.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { DateTime } from 'luxon';
import axios from 'axios';
import { config } from '../../config';

interface Position {
  tokenMint: string;
  entryPrice: number;
  amount: number;
  timestamp: number;
}

interface PnLUpdate {
  tokenMint: string;
  currentPrice: number;
  unrealizedPnL: number;
  percentageChange: number;
}

export class TradeMonitor {
  private positions: Map<string, Position> = new Map();
  private lastPriceCheck: number = 0;
  
  constructor(
    private connection: Connection,
    private walletAddress: PublicKey
  ) {}

  async addPosition(tokenMint: string, amount: number): Promise<void> {
    const price = await this.getCurrentPrice(tokenMint);
    if (!price) return;

    this.positions.set(tokenMint, {
      tokenMint,
      entryPrice: price,
      amount,
      timestamp: Date.now()
    });

    this.logPosition('OPEN', tokenMint, price, amount);
  }

  async closePosition(tokenMint: string, exitPrice: number): Promise<void> {
    const position = this.positions.get(tokenMint);
    if (!position) return;

    const pnl = (exitPrice - position.entryPrice) * position.amount;
    const pnlPercentage = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

    this.logPosition('CLOSE', tokenMint, exitPrice, position.amount, pnl, pnlPercentage);
    this.positions.delete(tokenMint);
  }

  async updatePnL(): Promise<PnLUpdate[]> {
    const updates: PnLUpdate[] = [];
    const now = Date.now();

    // Throttle updates
    if (now - this.lastPriceCheck < config.pump_fun_strategy.price_check_interval) {
      return updates;
    }

    this.lastPriceCheck = now;
    const balance = await this.connection.getBalance(this.walletAddress);
    const solBalance = balance / 1e9;

    console.log(`\n💰 Current SOL Balance: ${solBalance.toFixed(4)} SOL`);
    console.log('📊 Current Positions:');

    for (const [mint, position] of this.positions) {
      const currentPrice = await this.getCurrentPrice(mint);
      if (!currentPrice) continue;

      const unrealizedPnL = (currentPrice - position.entryPrice) * position.amount;
      const percentageChange = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      updates.push({
        tokenMint: mint,
        currentPrice,
        unrealizedPnL,
        percentageChange
      });

      this.logPnL(position, currentPrice, unrealizedPnL, percentageChange);
    }

    return updates;
  }

  private async getCurrentPrice(tokenMint: string): Promise<number | null> {
    try {
      const response = await axios.get(process.env.JUP_HTTPS_PRICE_URI!, {
        params: {
          ids: tokenMint,
          showExtraInfo: true
        }
      });

      return response.data?.data[tokenMint]?.price || null;
    } catch (error) {
      console.error(`Error fetching price for ${tokenMint}:`, error);
      return null;
    }
  }

  private logPosition(
    type: 'OPEN' | 'CLOSE',
    tokenMint: string,
    price: number,
    amount: number,
    pnl?: number,
    pnlPercentage?: number
  ): void {
    const time = DateTime.now().toFormat('HH:mm:ss');
    const icon = type === 'OPEN' ? '📈' : '📉';
    
    console.log(`\n${icon} ${type} Position at ${time}`);
    console.log(`Token: ${tokenMint}`);
    console.log(`Price: ${price.toFixed(6)} SOL`);
    console.log(`Amount: ${amount.toFixed(2)}`);
    
    if (pnl !== undefined && pnlPercentage !== undefined) {
      const pnlIcon = pnl >= 0 ? '🟢' : '🔴';
      console.log(`PnL: ${pnlIcon} ${pnl.toFixed(4)} SOL (${pnlPercentage.toFixed(2)}%)`);
    }
  }

  private logPnL(
    position: Position,
    currentPrice: number,
    unrealizedPnL: number,
    percentageChange: number
  ): void {
    const time = DateTime.now().toFormat('HH:mm:ss');
    const pnlIcon = unrealizedPnL >= 0 ? '🟢' : '🔴';
    
    console.log(`\n${time} | ${position.tokenMint}`);
    console.log(`Entry: ${position.entryPrice.toFixed(6)} SOL`);
    console.log(`Current: ${currentPrice.toFixed(6)} SOL`);
    console.log(`Unrealized PnL: ${pnlIcon} ${unrealizedPnL.toFixed(4)} SOL (${percentageChange.toFixed(2)}%)`);
  }
}