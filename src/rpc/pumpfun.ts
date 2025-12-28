import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaRPC } from './solana.js';
import { config } from '../config.js';

export interface PumpFunEvent {
  type: 'token_created' | 'buy' | 'sell';
  signature: string;
  blockTime: number;
  tokenMint: string;
  walletAddress: string;
  solAmount: number;
  metadata?: any;
}

/**
 * Pump.fun event detector
 * 
 * Monitors Pump.fun program for:
 * - New token creation
 * - Buy transactions
 * - Sell transactions
 */
export class PumpFunDetector {
  private solanaRPC: SolanaRPC;
  private programId: PublicKey;
  private subscriptionId: number | null = null;
  private eventCallbacks: Array<(event: PumpFunEvent) => void> = [];

  constructor(solanaRPC: SolanaRPC) {
    this.solanaRPC = solanaRPC;
    this.programId = new PublicKey(config.pumpfun.programId);
  }

  /**
   * Subscribe to Pump.fun program transactions
   * 
   * Note: This uses a polling approach to monitor recent transactions
   * In production, you might want to use a more efficient method like
   * WebSocket subscriptions or indexing services
   */
  async subscribe(callback: (event: PumpFunEvent) => void): Promise<void> {
    this.eventCallbacks.push(callback);

    if (this.subscriptionId !== null) {
      return; // Already subscribed
    }

    const connection = this.solanaRPC.getWSConnection();

    try {
      // Subscribe to program logs (will be used for signaling)
      this.subscriptionId = connection.onLogs(
        this.programId,
        async (logs, context) => {
          // Logs subscription doesn't provide signatures directly
          // We'll use polling as the primary method
        },
        'confirmed'
      );

      // Start polling for recent transactions
      this.startTransactionPolling(callback);

      console.log(`[PumpFun] Subscribed to program ${this.programId.toBase58()}`);
    } catch (error) {
      console.error('[PumpFun] Error subscribing:', error);
      this.subscriptionId = null;
    }
  }

  /**
   * Poll for recent transactions involving the Pump.fun program
   */
  private async startTransactionPolling(callback: (event: PumpFunEvent) => void): Promise<void> {
    const connection = this.solanaRPC.getConnection();
    let lastSignature: string | null = null;

    const poll = async () => {
      try {
        // Get recent signatures for the program
        const signatures = await connection.getSignaturesForAddress(
          this.programId,
          { limit: 10 },
          'confirmed'
        );

        // Process new signatures
        for (const sigInfo of signatures) {
          if (lastSignature && sigInfo.signature === lastSignature) {
            break; // Reached already processed transactions
          }

          // Parse and emit event
          const event = await this.parseTransaction(sigInfo.signature);
          if (event) {
            callback(event);
          }
        }

        // Update last signature
        if (signatures.length > 0) {
          lastSignature = signatures[0].signature;
        }
      } catch (error) {
        console.error('[PumpFun] Error polling transactions:', error);
      }

      // Poll every 2 seconds
      setTimeout(poll, 2000);
    };

    // Start polling
    poll();
  }

  /**
   * Unsubscribe from program logs
   */
  async unsubscribe(): Promise<void> {
    if (this.subscriptionId !== null) {
      const connection = this.solanaRPC.getWSConnection();
      await connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      console.log('[PumpFun] Unsubscribed from program logs');
    }
  }

  /**
   * Process logs and extract events
   */
  private async processLogs(logs: any, context: any): Promise<void> {
    try {
      // Logs object contains err and logs array, but we need the signature
      // We'll use a different approach - monitor via transaction signatures
      // For now, we'll implement transaction polling as an alternative
      // The logs subscription is kept for structure, but actual monitoring
      // should use transaction signatures or account changes
    } catch (error) {
      console.error('[PumpFun] Error processing logs:', error);
    }
  }

  /**
   * Alternative: Monitor account changes for Pump.fun tokens
   * This is more reliable for detecting buys/sells
   */
  async subscribeToAccountChanges(
    accountPubkey: PublicKey,
    callback: (accountInfo: any, context: any) => void
  ): Promise<number> {
    const connection = this.solanaRPC.getWSConnection();
    return connection.onAccountChange(accountPubkey, callback, 'confirmed');
  }

