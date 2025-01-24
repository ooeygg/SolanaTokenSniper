// src/scripts/pump-fun-bot.ts
import { PumpFunStrategy } from '../services/strategies/PumpFunStrategy';
import { validateEnv } from '../utils/env-validator';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

async function main() {
  dotenv.config();
  validateEnv();

  const privKey = process.env.PRIV_KEY_WALLET;
  if (!privKey) {
    throw new Error('PRIV_KEY_WALLET not found in environment variables');
  }
  
  const keypair = Keypair.fromSecretKey(bs58.decode(privKey));

  console.log('🚀 Starting PumpFun Bot...');
  console.log(`💳 Wallet: ${keypair.publicKey.toString()}`);

  const strategy = new PumpFunStrategy(keypair);
  await strategy.start(); // Add new start method

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down PumpFun Bot...');
    await strategy.cleanup();
    process.exit();
  });

  process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
  });
}

main().catch(console.error);