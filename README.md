# Whale Radar AI

A real-time whale and insider wallet detection system for Pump.fun tokens on Solana.

## Features

- **Wallet Tracking**: Monitor whale wallets and their behavior
- **Real-time Detection**: Subscribe to Pump.fun program events via websocket
- **Insider Detection**: Identify wallets that consistently enter tokens early
- **Whale Scoring**: 0-100 score based on behavior patterns
- **Alerts**: Console, JSON, and optional Telegram notifications
- **REST API**: Query whales, wallets, alerts, and tokens

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Build:
```bash
npm run build
```

4. Run:
```bash
npm start
```

Or for development:
```bash
npm run dev
```

## Configuration

Edit `.env` to configure:
- Solana RPC endpoints
- Detection thresholds
- Telegram bot (optional)
- API port

## Architecture

- `src/rpc/`: Solana RPC client and Pump.fun event monitoring
- `src/detector/`: Whale detection, insider logic, and scoring
- `src/storage/`: SQLite database layer
- `src/alerts/`: Alert system (console, JSON, Telegram)
- `src/config.ts`: Configuration management
- `src/index.ts`: Main entry point

## API Endpoints (if enabled)

- `GET /whales` - List all tracked whales
- `GET /wallet/:address` - Get wallet details
- `GET /alerts` - Get recent alerts
- `GET /tokens/:mint` - Get token information