  /**
   * Parse transaction to extract Pump.fun events
   * 
   * Pump.fun program structure:
   * - Token creation: create instruction
   * - Buy: swap SOL for token
   * - Sell: swap token for SOL
   */
  async parseTransaction(signature: string): Promise<PumpFunEvent | null> {
    try {
      const tx = await this.solanaRPC.getTransaction(signature);
      if (!tx || !tx.meta) return null;

      const blockTime = tx.blockTime ? tx.blockTime * 1000 : Date.now();
      const instructions = tx.transaction.message.instructions;

      // Parse instructions to detect Pump.fun operations
      for (const instruction of instructions) {
        if ('programId' in instruction) {
          const programId = instruction.programId.toString();
          
          if (programId === this.programId.toString()) {
            // This is a Pump.fun instruction
            const event = await this.parseInstruction(instruction, tx, blockTime);
            if (event) return event;
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`[PumpFun] Error parsing transaction ${signature}:`, error);
      return null;
    }
  }

  /**
   * Parse a single instruction
   */
  private async parseInstruction(
    instruction: any,
    tx: any,
    blockTime: number
  ): Promise<PumpFunEvent | null> {
    try {
      // Get account keys from transaction
      const accountKeys = tx.transaction.message.accountKeys;
      if (!accountKeys || accountKeys.length < 2) return null;

      // The first account is typically the signer/wallet
      const walletPubkey = accountKeys[0]?.pubkey?.toString() || accountKeys[0]?.toString();
      
      // Find token mint account (typically in the accounts list)
      // Pump.fun tokens are SPL tokens, look for mint accounts
      let tokenMint: string | null = null;
      
      // Try to find mint in account keys (simplified approach)
      // In production, you'd need to decode the instruction data properly
      for (const key of accountKeys.slice(1)) {
        const keyStr = key.pubkey?.toString() || key.toString();
        // Mint addresses are base58 encoded, typically 32-44 chars
        if (keyStr.length >= 32 && keyStr.length <= 44) {
          tokenMint = keyStr;
          break;
        }
      }

      if (!walletPubkey) return null;

      // Calculate SOL amount from pre/post balances
      let solAmount = 0;
      if (tx.meta.preBalances && tx.meta.postBalances && accountKeys.length > 0) {
        const walletIndex = 0; // First account is usually the signer
        if (walletIndex < tx.meta.preBalances.length && walletIndex < tx.meta.postBalances.length) {
          const preBalance = tx.meta.preBalances[walletIndex] || 0;
          const postBalance = tx.meta.postBalances[walletIndex] || 0;
          solAmount = Math.abs(preBalance - postBalance) / 1e9;
        }
      }

      // If we couldn't find token mint, try to extract from instruction accounts
      if (!tokenMint && instruction.keys) {
        const mintAccount = instruction.keys.find((acc: any, idx: number) => 
          idx > 0 && (acc.pubkey?.toString() || acc.toString()).length >= 32
        );
        tokenMint = mintAccount?.pubkey?.toString() || mintAccount?.toString() || null;
      }

      // If still no token mint, we can't create a valid event
      if (!tokenMint) return null;

      // Determine event type based on balance change
      // If SOL balance decreased, it's likely a buy
      // If SOL balance increased, it's likely a sell
      const walletIndex = 0;
      const balanceChange = tx.meta.postBalances[walletIndex] - tx.meta.preBalances[walletIndex];
      const eventType = balanceChange < 0 ? 'buy' : 'sell';

      return {
        type: eventType as 'buy' | 'sell',
        signature: tx.transaction.signatures[0],
        blockTime,
        tokenMint,
        walletAddress: walletPubkey,
        solAmount: Math.abs(solAmount),
      };
    } catch (error) {
      console.error('[PumpFun] Error parsing instruction:', error);
      return null;
    }
  }

  /**
   * Monitor transactions for a specific token mint
   */
  async monitorTokenMint(tokenMint: string, callback: (event: PumpFunEvent) => void): Promise<void> {
    // Subscribe to token account changes or parse transactions
    // This is a placeholder - implement based on your monitoring strategy
    console.log(`[PumpFun] Monitoring token ${tokenMint}`);
  }

  /**
   * Get token creation time
   */
  async getTokenCreationTime(tokenMint: string): Promise<number | null> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const connection = this.solanaRPC.getConnection();
      
      // Get account info to verify it exists
      const accountInfo = await connection.getAccountInfo(mintPubkey);
      if (!accountInfo) return null;

      // Get all signatures for the mint account (oldest is creation)
      // Start with a small limit, then fetch more if needed
      let allSignatures: any[] = [];
      let before: string | undefined = undefined;
      
      // Fetch signatures in batches to find the oldest one
      while (allSignatures.length < 100) {
        const signatures = await connection.getSignaturesForAddress(
          mintPubkey,
          { limit: 100, before }
        );
        
        if (signatures.length === 0) break;
        
        allSignatures = allSignatures.concat(signatures);
        
        // If we got fewer than requested, we've reached the end
        if (signatures.length < 100) break;
        
        // Set before to the last signature for next iteration
        before = signatures[signatures.length - 1].signature;
      }

      if (allSignatures.length === 0) return null;

      // The last signature is the oldest (creation transaction)
      const creationSignature = allSignatures[allSignatures.length - 1];
      const tx = await connection.getTransaction(creationSignature.signature, {
        maxSupportedTransactionVersion: 0,
      });

      return tx?.blockTime ? tx.blockTime * 1000 : null;
    } catch (error) {
      console.error(`[PumpFun] Error getting creation time for ${tokenMint}:`, error);
      return null;
    }
  }
}

