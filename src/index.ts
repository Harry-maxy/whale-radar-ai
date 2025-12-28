import { DatabaseStore } from './storage/db.js';
import { SolanaRPC } from './rpc/solana.js';
import { PumpFunDetector, PumpFunEvent } from './rpc/pumpfun.js';
import { WhaleDetector } from './detector/whale-detector.js';
import { AlertManager } from './alerts/telegram.js';
import { APIServer } from './api/index.js';
import { config } from './config.js';

/**
 * Main Application Entry Point
 * 
 * Initializes and coordinates all components:
 * - Database storage
 * - Solana RPC client
 * - Pump.fun event detector
 * - Whale detector
 * - Alert system
 * - API server (optional)
 */
class WhaleDetectorApp {
  private db: DatabaseStore;
  private solanaRPC: SolanaRPC;
  private pumpFunDetector: PumpFunDetector;
  private whaleDetector: WhaleDetector;
  private alertManager: AlertManager;
  private apiServer?: APIServer;
  private isRunning: boolean = false;

  constructor() {
    console.log('[App] Initializing Whale Detector...');
    
    // Initialize database
    this.db = new DatabaseStore();
    console.log('[App] Database initialized');

    // Initialize Solana RPC
    this.solanaRPC = new SolanaRPC();
    console.log('[App] Solana RPC initialized');

    // Initialize Pump.fun detector
    this.pumpFunDetector = new PumpFunDetector(this.solanaRPC);
    console.log('[App] Pump.fun detector initialized');

    // Initialize alert manager
    this.alertManager = new AlertManager();
    console.log('[App] Alert manager initialized');

    // Initialize whale detector
    this.whaleDetector = new WhaleDetector(
      this.db,
      this.pumpFunDetector,
      this.alertManager
    );
    console.log('[App] Whale detector initialized');

    // Initialize API server if enabled
    if (config.api.enabled) {
      this.apiServer = new APIServer(this.db, this.whaleDetector);
      console.log('[App] API server initialized');
    }
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[App] Application is already running');
      return;
    }

    try {
      console.log('[App] Starting Whale Detector...');
      this.isRunning = true;

      // Start API server if enabled
      if (this.apiServer) {
        this.apiServer.start();
      }

      // Subscribe to Pump.fun events
      await this.subscribeToEvents();

      // Add some example wallets to track (optional - can be removed)
      // You can add known whale wallets here
      // this.whaleDetector.addTrackedWallet('YOUR_WHALE_WALLET_ADDRESS');

      console.log('[App] Whale Detector is running');
      console.log('[App] Monitoring Pump.fun program:', config.pumpfun.programId);
      console.log('[App] Detection thresholds:');
      console.log(`  - Early entry window: ${config.detection.earlyEntryWindowSeconds}s`);
      console.log(`  - Min buy size: ${config.detection.minBuySizeSol} SOL`);
      console.log(`  - Min insider repetitions: ${config.detection.minInsiderRepetitions}`);
      console.log(`  - Whale score threshold: ${config.detection.whaleScoreThreshold}`);

      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      console.error('[App] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Subscribe to Pump.fun program events
   */
  private async subscribeToEvents(): Promise<void> {
    // Subscribe to program logs
    await this.pumpFunDetector.subscribe(async (event: PumpFunEvent) => {
      await this.handlePumpFunEvent(event);
    });

    // Alternative: Monitor transactions via account changes
    // This is a more reliable method for detecting buys/sells
    // You can implement account change monitoring here if needed
  }

  /**
   * Handle incoming Pump.fun event
   */
  private async handlePumpFunEvent(event: PumpFunEvent): Promise<void> {
    try {
      // Process event through whale detector
      await this.whaleDetector.processEvent(event);

      // Log event (optional, can be verbose)
      // console.log(`[Event] ${event.type} - Wallet: ${event.walletAddress.slice(0, 8)}... - Token: ${event.tokenMint.slice(0, 8)}... - Amount: ${event.solAmount} SOL`);
    } catch (error) {
      console.error('[App] Error handling Pump.fun event:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    if (!this.isRunning) return;

    console.log('\n[App] Shutting down...');
    this.isRunning = false;

    try {
      // Unsubscribe from events
      await this.pumpFunDetector.unsubscribe();

      // Close database
      this.db.close();

      console.log('[App] Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[App] Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get application status
   */
  getStatus(): { isRunning: boolean; stats: any } {
    const topWhales = this.whaleDetector.getTopWhales(5);
    const recentAlerts = this.db.getAlerts(10);

    return {
      isRunning: this.isRunning,
      stats: {
        topWhales: topWhales.length,
        recentAlerts: recentAlerts.length,
      },
    };
  }
}

// Main execution
async function main() {
  const app = new WhaleDetectorApp();
  await app.start();
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

