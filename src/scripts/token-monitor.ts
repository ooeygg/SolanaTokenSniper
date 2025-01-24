// scripts/token-monitor.ts

import { Connection, Keypair } from '@solana/web3.js';
import { PumpFunSDK } from '../../src/services/pumpfun/pumpfun';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  if (!process.env.SOLANA_RPC_URL || !process.env.WALLET_PRIVATE_KEY) {
    throw new Error('Missing SOLANA_RPC_URL or WALLET_PRIVATE_KEY in environment variables');
  }

  const connection = new Connection(process.env.SOLANA_RPC_URL, {
    commitment: 'processed'
  });

  const keypair = Keypair.fromSecretKey(
    bs58.decode(process.env.WALLET_PRIVATE_KEY)
  );
  const wallet = new Wallet(keypair);
  
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'processed'
  });

  const pumpFun = new PumpFunSDK(provider);

  console.log('Starting token monitor...');

  const eventId = pumpFun.addEventListener('createEvent', (event, slot, signature) => {
    console.log('New token created:', {
      name: event.name,
      symbol: event.symbol,
      mint: event.mint.toString(),
      bondingCurve: event.bondingCurve.toString(),
      creator: event.user.toString(),
      timestamp: new Date().toISOString(),
      signature,
      slot
    });
  });

  process.on('SIGINT', () => {
    console.log('\nStopping monitor...');
    pumpFun.removeEventListener(eventId);
    process.exit();
  });
}

main().catch(console.error);