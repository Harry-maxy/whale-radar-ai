import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  solana: {
    rpcUrl: string;
    wsUrl: string;
  };
  pumpfun: {
    programId: string;
  };
  detection: {
    earlyEntryWindowSeconds: number;
    minBuySizeSol: number;
    minInsiderRepetitions: number;
    whaleScoreThreshold: number;
  };
  telegram?: {
    botToken: string;
    chatId: string;
  };
  api: {
    port: number;
    enabled: boolean;
  };
}

export const config: Config = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    wsUrl: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
  },
  pumpfun: {
    programId: process.env.PUMPFUN_PROGRAM_ID || '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  },
  detection: {
    earlyEntryWindowSeconds: parseInt(process.env.EARLY_ENTRY_WINDOW_SECONDS || '60', 10),
    minBuySizeSol: parseFloat(process.env.MIN_BUY_SIZE_SOL || '5'),
    minInsiderRepetitions: parseInt(process.env.MIN_INSIDER_REPETITIONS || '3', 10),
    whaleScoreThreshold: parseInt(process.env.WHALE_SCORE_THRESHOLD || '70', 10),
  },
  telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      }
    : undefined,
  api: {
    port: parseInt(process.env.API_PORT || '3000', 10),
    enabled: process.env.API_ENABLED !== 'false',
  },
};

