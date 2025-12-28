import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Wallet {
  address: string;
  totalVolumeSol: number;
  interactionCount: number;
  averageEntrySize: number;
  winrateProxy: number;
  whaleScore: number;
  isInsider: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Token {
  mint: string;
  createdAt: number;
  creatorWallet: string;
  firstBlockTime: number;
}

export interface TokenInteraction {
  id?: number;
  walletAddress: string;
  tokenMint: string;
  blockTime: number;
  solAmount: number;
  isEarlyEntry: boolean;
  createdAt: number;
}

export interface Alert {
  id?: number;
  type: 'whale_entry' | 'multiple_whales' | 'insider_detected';
  walletAddress?: string;
  tokenMint?: string;
  message: string;
  metadata: string; // JSON string
  createdAt: number;
}

export class DatabaseStore {
  private db: Database.Database;

  constructor(dbPath: string = path.join(__dirname, '../../whale_detector.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeTables();
  }

  private initializeTables(): void {
    // Wallets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallets (
        address TEXT PRIMARY KEY,
        total_volume_sol REAL DEFAULT 0,
        interaction_count INTEGER DEFAULT 0,
        average_entry_size REAL DEFAULT 0,
        winrate_proxy REAL DEFAULT 0,
        whale_score REAL DEFAULT 0,
        is_insider INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Tokens table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        mint TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        creator_wallet TEXT,
        first_block_time INTEGER NOT NULL
      )
    `);

    // Token interactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        token_mint TEXT NOT NULL,
        block_time INTEGER NOT NULL,
        sol_amount REAL NOT NULL,
        is_early_entry INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (wallet_address) REFERENCES wallets(address),
        FOREIGN KEY (token_mint) REFERENCES tokens(mint)
      )
    `);

    // Alerts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        wallet_address TEXT,
        token_mint TEXT,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // Indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_interactions_wallet ON token_interactions(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_interactions_token ON token_interactions(token_mint);
      CREATE INDEX IF NOT EXISTS idx_interactions_time ON token_interactions(block_time);
      CREATE INDEX IF NOT EXISTS idx_wallets_score ON wallets(whale_score DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
    `);
  }

  // Wallet operations
  upsertWallet(wallet: Omit<Wallet, 'createdAt' | 'updatedAt'>): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO wallets (
        address, total_volume_sol, interaction_count, average_entry_size,
        winrate_proxy, whale_score, is_insider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET
        total_volume_sol = excluded.total_volume_sol,
        interaction_count = excluded.interaction_count,
        average_entry_size = excluded.average_entry_size,
        winrate_proxy = excluded.winrate_proxy,
        whale_score = excluded.whale_score,
        is_insider = excluded.is_insider,
        updated_at = excluded.updated_at
    `);

    const existing = this.getWallet(wallet.address);
    const createdAt = existing?.createdAt || now;

    stmt.run(
      wallet.address,
      wallet.totalVolumeSol,
      wallet.interactionCount,
      wallet.averageEntrySize,
      wallet.winrateProxy,
      wallet.whaleScore,
      wallet.isInsider ? 1 : 0,
      createdAt,
      now
    );
  }

  getWallet(address: string): Wallet | null {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE address = ?');
    const row = stmt.get(address) as any;
    if (!row) return null;

    return {
      address: row.address,
      totalVolumeSol: row.total_volume_sol,
      interactionCount: row.interaction_count,
      averageEntrySize: row.average_entry_size,
      winrateProxy: row.winrate_proxy,
      whaleScore: row.whale_score,
      isInsider: row.is_insider === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getAllWallets(limit: number = 100, minScore: number = 0): Wallet[] {
    const stmt = this.db.prepare(`
      SELECT * FROM wallets 
      WHERE whale_score >= ? 
      ORDER BY whale_score DESC 
      LIMIT ?
    `);
    const rows = stmt.all(minScore, limit) as any[];

    return rows.map(row => ({
      address: row.address,
      totalVolumeSol: row.total_volume_sol,
      interactionCount: row.interaction_count,
      averageEntrySize: row.average_entry_size,
      winrateProxy: row.winrate_proxy,
      whaleScore: row.whale_score,
      isInsider: row.is_insider === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  // Token operations
  upsertToken(token: Token): void {
    const stmt = this.db.prepare(`
      INSERT INTO tokens (mint, created_at, creator_wallet, first_block_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(mint) DO NOTHING
    `);
    stmt.run(token.mint, token.createdAt, token.creatorWallet, token.firstBlockTime);
  }

  getToken(mint: string): Token | null {
    const stmt = this.db.prepare('SELECT * FROM tokens WHERE mint = ?');
    const row = stmt.get(mint) as any;
    if (!row) return null;

    return {
      mint: row.mint,
      createdAt: row.created_at,
      creatorWallet: row.creator_wallet,
      firstBlockTime: row.first_block_time,
    };
  }

  // Interaction operations
  addInteraction(interaction: Omit<TokenInteraction, 'id' | 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO token_interactions (
        wallet_address, token_mint, block_time, sol_amount, is_early_entry, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      interaction.walletAddress,
      interaction.tokenMint,
      interaction.blockTime,
      interaction.solAmount,
      interaction.isEarlyEntry ? 1 : 0,
      Date.now()
    );
  }

  getWalletInteractions(walletAddress: string, limit: number = 100): TokenInteraction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM token_interactions 
      WHERE wallet_address = ? 
      ORDER BY block_time DESC 
      LIMIT ?
    `);
    const rows = stmt.all(walletAddress, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      walletAddress: row.wallet_address,
      tokenMint: row.token_mint,
      blockTime: row.block_time,
      solAmount: row.sol_amount,
      isEarlyEntry: row.is_early_entry === 1,
      createdAt: row.created_at,
    }));
  }

  getTokenInteractions(tokenMint: string): TokenInteraction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM token_interactions 
      WHERE token_mint = ? 
      ORDER BY block_time ASC
    `);
    const rows = stmt.all(tokenMint) as any[];

    return rows.map(row => ({
      id: row.id,
      walletAddress: row.wallet_address,
      tokenMint: row.token_mint,
      blockTime: row.block_time,
      solAmount: row.sol_amount,
      isEarlyEntry: row.is_early_entry === 1,
      createdAt: row.created_at,
    }));
  }

  getEarlyEntriesForWallet(walletAddress: string): TokenInteraction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM token_interactions 
      WHERE wallet_address = ? AND is_early_entry = 1
      ORDER BY block_time DESC
    `);
    const rows = stmt.all(walletAddress) as any[];

    return rows.map(row => ({
      id: row.id,
      walletAddress: row.wallet_address,
      tokenMint: row.token_mint,
      blockTime: row.block_time,
      solAmount: row.sol_amount,
      isEarlyEntry: true,
      createdAt: row.created_at,
    }));
  }

  // Alert operations
  addAlert(alert: Omit<Alert, 'id' | 'createdAt'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, wallet_address, token_mint, message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      alert.type,
      alert.walletAddress || null,
      alert.tokenMint || null,
      alert.message,
      alert.metadata,
      Date.now()
    );
    return result.lastInsertRowid as number;
  }

  getAlerts(limit: number = 100): Alert[] {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type as Alert['type'],
      walletAddress: row.wallet_address,
      tokenMint: row.token_mint,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

