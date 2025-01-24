// src/scripts/pump-fun-bot.ts

import { PumpFunStrategy } from '../services/strategies/PumpFunStrategy';
import { validateEnv } from '../utils/env-validator';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

async function main() {
 try {
   dotenv.config();
   validateEnv();

   const privKey = process.env.PRIV_KEY_WALLET;
   if (!privKey) {
     throw new Error('PRIV_KEY_WALLET not found in environment variables');
   }
   
   const keypair = Keypair.fromSecretKey(bs58.decode(privKey));

   console.clear();
   console.log('🚀 Starting PumpFun Bot...');
   console.log(`💳 Wallet: ${keypair.publicKey.toString()}`);

   const strategy = new PumpFunStrategy(keypair);
   await strategy.start();

   // Handle shutdown
   process.on('SIGINT', async () => {
     console.log('\n🛑 Shutting down PumpFun Bot...');
     await strategy.cleanup();
     process.exit(0);
   });

   process.on('unhandledRejection', (error) => {
     console.error('❌ Unhandled promise rejection:', error);
   });

   // Keep process running
   process.stdin.resume();

 } catch (error) {
   console.error('Fatal error:', error);
   process.exit(1);
 }
}

// Start the bot
main().catch(error => {
 console.error('Fatal error in main:', error);
 process.exit(1);
});