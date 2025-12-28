mod scoring;

use sha2::{Sha256, Digest};
use std::collections::HashMap;
pub use scoring::*;

/// Wallet scoring algorithm implementation in Rust
/// Provides high-performance calculations for whale detection

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WalletStats {
    pub address: String,
    pub total_volume_sol: f64,
    pub interaction_count: u64,
    pub average_entry_size: f64,
    pub early_entry_count: u64,
    pub winrate_proxy: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TokenInteraction {
    pub wallet_address: String,
    pub token_mint: String,
    pub block_time: u64,
    pub sol_amount: f64,
    pub is_early_entry: bool,
}

/// Calculate whale score based on wallet statistics
/// 
/// Scoring components:
/// - Early entry weight: 40 points
/// - Buy size weight: 30 points  
/// - Repetition count: 20 points
/// - Profit proxy: 10 points
pub fn calculate_whale_score(stats: &WalletStats) -> u8 {
    if stats.interaction_count == 0 {
        return 0;
    }

    let early_entry_ratio = if stats.interaction_count > 0 {
        stats.early_entry_count as f64 / stats.interaction_count as f64
    } else {
        0.0
    };

    // Component 1: Early Entry Score (0-40 points)
    let ratio_score = (early_entry_ratio * 20.0).min(20.0);
    let count_score = (stats.early_entry_count as f64 * 2.0).min(20.0);
    let early_entry_score = ratio_score + count_score;

    // Component 2: Buy Size Score (0-30 points)
    // Normalize average entry size (assuming 50+ SOL is maximum)
    let avg_size_score = ((stats.average_entry_size / 50.0) * 20.0).min(20.0);
    // Normalize total volume (assuming 500+ SOL is maximum)
    let volume_score = ((stats.total_volume_sol / 500.0) * 10.0).min(10.0);
    let buy_size_score = avg_size_score + volume_score;

    // Component 3: Repetition Score (0-20 points)
    // Linear scaling up to 50 interactions = 20 points
    let repetition_score = ((stats.interaction_count as f64 / 50.0) * 20.0).min(20.0);

    // Component 4: Profit Score (0-10 points)
    let profit_score = stats.winrate_proxy * 10.0;

    let total_score = early_entry_score + buy_size_score + repetition_score + profit_score;
    
    (total_score.min(100.0)) as u8
}

/// Calculate insider confidence score
/// 
/// Returns a confidence score from 0-100 based on:
/// - Early entry frequency
/// - Buy size consistency
/// - Behavior patterns
pub fn calculate_insider_confidence(
    early_entry_count: u64,
    total_interactions: u64,
    avg_buy_size: f64,
    min_threshold: f64,
    min_repetitions: u64,
) -> u8 {
    if total_interactions == 0 {
        return 0;
    }

    let mut confidence = 0.0;

    // Early entry repetition (0-40 points)
    if early_entry_count >= min_repetitions {
        let ratio = early_entry_count as f64 / total_interactions as f64;
        confidence += ratio * 40.0;
    }

    // Buy size threshold (0-30 points)
    if avg_buy_size >= min_threshold {
        confidence += 30.0;
    } else {
        confidence += (avg_buy_size / min_threshold) * 30.0;
    }

    // Volume indicator (0-20 points)
    if avg_buy_size >= min_threshold * 2.0 {
        confidence += 20.0;
    } else {
        confidence += ((avg_buy_size / (min_threshold * 2.0)) * 20.0).min(20.0);
    }

    // Winrate proxy (0-10 points)
    // This would be calculated from actual profit data
    confidence += 10.0;

    (confidence.min(100.0)) as u8
}

/// Process batch of interactions and calculate aggregate statistics
pub fn process_interactions(interactions: &[TokenInteraction]) -> WalletStats {
    if interactions.is_empty() {
        return WalletStats {
            address: String::new(),
            total_volume_sol: 0.0,
            interaction_count: 0,
            average_entry_size: 0.0,
            early_entry_count: 0,
            winrate_proxy: 0.0,
        };
    }

    let total_volume: f64 = interactions.iter().map(|i| i.sol_amount).sum();
    let interaction_count = interactions.len() as u64;
    let average_entry_size = total_volume / interaction_count as f64;
    let early_entry_count = interactions.iter().filter(|i| i.is_early_entry).count() as u64;

    // Calculate winrate proxy based on early entries
    // In production, this would track actual profit/loss
    let winrate_proxy = if interaction_count > 0 {
        (early_entry_count as f64 / interaction_count as f64 * 1.5).min(1.0)
    } else {
        0.3
    };

    WalletStats {
        address: interactions[0].wallet_address.clone(),
        total_volume_sol: total_volume,
        interaction_count,
        average_entry_size,
        early_entry_count,
        winrate_proxy,
    }
}

/// Hash wallet address for efficient lookups
pub fn hash_wallet_address(address: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(address.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Check if interaction qualifies as early entry
/// 
/// Returns true if the interaction happened within the specified time window
/// after token creation
pub fn is_early_entry(block_time: u64, token_creation_time: u64, window_seconds: u64) -> bool {
    if block_time < token_creation_time {
        return false;
    }
    let time_diff = block_time - token_creation_time;
    time_diff <= window_seconds
}

/// Group interactions by wallet address
pub fn group_by_wallet(interactions: &[TokenInteraction]) -> HashMap<String, Vec<TokenInteraction>> {
    let mut grouped: HashMap<String, Vec<TokenInteraction>> = HashMap::new();
    
    for interaction in interactions {
        grouped
            .entry(interaction.wallet_address.clone())
            .or_insert_with(Vec::new)
            .push(interaction.clone());
    }
    
    grouped
}

/// Calculate statistics for multiple wallets in batch
pub fn calculate_batch_stats(
    interactions: &[TokenInteraction],
) -> HashMap<String, WalletStats> {
    let grouped = group_by_wallet(interactions);
    let mut stats_map = HashMap::new();

    for (address, wallet_interactions) in grouped {
        let stats = process_interactions(&wallet_interactions);
        stats_map.insert(address, stats);
    }

    stats_map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_whale_score() {
        let stats = WalletStats {
            address: "test".to_string(),
            total_volume_sol: 100.0,
            interaction_count: 10,
            average_entry_size: 10.0,
            early_entry_count: 5,
            winrate_proxy: 0.8,
        };

        let score = calculate_whale_score(&stats);
        assert!(score <= 100);
        assert!(score > 0);
    }

    #[test]
    fn test_is_early_entry() {
        let creation_time = 1000;
        let early_time = 1050; // 50 seconds after
        let late_time = 1100; // 100 seconds after

        assert!(is_early_entry(early_time, creation_time, 60));
        assert!(!is_early_entry(late_time, creation_time, 60));
    }

    #[test]
    fn test_process_interactions() {
        let interactions = vec![
            TokenInteraction {
                wallet_address: "addr1".to_string(),
                token_mint: "token1".to_string(),
                block_time: 1000,
                sol_amount: 10.0,
                is_early_entry: true,
            },
            TokenInteraction {
                wallet_address: "addr1".to_string(),
                token_mint: "token2".to_string(),
                block_time: 2000,
                sol_amount: 20.0,
                is_early_entry: false,
            },
        ];

        let stats = process_interactions(&interactions);
        assert_eq!(stats.interaction_count, 2);
        assert_eq!(stats.total_volume_sol, 30.0);
        assert_eq!(stats.average_entry_size, 15.0);
        assert_eq!(stats.early_entry_count, 1);
    }
}

