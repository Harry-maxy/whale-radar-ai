# Quick Start Guide

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and configure:
   - **Solana RPC URLs**: Use a reliable RPC provider (Helius, QuickNode, or public endpoints)
   - **Pump.fun Program ID**: Verify the program ID is correct (currently using placeholder)
   - **Detection Thresholds**: Adjust based on your needs
   - **Telegram Bot** (optional): Add bot token and chat ID for alerts

## Build

```bash
npm run build
```

## Run

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## Adding Tracked Wallets

### Via API (if enabled)

```bash
curl -X POST http://localhost:3000/wallet \
  -H "Content-Type: application/json" \
  -d '{"address": "YOUR_WALLET_ADDRESS"}'
```

### Via Code

Edit `src/index.ts` and add in the `start()` method:
```typescript
this.whaleDetector.addTrackedWallet('YOUR_WALLET_ADDRESS');
```

## Monitoring

The system will:
1. Monitor Pump.fun program transactions
2. Detect buys/sells on tokens
3. Track wallet behavior
4. Calculate whale scores
5. Detect insider patterns
6. Send alerts for significant events

## API Endpoints

If API is enabled (default), access:
- `GET http://localhost:3000/whales` - List all tracked whales
- `GET http://localhost:3000/wallet/:address` - Get wallet details
- `GET http://localhost:3000/alerts` - Get recent alerts
- `GET http://localhost:3000/tokens/:mint` - Get token information
- `GET http://localhost:3000/top-whales?limit=10` - Get top whales
- `POST http://localhost:3000/wallet` - Add wallet to track

## Alerts

Alerts are sent to:
1. **Console**: Always enabled
2. **Telegram**: If configured in `.env`

Alert types:
- `whale_entry`: High-score whale enters a token
- `multiple_whales`: Multiple whales enter same token
- `insider_detected`: Wallet flagged as insider

## Notes

- The transaction parser is simplified; production use may require proper instruction decoding
- Polling interval is 2 seconds (adjustable in code)
- Database file: `whale_detector.db` (SQLite)
- Verify Pump.fun program ID before production use

