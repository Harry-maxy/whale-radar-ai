import { DatabaseStore, TokenInteraction, Wallet } from '../storage/db.js';
import { config } from '../config.js';
import { PumpFunEvent } from '../rpc/pumpfun.js';

export interface InsiderCheckResult {
  isInsider: boolean;
  reasons: string[];
  confidence: number; // 0-100
}

/**
 * Insider Detection Logic
 * 
 * Flags a wallet as "insider" if:
 * - Buys within first X seconds after token creation
 * - Repeats this behavior on multiple tokens
 * - Average buy size > threshold (e.g. 5 SOL)
 * - Optional: exits before public peak
 */
export class InsiderDetector {
  private db: DatabaseStore;

  constructor(db: DatabaseStore) {
    this.db = db;
  }

  /**
   * Check if a wallet should be flagged as insider based on behavior
   */
  async checkInsiderStatus(
    walletAddress: string,
    newInteraction?: { tokenMint: string; blockTime: number; solAmount: number; tokenCreationTime: number }
  ): Promise<InsiderCheckResult> {
    const wallet = this.db.getWallet(walletAddress);
    const interactions = this.db.getWalletInteractions(walletAddress);
    const earlyEntries = this.db.getEarlyEntriesForWallet(walletAddress);

    const reasons: string[] = [];
    let confidence = 0;

    // Check 1: Early entry repetition
    const earlyEntryCount = earlyEntries.length;
    if (earlyEntryCount >= config.detection.minInsiderRepetitions) {
      reasons.push(`Repeated early entries: ${earlyEntryCount} times`);
      confidence += 40;
    }

    // Check 2: Average buy size threshold
    if (wallet) {
      if (wallet.averageEntrySize >= config.detection.minBuySizeSol) {
        reasons.push(`Large average buy size: ${wallet.averageEntrySize.toFixed(2)} SOL`);
        confidence += 30;
      }

      if (wallet.totalVolumeSol >= config.detection.minBuySizeSol * 10) {
        reasons.push(`High total volume: ${wallet.totalVolumeSol.toFixed(2)} SOL`);
        confidence += 10;
      }
    }

    // Check 3: Check new interaction if provided
    if (newInteraction) {
      const timeSinceCreation = (newInteraction.blockTime - newInteraction.tokenCreationTime) / 1000;
      if (timeSinceCreation <= config.detection.earlyEntryWindowSeconds) {
        reasons.push(`Very early entry: ${timeSinceCreation.toFixed(1)}s after creation`);
        confidence += 20;
      }

      if (newInteraction.solAmount >= config.detection.minBuySizeSol) {
        reasons.push(`Large buy size: ${newInteraction.solAmount.toFixed(2)} SOL`);
        confidence += 10;
      }
    }

    // Check 4: Win rate proxy (if available)
    if (wallet && wallet.winrateProxy > 0.6) {
      reasons.push(`High win rate proxy: ${(wallet.winrateProxy * 100).toFixed(1)}%`);
      confidence += 10;
    }

    const isInsider = confidence >= 50 && earlyEntryCount >= config.detection.minInsiderRepetitions;

    return {
      isInsider,
      reasons,
      confidence: Math.min(confidence, 100),
    };
  }

  /**
   * Check if an interaction qualifies as early entry
   */
  isEarlyEntry(blockTime: number, tokenCreationTime: number): boolean {
    const timeSinceCreation = (blockTime - tokenCreationTime) / 1000;
    return timeSinceCreation <= config.detection.earlyEntryWindowSeconds;
  }

  /**
   * Update wallet insider status
   */
  async updateWalletInsiderStatus(walletAddress: string): Promise<void> {
    const result = await this.checkInsiderStatus(walletAddress);
    const wallet = this.db.getWallet(walletAddress);
    
    if (wallet) {
      this.db.upsertWallet({
        ...wallet,
        isInsider: result.isInsider,
      });
    }
  }

  /**
   * Process a new event and check for insider behavior
   */
  async processEvent(event: PumpFunEvent, tokenCreationTime: number): Promise<InsiderCheckResult | null> {
    if (event.type !== 'buy') {
      return null;
    }

    const isEarly = this.isEarlyEntry(event.blockTime, tokenCreationTime);

    // Record interaction
    this.db.addInteraction({
      walletAddress: event.walletAddress,
      tokenMint: event.tokenMint,
      blockTime: event.blockTime,
      solAmount: event.solAmount,
      isEarlyEntry: isEarly,
    });

    // Check insider status
    const result = await this.checkInsiderStatus(event.walletAddress, {
      tokenMint: event.tokenMint,
      blockTime: event.blockTime,
      solAmount: event.solAmount,
      tokenCreationTime,
    });

    // Update wallet if newly flagged as insider
    if (result.isInsider) {
      await this.updateWalletInsiderStatus(event.walletAddress);
    }

    return result;
  }
}

