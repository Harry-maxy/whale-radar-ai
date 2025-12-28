import express, { Express, Request, Response } from 'express';
import { DatabaseStore } from '../storage/db.js';
import { WhaleDetector } from '../detector/whaleDetector.js';
import { config } from '../config.js';

/**
 * Express API Server
 * 
 * Provides REST endpoints for querying whale data
 */
export class APIServer {
  private app: Express;
  private db: DatabaseStore;
  private whaleDetector: WhaleDetector;

  constructor(db: DatabaseStore, whaleDetector: WhaleDetector) {
    this.app = express();
    this.db = db;
    this.whaleDetector = whaleDetector;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Get all tracked whales
    this.app.get('/whales', (req: Request, res: Response) => {
      try {
        const minScore = parseInt(req.query.minScore as string) || 0;
        const limit = parseInt(req.query.limit as string) || 100;
        const whales = this.db.getAllWallets(limit, minScore);
        res.json({ whales, count: whales.length });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch whales', message: (error as Error).message });
      }
    });

    // Get wallet details
    this.app.get('/wallet/:address', (req: Request, res: Response) => {
      try {
        const { address } = req.params;
        const details = this.whaleDetector.getWalletDetails(address);
        
        if (!details.wallet) {
          return res.status(404).json({ error: 'Wallet not found' });
        }

        res.json(details);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wallet', message: (error as Error).message });
      }
    });

    // Get recent alerts
    this.app.get('/alerts', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const alerts = this.db.getAlerts(limit);
        res.json({ alerts, count: alerts.length });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alerts', message: (error as Error).message });
      }
    });

    // Get token information
    this.app.get('/tokens/:mint', (req: Request, res: Response) => {
      try {
        const { mint } = req.params;
        const token = this.db.getToken(mint);
        
        if (!token) {
          return res.status(404).json({ error: 'Token not found' });
        }

        const interactions = this.db.getTokenInteractions(mint);
        const uniqueWallets = [...new Set(interactions.map(i => i.walletAddress))];
        const highScoreWallets = uniqueWallets
          .map(addr => this.db.getWallet(addr))
          .filter(w => w && w.whaleScore >= config.detection.whaleScoreThreshold);

        res.json({
          token,
          interactions: {
            total: interactions.length,
            uniqueWallets: uniqueWallets.length,
            highScoreWhales: highScoreWallets.length,
          },
          interactions,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch token', message: (error as Error).message });
      }
    });

    // Add wallet to track
    this.app.post('/wallet', (req: Request, res: Response) => {
      try {
        const { address } = req.body;
        if (!address || typeof address !== 'string') {
          return res.status(400).json({ error: 'Invalid wallet address' });
        }

        this.whaleDetector.addTrackedWallet(address);
        res.json({ message: 'Wallet added to tracking', address });
      } catch (error) {
        res.status(500).json({ error: 'Failed to add wallet', message: (error as Error).message });
      }
    });

    // Get top whales
    this.app.get('/top-whales', (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 10;
        const whales = this.whaleDetector.getTopWhales(limit);
        res.json({ whales, count: whales.length });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch top whales', message: (error as Error).message });
      }
    });
  }

  /**
   * Start the API server
   */
  start(): void {
    const port = config.api.port;
    this.app.listen(port, () => {
      console.log(`[API] Server running on http://localhost:${port}`);
    });
  }
}

