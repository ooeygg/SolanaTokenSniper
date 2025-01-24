// src/services/strategies/PumpFunStrategy.ts

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import axios from 'axios';
import { RSI, MACD, MovingAverage, MarketDepth, VolumeProfile } from '../indicators';
import { Strategy, StrategyState } from './types';
import { config } from '../../config';
import { createSwapTransaction, createSellTransaction, getRugCheckConfirmed, fetchTransactionDetails, fetchAndSaveSwapDetails } from '../../transactions';
import { PriceData } from '../indicators/types';
import { validateEnv } from "../../utils/env-validator";
import { PumpFunSDK } from '../pumpfun/pumpfun';

export class PumpFunStrategy implements Strategy {
  private state: StrategyState;
  private connection: Connection;
  private pumpFun: PumpFunSDK;
  private eventId: number | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastPriceCheck: number = 0;

  private indicators: {
    rsi: RSI;
    macd: MACD; 
    ma: MovingAverage;
    marketDepth: MarketDepth;
    volume: VolumeProfile;
  };

  constructor(private readonly wallet: Keypair) {
    this.state = {
      lastSignal: null,
      activePositions: new Map(),
      walletBalance: 0
    };
  
    const env = validateEnv();
    const connection = new Connection(env.HELIUS_HTTPS_URI);
    const provider = new AnchorProvider(
      connection, 
      new Wallet(wallet),
      { commitment: 'processed' }
    );
  
    this.connection = connection;
    this.pumpFun = new PumpFunSDK(provider);
    
    this.indicators = {
      rsi: new RSI({ period: config.pump_fun_strategy.rsi.period }),
      macd: new MACD({ 
        period: config.pump_fun_strategy.macd.fast_period,
        signalPeriod: config.pump_fun_strategy.macd.signal_period 
      }),
      ma: new MovingAverage({ period: config.pump_fun_strategy.moving_average.short_period }),
      marketDepth: new MarketDepth(),
      volume: new VolumeProfile()
    };
  }

  async start(): Promise<void> {
    if (!this.isEnabled()) {
      console.log('⚠️ PumpFun strategy is disabled in config');
      return;
    }

    await this.checkWalletBalance();
    this.initPumpFunMonitor();
    this.startPnLMonitoring();

    console.log('\n✅ PumpFun strategy started successfully');
    console.log('📊 Configuration:');
    console.log(`- Simulation Mode: ${config.rug_check.simulation_mode}`);
    console.log(`- Min SOL Balance: ${config.pump_fun_strategy.minimum_sol_balance}`);
    console.log(`- Trade Amount: ${config.swap.amount} lamports`);
    console.log(`- Price check interval: ${config.pump_fun_strategy.price_check_interval}ms`);
  }

  private startPnLMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        const now = Date.now();
        if (now - this.lastPriceCheck < config.pump_fun_strategy.price_check_interval) {
          return;
        }
        
