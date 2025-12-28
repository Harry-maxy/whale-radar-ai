import { DatabaseStore, Wallet } from '../storage/db.js';
import { PumpFunEvent } from '../rpc/pumpfun.js';
import { PumpFunDetector } from '../rpc/pumpfun.js';
import { InsiderDetector } from './insider-logic.js';
import { WhaleScorer } from './scoring.js';
import { AlertManager } from '../alerts/telegram.js';
import { config } from '../config.js';

/**
 * Whale Detector
 * 
 * Main orchestrator for whale detection system:
 * - Tracks wallets and their behavior
 * - Monitors Pump.fun events
 * - Detects insiders
 * - Calculates scores
 * - Generates alerts
 */
export class WhaleDetector {
  private db: DatabaseStore;
  private pumpFunDetector: PumpFunDetector;
  private insiderDetector: InsiderDetector;
  private scorer: WhaleScorer;
  private alertManager: AlertManager;
  private trackedTokens: Map<string, number> = new Map(); // tokenMint -> creationTime

  constructor(
    db: DatabaseStore,
    pumpFunDetector: PumpFunDetector,
    alertManager: AlertManager
  ) {
    this.db = db;
    this.pumpFunDetector = pumpFunDetector;
    this.insiderDetector = new InsiderDetector(db);
    this.scorer = new WhaleScorer(db);
    this.alertManager = alertManager;
  }

