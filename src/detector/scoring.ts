import { DatabaseStore, Wallet, TokenInteraction } from '../storage/db.js';

/**
 * Whale Scoring System
 * 
 * Creates a Whale Score (0-100) based on:
 * - Early entry weight (40 points)
 * - Buy size weight (30 points)
 * - Repetition count (20 points)
 * - Profit proxy (10 points)
 */
export class WhaleScorer {
  private db: DatabaseStore;

  constructor(db: DatabaseStore) {
    this.db = db;
  }

  /**
   * Calculate whale score for a wallet
   */
  calculateWhaleScore(walletAddress: string): number {
    const wallet = this.db.getWallet(walletAddress);
    if (!wallet || wallet.interactionCount === 0) {
      return 0;
    }

    const interactions = this.db.getWalletInteractions(walletAddress);
    const earlyEntries = this.db.getEarlyEntriesForWallet(walletAddress);

    // Component 1: Early Entry Weight (0-40 points)
    const earlyEntryScore = this.calculateEarlyEntryScore(earlyEntries, interactions);

    // Component 2: Buy Size Weight (0-30 points)
    const buySizeScore = this.calculateBuySizeScore(wallet);

    // Component 3: Repetition Count (0-20 points)
    const repetitionScore = this.calculateRepetitionScore(interactions);

    // Component 4: Profit Proxy (0-10 points)
    const profitScore = this.calculateProfitScore(wallet);

    const totalScore = earlyEntryScore + buySizeScore + repetitionScore + profitScore;

    return Math.min(Math.round(totalScore), 100);
  }

  /**
   * Calculate early entry score component
   * Higher score for more early entries and higher ratio
   */
  private calculateEarlyEntryScore(earlyEntries: TokenInteraction[], allInteractions: TokenInteraction[]): number {
    if (allInteractions.length === 0) return 0;

    const earlyEntryRatio = earlyEntries.length / allInteractions.length;
    const earlyEntryCount = earlyEntries.length;

    // Score based on ratio (0-20 points) and count (0-20 points)
    const ratioScore = Math.min(earlyEntryRatio * 20, 20);
    const countScore = Math.min(earlyEntryCount * 2, 20);

    return ratioScore + countScore;
  }

  /**
   * Calculate buy size score component
   * Higher score for larger average and total volume
   */
  private calculateBuySizeScore(wallet: Wallet): number {
    // Normalize average entry size (0-20 points)
    // Assuming 50+ SOL is maximum for scoring
    const avgSizeScore = Math.min((wallet.averageEntrySize / 50) * 20, 20);

    // Normalize total volume (0-10 points)
    // Assuming 500+ SOL is maximum for scoring
    const volumeScore = Math.min((wallet.totalVolumeSol / 500) * 10, 10);

    return avgSizeScore + volumeScore;
  }

  /**
   * Calculate repetition score component
   * Higher score for more interactions
   */
  private calculateRepetitionScore(interactions: TokenInteraction[]): number {
    const count = interactions.length;
    // Linear scaling up to 50 interactions = 20 points
    return Math.min((count / 50) * 20, 20);
  }

  /**
   * Calculate profit proxy score component
   * Higher score for better win rate
   */
  private calculateProfitScore(wallet: Wallet): number {
    // Winrate proxy is already normalized 0-1
    return wallet.winrateProxy * 10;
  }

  /**
   * Recalculate and update wallet score
   */
  updateWalletScore(walletAddress: string): number {
    const score = this.calculateWhaleScore(walletAddress);
    const wallet = this.db.getWallet(walletAddress);

    if (wallet) {
      this.db.upsertWallet({
        ...wallet,
        whaleScore: score,
      });
    }

    return score;
  }

  /**
   * Recalculate wallet stats based on interactions
   */
  recalculateWalletStats(walletAddress: string): Wallet {
    const interactions = this.db.getWalletInteractions(walletAddress);
    const wallet = this.db.getWallet(walletAddress) || {
      address: walletAddress,
      totalVolumeSol: 0,
      interactionCount: 0,
      averageEntrySize: 0,
      winrateProxy: 0,
      whaleScore: 0,
      isInsider: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (interactions.length === 0) {
      return wallet;
    }

    // Calculate total volume
    const totalVolume = interactions.reduce((sum, i) => sum + i.solAmount, 0);

    // Calculate average entry size
    const averageEntrySize = totalVolume / interactions.length;

    // Calculate winrate proxy (simplified - in production, track actual profits)
    // For MVP, use a placeholder calculation based on early entries
    const earlyEntries = interactions.filter(i => i.isEarlyEntry);
    const winrateProxy = earlyEntries.length > 0 ? Math.min(earlyEntries.length / interactions.length * 1.5, 1) : 0.3;

    const updatedWallet: Wallet = {
      ...wallet,
      totalVolumeSol: totalVolume,
      interactionCount: interactions.length,
      averageEntrySize,
      winrateProxy,
      updatedAt: Date.now(),
    };

    // Calculate and update score
    updatedWallet.whaleScore = this.calculateWhaleScore(walletAddress);

    // Save to database
    this.db.upsertWallet(updatedWallet);

    return updatedWallet;
  }
}

