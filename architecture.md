# Architecture Notes

## Overview

The Whale Detector is built with a modular architecture that separates concerns into distinct layers:

1. **RPC Layer** (`src/rpc/`): Handles Solana blockchain interactions
2. **Storage Layer** (`src/storage/`): SQLite database for persistence
3. **Detection Layer** (`src/detector/`): Core logic for whale/insider detection
4. **Alert Layer** (`src/alerts/`): Multi-channel alert delivery
5. **API Layer** (`src/api/`): REST API for querying data

## Detection Flow

1. **Event Monitoring**: PumpFunDetector monitors Pump.fun program transactions
2. **Event Parsing**: Transactions are parsed to extract buy/sell events
3. **Wallet Tracking**: Each event updates wallet statistics
4. **Insider Detection**: InsiderDetector analyzes behavior patterns
5. **Scoring**: WhaleScorer calculates 0-100 scores
6. **Alerting**: AlertManager sends notifications for significant events

## Key Components

### WhaleDetector
Main orchestrator that coordinates all detection activities.

### InsiderDetector
Implements the insider detection algorithm:
- Checks early entry frequency
- Validates buy size thresholds
- Calculates confidence scores
- Flags wallets based on behavior patterns

### WhaleScorer
Calculates whale scores using weighted components:
- Early entry weight: 40 points
- Buy size weight: 30 points
- Repetition count: 20 points
- Profit proxy: 10 points

### DatabaseStore
Manages all data persistence:
- Wallets: stats and scores
- Tokens: creation metadata
- Interactions: buy/sell records
- Alerts: notification history

## Transaction Parsing

**Current Implementation**: Simplified transaction parser that:
- Extracts wallet and token mint from account keys
- Calculates SOL amounts from balance changes
- Determines buy/sell from balance direction

**Production Considerations**:
- Pump.fun uses specific instruction formats that should be properly decoded
- Instruction data contains structured information about operations
- Account indices vary by instruction type
- Consider using IDL (Interface Definition Language) for proper decoding

## Monitoring Strategy

**Current Approach**: Polling-based transaction monitoring
- Polls recent transactions every 2 seconds
- Processes new signatures sequentially
- Tracks last processed signature to avoid duplicates

**Alternative Approaches** (for production):
- WebSocket subscriptions to program accounts
- Use indexing services (Helius, QuickNode, etc.)
- Monitor specific account changes
- Use transaction versioned transactions for better parsing

## Limitations & Future Improvements

1. **Transaction Parsing**: Current parser is simplified; production needs proper instruction decoding
2. **Token Creation Detection**: Currently inferred; should parse creation instructions
3. **Price Tracking**: Winrate proxy is placeholder; needs actual price data
4. **Scalability**: Polling approach may miss transactions; consider indexing service
5. **Error Handling**: Add retry logic and better error recovery
6. **Performance**: Add connection pooling and rate limiting

## Configuration

All thresholds are configurable via `.env`:
- `EARLY_ENTRY_WINDOW_SECONDS`: Time window for early entry detection
- `MIN_BUY_SIZE_SOL`: Minimum buy size to consider significant
- `MIN_INSIDER_REPETITIONS`: Minimum early entries to flag as insider
- `WHALE_SCORE_THRESHOLD`: Minimum score to trigger alerts

## Database Schema

- **wallets**: Wallet addresses, stats, scores, insider status
- **tokens**: Token mints, creation times, creators
- **token_interactions**: Buy/sell records with timing
- **alerts**: Notification history

Indexes are created for performance on common queries.