  /**
   * Add a wallet to track manually
   */
  addTrackedWallet(walletAddress: string): void {
    const existing = this.db.getWallet(walletAddress);
    if (!existing) {
      this.db.upsertWallet({
        address: walletAddress,
        totalVolumeSol: 0,
        interactionCount: 0,
        averageEntrySize: 0,
        winrateProxy: 0,
        whaleScore: 0,
        isInsider: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log(`[WhaleDetector] Added tracked wallet: ${walletAddress}`);
    }
  }

  /**
   * Process a Pump.fun event
   */
  async processEvent(event: PumpFunEvent): Promise<void> {
    try {
      // Get or set token creation time
      let tokenCreationTime = this.trackedTokens.get(event.tokenMint);
      if (!tokenCreationTime) {
        tokenCreationTime = await this.pumpFunDetector.getTokenCreationTime(event.tokenMint);
        if (tokenCreationTime) {
          this.trackedTokens.set(event.tokenMint, tokenCreationTime);
          
          // Store token in database
          this.db.upsertToken({
            mint: event.tokenMint,
            createdAt: Date.now(),
            creatorWallet: '', // Could be extracted from transaction
            firstBlockTime: tokenCreationTime,
          });
        } else {
          // Fallback to event time if we can't find creation time
          tokenCreationTime = event.blockTime;
        }
      }

      // Process buy events
      if (event.type === 'buy') {
        await this.processBuyEvent(event, tokenCreationTime);
      }

      // Process sell events for tracking (optional)
      if (event.type === 'sell') {
        // Could track exits here
      }

    } catch (error) {
      console.error('[WhaleDetector] Error processing event:', error);
    }
  }

  /**
   * Process a buy event
   */
  private async processBuyEvent(event: PumpFunEvent, tokenCreationTime: number): Promise<void> {
    // Check if wallet exists, create if not
    let wallet = this.db.getWallet(event.walletAddress);
    if (!wallet) {
      // Auto-detect: new wallet making a buy
      wallet = {
        address: event.walletAddress,
        totalVolumeSol: 0,
        interactionCount: 0,
        averageEntrySize: 0,
        winrateProxy: 0,
        whaleScore: 0,
        isInsider: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.db.upsertWallet(wallet);
      console.log(`[WhaleDetector] Auto-detected wallet: ${event.walletAddress}`);
    }

    // Check for insider behavior
    const insiderResult = await this.insiderDetector.processEvent(event, tokenCreationTime);

    // Recalculate wallet stats
    const updatedWallet = this.scorer.recalculateWalletStats(event.walletAddress);

    // Check if this is a high-score wallet entering
    const isHighScore = updatedWallet.whaleScore >= config.detection.whaleScoreThreshold;
    const isInsider = insiderResult?.isInsider || false;

    // Generate alerts
    if (isHighScore || isInsider) {
      await this.generateAlerts(event, updatedWallet, insiderResult);
    }

    // Check for multiple whales on same token
    await this.checkMultipleWhales(event.tokenMint);
  }

  /**
   * Generate alerts for significant events
   */
  private async generateAlerts(
    event: PumpFunEvent,
    wallet: Wallet,
    insiderResult: any
  ): Promise<void> {
    const alerts: Array<{ type: string; message: string; metadata: any }> = [];

    // High score whale entry
    if (wallet.whaleScore >= config.detection.whaleScoreThreshold) {
      alerts.push({
        type: 'whale_entry',
        message: `🐋 Whale Alert: Score ${wallet.whaleScore} wallet entered token`,
        metadata: JSON.stringify({
          wallet: wallet.address,
          token: event.tokenMint,
          score: wallet.whaleScore,
          solAmount: event.solAmount,
          blockTime: event.blockTime,
        }),
      });
    }

    // Insider detection
    if (insiderResult?.isInsider) {
      alerts.push({
        type: 'insider_detected',
        message: `⚠️ Insider Alert: Wallet flagged as insider`,
        metadata: JSON.stringify({
          wallet: wallet.address,
          token: event.tokenMint,
          confidence: insiderResult.confidence,
          reasons: insiderResult.reasons,
          solAmount: event.solAmount,
        }),
      });
    }

    // Send alerts
    for (const alert of alerts) {
      const alertId = this.db.addAlert({
        type: alert.type as any,
        walletAddress: wallet.address,
        tokenMint: event.tokenMint,
        message: alert.message,
        metadata: alert.metadata,
      });

      await this.alertManager.sendAlert({
        ...alert,
        id: alertId,
        walletAddress: wallet.address,
        tokenMint: event.tokenMint,
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Check if multiple tracked whales are buying the same token
   */
  private async checkMultipleWhales(tokenMint: string): Promise<void> {
    const interactions = this.db.getTokenInteractions(tokenMint);
    
    // Get unique wallet addresses
    const walletAddresses = [...new Set(interactions.map(i => i.walletAddress))];
    
    // Count high-score wallets
    const highScoreWallets = walletAddresses
      .map(addr => this.db.getWallet(addr))
      .filter(w => w && w.whaleScore >= config.detection.whaleScoreThreshold);

    if (highScoreWallets.length >= 2) {
      const alertId = this.db.addAlert({
        type: 'multiple_whales',
        tokenMint,
        message: `🚨 Multiple Whales Alert: ${highScoreWallets.length} high-score whales entered token`,
        metadata: JSON.stringify({
          token: tokenMint,
          whaleCount: highScoreWallets.length,
          wallets: highScoreWallets.map(w => ({
            address: w.address,
            score: w.whaleScore,
          })),
        }),
      });

      await this.alertManager.sendAlert({
        id: alertId,
        type: 'multiple_whales',
        tokenMint,
        message: `🚨 Multiple Whales: ${highScoreWallets.length} whales detected`,
        metadata: JSON.stringify({
          token: tokenMint,
          whaleCount: highScoreWallets.length,
        }),
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Get top whales by score
   */
  getTopWhales(limit: number = 10): Wallet[] {
    return this.db.getAllWallets(limit, config.detection.whaleScoreThreshold);
  }

  /**
   * Get wallet details
   */
  getWalletDetails(walletAddress: string): {
    wallet: Wallet | null;
    interactions: any[];
    score: number;
  } {
    const wallet = this.db.getWallet(walletAddress);
    const interactions = wallet ? this.db.getWalletInteractions(walletAddress) : [];
    const score = wallet?.whaleScore || 0;

    return {
      wallet,
      interactions,
      score,
    };
  }
}

