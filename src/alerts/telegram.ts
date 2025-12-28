import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config.js';

export interface Alert {
  id?: number;
  type: 'whale_entry' | 'multiple_whales' | 'insider_detected';
  walletAddress?: string;
  tokenMint?: string;
  message: string;
  metadata: string;
  createdAt: number;
}

/**
 * Alert Manager
 * 
 * Handles alert delivery through multiple channels:
 * - Console (always enabled)
 * - JSON file output (optional)
 * - Telegram (optional)
 */
export class AlertManager {
  private telegramBot: TelegramBot | null = null;
  private alertLog: Alert[] = [];

  constructor() {
    // Initialize Telegram bot if configured
    if (config.telegram?.botToken && config.telegram?.chatId) {
      try {
        this.telegramBot = new TelegramBot(config.telegram.botToken, { polling: false });
        console.log('[AlertManager] Telegram bot initialized');
      } catch (error) {
        console.error('[AlertManager] Failed to initialize Telegram bot:', error);
      }
    }
  }

  /**
   * Send alert through all enabled channels
   */
  async sendAlert(alert: Alert): Promise<void> {
    // Always log to console
    this.logToConsole(alert);

    // Store in memory log
    this.alertLog.push(alert);
    if (this.alertLog.length > 1000) {
      this.alertLog.shift(); // Keep last 1000 alerts
    }

    // Send to Telegram if configured
    if (this.telegramBot && config.telegram?.chatId) {
      await this.sendToTelegram(alert);
    }

    // Could add JSON file output here if needed
  }

  /**
   * Log alert to console
   */
  private logToConsole(alert: Alert): void {
    const timestamp = new Date(alert.createdAt).toISOString();
    console.log(`\n[${timestamp}] ${alert.message}`);
    
    if (alert.walletAddress) {
      console.log(`  Wallet: ${alert.walletAddress}`);
    }
    if (alert.tokenMint) {
      console.log(`  Token: ${alert.tokenMint}`);
    }
    
    try {
      const metadata = JSON.parse(alert.metadata);
      if (Object.keys(metadata).length > 0) {
        console.log(`  Details:`, JSON.stringify(metadata, null, 2));
      }
    } catch (e) {
      // Metadata is not JSON, ignore
    }
  }

  /**
   * Send alert to Telegram
   */
  private async sendToTelegram(alert: Alert): Promise<void> {
    if (!this.telegramBot || !config.telegram?.chatId) return;

    try {
      let message = `${alert.message}\n\n`;
      
      if (alert.walletAddress) {
        message += `Wallet: \`${alert.walletAddress}\`\n`;
      }
      if (alert.tokenMint) {
        message += `Token: \`${alert.tokenMint}\`\n`;
      }

      // Parse metadata if available
      try {
        const metadata = JSON.parse(alert.metadata);
        if (metadata.score) {
          message += `Score: ${metadata.score}\n`;
        }
        if (metadata.solAmount) {
          message += `Amount: ${metadata.solAmount.toFixed(2)} SOL\n`;
        }
        if (metadata.confidence) {
          message += `Confidence: ${metadata.confidence}%\n`;
        }
        if (metadata.reasons && Array.isArray(metadata.reasons)) {
          message += `Reasons:\n${metadata.reasons.map((r: string) => `• ${r}`).join('\n')}\n`;
        }
      } catch (e) {
        // Ignore metadata parsing errors
      }

      message += `\nTime: ${new Date(alert.createdAt).toISOString()}`;

      await this.telegramBot.sendMessage(config.telegram.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error('[AlertManager] Failed to send Telegram message:', error);
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 100): Alert[] {
    return this.alertLog.slice(-limit).reverse();
  }

  /**
   * Format alert as JSON
   */
  formatAlertAsJSON(alert: Alert): string {
    return JSON.stringify(alert, null, 2);
  }
}

