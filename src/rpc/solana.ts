import { Connection } from '@solana/web3.js';
import { config } from '../config.js';

export class SolanaRPC {
  private connection: Connection;
  private wsConnection: Connection;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.wsConnection = new Connection(config.solana.wsUrl, 'confirmed');
  }

  /**
   * Get HTTP connection for queries
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get WebSocket connection for subscriptions
   */
  getWSConnection(): Connection {
    return this.wsConnection;
  }

  /**
   * Get transaction details
   */
  async getTransaction(signature: string): Promise<any> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      return tx;
    } catch (error) {
      console.error(`Error fetching transaction ${signature}:`, error);
      return null;
    }
  }

  /**
   * Get block time from slot
   */
  async getBlockTime(slot: number): Promise<number | null> {
    try {
      const blockTime = await this.connection.getBlockTime(slot);
      return blockTime ? blockTime * 1000 : null; // Convert to milliseconds
    } catch (error) {
      console.error(`Error fetching block time for slot ${slot}:`, error);
      return null;
    }
  }

  /**
   * Parse SOL amount from lamports
   */
  static lamportsToSol(lamports: number): number {
    return lamports / 1e9;
  }

  /**
   * Parse SOL amount to lamports
   */
  static solToLamports(sol: number): number {
    return Math.floor(sol * 1e9);
  }
}