        this.lastPriceCheck = now;
        await this.updatePositions();
      } catch (error) {
        console.error('Error updating positions:', error);
      }
    }, config.pump_fun_strategy.price_check_interval);
  }

  private async updatePositions(): Promise<void> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    console.log(`\n💰 Current SOL Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    
    if (this.state.activePositions.size > 0) {
      console.log('\n📈 Current Positions:');
      for (const [tokenMint, amount] of this.state.activePositions) {
        const currentPrice = await this.getCurrentPrice(tokenMint);
        if (currentPrice > 0) {
          console.log(`${tokenMint}: ${amount} tokens @ ${currentPrice.toFixed(6)} SOL`);
        }
      }
    }
  }

  private initPumpFunMonitor(): void {
    console.log('🔍 Starting PumpFun token monitor...');
    
    this.eventId = this.pumpFun.addEventListener('createEvent', async (event, slot, signature) => {
      try {
        console.log('\n🆕 New PumpFun token detected:', {
          name: event.name,
          symbol: event.symbol,
          mint: event.mint.toString(),
          creator: event.user.toString(),
          timestamp: new Date().toISOString(),
          signature
        });

        await this.processNewToken(event.mint.toString(), signature);
      } catch (error) {
        console.error('❌ Error processing PumpFun token:', error);
      }
    });
  }

  private async processNewToken(tokenMint: string, signature: string): Promise<void> {
    console.log("\n=============================================");
    console.log("🔎 New PumpFun Token Found");
    console.log(`Token: ${tokenMint}`);
    console.log(`Signature: ${signature}`);

    try {
        const data = await Promise.race([
            fetchTransactionDetails(signature),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Transaction fetch timeout")), 15000)
            )
        ]);

        if (!data) {
            console.log("⛔ Transaction fetch failed");
            return;
        }

        if (!await this.checkWalletBalance()) {
            return;
        }

        const isRugCheckPassed = await getRugCheckConfirmed(tokenMint);
        if (!isRugCheckPassed) {
            console.log("🚫 Rug Check failed!");
            return;
        }

        // Wait for token registration and collect initial prices
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const initialPrices: PriceData[] = [];
        for (let i = 0; i < 3; i++) {
            const priceData = await this.fetchPriceData(tokenMint);
            if (priceData.length) {
                initialPrices.push(priceData[0]);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (initialPrices.length < 3) {
            console.log("⚠️ Insufficient price data for analysis");
            return;
        }

        console.log("📊 Analyzing token...");
        const shouldTrade = await this.analyze(initialPrices);

        if (!shouldTrade) {
            console.log("📉 Analysis indicates no trade opportunity");
            return;
        }

        if (config.rug_check.simulation_mode) {
            console.log("🔬 Simulation mode - logging trade signals only");
            return;
        }

        const tx = await createSwapTransaction(config.liquidity_pool.wsol_pc_mint, tokenMint);
        if (!tx) {
            console.log("⛔ Swap transaction creation failed");
            return;
        }

        console.log("🚀 Executing swap:");
        console.log(`https://solscan.io/tx/${tx}`);

        const saveConfirmation = await fetchAndSaveSwapDetails(tx);
        if (!saveConfirmation) {
            console.log("❌ Failed to save trade details");
            return;
        }

        // Track position
        const amount = Number(config.swap.amount) / 1e9;
        this.state.activePositions.set(tokenMint, amount);
        this.monitorPosition(tokenMint);

    } catch (error) {
        console.error("❌ Error processing token:", error);
    }
  }

  private async monitorPosition(tokenMint: string): Promise<void> {
    const checkPosition = async () => {
      try {
        const priceData = await this.fetchPriceData(tokenMint);
        if (!priceData.length) return;

        const shouldSell = await this.checkSellSignals(priceData);
        if (shouldSell) {
          await this.executeSell(tokenMint);
          return;
        }

        setTimeout(checkPosition, config.pump_fun_strategy.price_check_interval);
      } catch (error) {
        console.error('Error monitoring position:', error);
      }
    };

    checkPosition();
  }

  private async checkSellSignals(priceData: PriceData[]): Promise<boolean> {
    const rsiResult = this.indicators.rsi.calculate(priceData);
    const macdResult = this.indicators.macd.calculate(priceData);
    const volumeResult = this.indicators.volume.calculate(priceData);

    const shouldSell = 
      rsiResult.value > config.pump_fun_strategy.rsi.overbought ||
      macdResult.histogram < config.pump_fun_strategy.macd.sell_threshold ||
      volumeResult.sellPressure > config.pump_fun_strategy.volume_profile.sell_pressure_threshold;

    if (shouldSell) {
      console.log('\n🔔 Sell signals detected:');
      console.log(`RSI: ${rsiResult.value.toFixed(2)} (> ${config.pump_fun_strategy.rsi.overbought})`);
      console.log(`MACD Histogram: ${macdResult.histogram.toFixed(6)}`);
      console.log(`Sell Pressure: ${(volumeResult.sellPressure * 100).toFixed(2)}%`);
    }

    return shouldSell;
  }

  private async executeSell(tokenMint: string): Promise<void> {
    const position = this.state.activePositions.get(tokenMint);
    if (!position) return;

    try {
      const response = await createSellTransaction(
        config.liquidity_pool.wsol_pc_mint,
        tokenMint,
        position.toString()
      );

      if (response.success) {
        const exitPrice = await this.getCurrentPrice(tokenMint);
        console.log(`\n✅ Sold position for ${tokenMint}`);
        console.log(`Exit price: ${exitPrice.toFixed(6)} SOL`);
        this.state.activePositions.delete(tokenMint);
      } else {
        console.error(`❌ Sell failed for ${tokenMint}:`, response.msg);
      }
    } catch (error) {
      console.error(`❌ Error selling ${tokenMint}:`, error);
    }
  }

  async analyze(priceData: PriceData[]): Promise<boolean> {
    if (!this.isEnabled() || !await this.checkWalletBalance() || !priceData.length) {
      return false;
    }

    const rsiResult = this.indicators.rsi.calculate(priceData);
    const macdResult = this.indicators.macd.calculate(priceData);
    const volumeResult = this.indicators.volume.calculate(priceData);
    const depthResult = this.indicators.marketDepth.calculate(priceData);

    console.log('\n📊 Technical Analysis:');
    console.log(`RSI: ${rsiResult.value.toFixed(2)}`);
    console.log(`MACD Histogram: ${macdResult.histogram.toFixed(6)}`);
    console.log(`Volume Ratio: ${volumeResult.volumeRatio.toFixed(2)}`);
    console.log(`Market Depth Ratio: ${depthResult.ratio.toFixed(2)}`);

    return (
      rsiResult.value < config.pump_fun_strategy.rsi.oversold &&
      macdResult.histogram > config.pump_fun_strategy.macd.buy_threshold &&
      volumeResult.buyPressure > config.pump_fun_strategy.volume_profile.buy_pressure_threshold &&
      depthResult.ratio > config.pump_fun_strategy.market_depth.min_bid_ask_ratio
    );
  }

  private async checkWalletBalance(): Promise<boolean> {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      this.state.walletBalance = balance / 1e9;

      const sufficientBalance = this.state.walletBalance >= config.pump_fun_strategy.minimum_sol_balance;

      if (!sufficientBalance) {
        console.log(`⚠️ Insufficient balance: ${this.state.walletBalance.toFixed(4)} SOL`);
        await this.emergencyExit();
      }

      return sufficientBalance;
    } catch (error) {
      console.error('Error checking balance:', error);
      return false;
    }
  }

  private async emergencyExit(): Promise<void> {
    console.log('🚨 Emergency exit - closing all positions');
    
    for (const [token, position] of this.state.activePositions) {
      try {
        const response = await createSellTransaction(
          config.liquidity_pool.wsol_pc_mint,
          token,
          position.toString()
        );

        if (response.success) {
          console.log(`✅ Closed position for ${token}`);
          this.state.activePositions.delete(token);
        }
      } catch (error) {
        console.error(`❌ Failed to close ${token}:`, error);
      }
    }
  }

  private async getCurrentPrice(tokenMint: string): Promise<number> {
    try {
      const response = await axios.get(process.env.JUP_HTTPS_PRICE_URI!, {
        params: {
          ids: tokenMint,
          showExtraInfo: true
        }
      });
      return response.data?.data[tokenMint]?.price || 0;
    } catch (error) {
      console.error(`Error fetching price for ${tokenMint}:`, error);
      return 0;
    }
  }
 
  private async fetchPriceData(tokenMint: string): Promise<PriceData[]> {
    try {
      const jupiterPriceUrl = process.env.JUP_HTTPS_PRICE_URI;
      if (!jupiterPriceUrl) {
        throw new Error('Jupiter API URL not configured');
      }
  
      const solMint = config.liquidity_pool.wsol_pc_mint;
      const response = await axios.get(jupiterPriceUrl, {
        params: {
          ids: `${tokenMint},${solMint}`,
          showExtraInfo: true
        },
        timeout: config.tx.get_timeout
      });
  
      if (!response.data?.data) {
        throw new Error('Invalid price data response');
      }
  
      const tokenData = response.data.data[tokenMint];
      if (!tokenData?.extraInfo?.lastSwappedPrice) {
        return [];
      }
  
      return [{
        timestamp: Date.now(),
        price: tokenData.extraInfo.lastSwappedPrice.lastJupiterSellPrice,
        volume: tokenData.extraInfo.oneDayVolume || 0,
        high: tokenData.extraInfo.high24h || tokenData.extraInfo.lastSwappedPrice.lastJupiterSellPrice,
        low: tokenData.extraInfo.low24h || tokenData.extraInfo.lastSwappedPrice.lastJupiterSellPrice
      }];
    } catch (error) {
      console.error('Error fetching price data:', error);
      return [];
    }
  }
 
  async execute(): Promise<void> {
    // Implementation handled in processNewToken
  }
 
  getName(): string {
    return 'PumpFun Strategy';
  }
 
  isEnabled(): boolean {
    return config.pump_fun_strategy.enabled;
  }
 
  cleanup(): void {
    console.log('\n🧹 Cleaning up PumpFun strategy...');
    
    if (this.eventId !== null) {
      this.pumpFun.removeEventListener(this.eventId);
      this.eventId = null;
    }
 
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
 
    console.log('✅ Cleanup complete');
  }
 }