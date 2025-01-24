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
import { TradeMonitor } from './TradeMonitor';

export class PumpFunStrategy implements Strategy {
 private state: StrategyState;
 private connection: Connection;
 private pumpFun: PumpFunSDK;
 private monitor: TradeMonitor;
 private eventId: number | null = null;
 private monitoringInterval: NodeJS.Timeout | null = null;

 private indicators: {
   rsi: RSI;
   macd: MACD;
   ma: MovingAverage;
   marketDepth: MarketDepth;
   volume: VolumeProfile;
 };

 constructor(private readonly wallet: Keypair) {
   // Initialize state
   this.state = {
     lastSignal: null,
     activePositions: new Map(),
     walletBalance: 0
   };
 
   // Initialize SDK and connection
   const env = validateEnv();
   const connection = new Connection(env.HELIUS_HTTPS_URI);
   const provider = new AnchorProvider(
     connection, 
     new Wallet(wallet),
     { commitment: 'processed' }
   );
 
   this.connection = connection;
   this.pumpFun = new PumpFunSDK(provider);
   this.monitor = new TradeMonitor(connection, wallet.publicKey);
   
   // Initialize indicators
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

   console.log('✅ PumpFun strategy started successfully');
 }

 private startPnLMonitoring(): void {
   this.monitoringInterval = setInterval(async () => {
     try {
       await this.monitor.updatePnL();
     } catch (error) {
       console.error('Error updating PnL:', error);
     }
   }, config.pump_fun_strategy.price_check_interval);
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

   const data = await fetchTransactionDetails(signature);
   if (!data) {
     console.log("⛔ Transaction aborted. No data returned.");
     return;
   }

   if (!await this.checkWalletBalance()) {
     console.log("⚠️ Insufficient wallet balance");
     return;
   }

   const isRugCheckPassed = await getRugCheckConfirmed(tokenMint);
   if (!isRugCheckPassed) {
     console.log("🚫 Rug Check not passed! Transaction aborted.");
     return;
   }

   if (config.rug_check.simulation_mode) {
     console.log("👀 Token not swapped. Simulation mode is enabled.");
     return;
   }

   // Fetch and analyze price data
   const priceData = await this.fetchPriceData(tokenMint);
   const shouldTrade = await this.analyze(priceData);

   if (!shouldTrade) {
     console.log("📊 Analysis indicates no trade opportunity");
     return;
   }

   // Execute buy
   const tx = await createSwapTransaction(config.liquidity_pool.wsol_pc_mint, tokenMint);
   if (!tx) {
     console.log("⛔ Transaction aborted.");
     return;
   }

   console.log("🚀 Swapping SOL for PumpFun Token");
   console.log(`Swap Transaction: https://solscan.io/tx/${tx}`);

   const saveConfirmation = await fetchAndSaveSwapDetails(tx);
   if (!saveConfirmation) {
     console.log("❌ Warning: Transaction not saved for tracking!");
     return;
   }

   // Add position to monitor
   const amount = Number(config.swap.amount) / 1e9; // Convert lamports to SOL
   await this.monitor.addPosition(tokenMint, amount);

   // Start monitoring position
   this.monitorPosition(tokenMint);
 }

 private async monitorPosition(tokenMint: string): Promise<void> {
   const checkPosition = async () => {
     try {
       const priceData = await this.fetchPriceData(tokenMint);
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
   if (!priceData.length) return false;

   const rsiResult = this.indicators.rsi.calculate(priceData);
   const macdResult = this.indicators.macd.calculate(priceData);
   const volumeResult = this.indicators.volume.calculate(priceData);

   return (
     rsiResult.value > config.pump_fun_strategy.rsi.overbought ||
     macdResult.histogram < config.pump_fun_strategy.macd.sell_threshold ||
     volumeResult.sellPressure > config.pump_fun_strategy.volume_profile.sell_pressure_threshold
   );
 }

 private async executeSell(tokenMint: string): Promise<void> {
   const position = this.state.activePositions.get(tokenMint);
   if (!position) return;

   const response = await createSellTransaction(
     config.liquidity_pool.wsol_pc_mint,
     tokenMint,
     position.toString()
   );

   if (response.success) {
     const currentPrice = await this.getCurrentPrice(tokenMint);
     await this.monitor.closePosition(tokenMint, currentPrice);
     this.state.activePositions.delete(tokenMint);
     console.log(`✅ Successfully sold position for ${tokenMint}`);
   } else {
     console.error(`❌ Failed to sell position for ${tokenMint}:`, response.msg);
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

   console.log('\n📊 Technical Analysis Results:');
   console.log(`RSI: ${rsiResult.value.toFixed(2)}`);
   console.log(`MACD Histogram: ${macdResult.histogram.toFixed(6)}`);
   console.log(`Volume Pressure: Buy ${(volumeResult.buyPressure * 100).toFixed(2)}% | Sell ${(volumeResult.sellPressure * 100).toFixed(2)}%`);
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

     console.log(`\n💰 Current wallet balance: ${this.state.walletBalance.toFixed(4)} SOL`);

     if (this.state.walletBalance < config.pump_fun_strategy.minimum_sol_balance) {
       console.log('⚠️ Wallet balance below minimum threshold');
       await this.emergencyExit();
       return false;
     }
     return true;
   } catch (error) {
     console.error('Error checking wallet balance:', error);
     return false;
   }
 }

 private async emergencyExit(): Promise<void> {
   console.log('🚨 Initiating emergency exit - selling all positions');
   
   for (const [token, position] of this.state.activePositions) {
     try {
       const response = await createSellTransaction(
         config.liquidity_pool.wsol_pc_mint,
         token,
         position.toString()
       );

       if (response.success) {
         const currentPrice = await this.getCurrentPrice(token);
         await this.monitor.closePosition(token, currentPrice);
         this.state.activePositions.delete(token);
         console.log(`✅ Emergency exit successful for token: ${token}`);
       }
     } catch (error) {
       console.error(`❌ Failed emergency exit for token: ${token}`, error);
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