/// Advanced scoring algorithms for whale detection
/// High-performance implementations using Rust

use crate::{WalletStats, TokenInteraction};
use std::collections::HashMap;

/// Calculate dynamic score weights based on market conditions
pub struct DynamicScorer {
    pub early_entry_weight: f64,
    pub buy_size_weight: f64,
    pub repetition_weight: f64,
    pub profit_weight: f64,
}

impl Default for DynamicScorer {
    fn default() -> Self {
        Self {
            early_entry_weight: 40.0,
            buy_size_weight: 30.0,
            repetition_weight: 20.0,
            profit_weight: 10.0,
        }
    }
}

impl DynamicScorer {
    /// Calculate score with custom weights
    pub fn calculate_score(&self, stats: &WalletStats) -> u8 {
        if stats.interaction_count == 0 {
            return 0;
        }

        let early_ratio = stats.early_entry_count as f64 / stats.interaction_count as f64;
        let early_score = (early_ratio * self.early_entry_weight).min(self.early_entry_weight);
        
        let size_score = ((stats.average_entry_size / 50.0) * self.buy_size_weight).min(self.buy_size_weight);
        
        let rep_score = ((stats.interaction_count as f64 / 50.0) * self.repetition_weight).min(self.repetition_weight);
        
        let profit_score = stats.winrate_proxy * self.profit_weight;

        let total = early_score + size_score + rep_score + profit_score;
        (total.min(100.0)) as u8
    }
}

/// Pattern detection for insider behavior
pub struct PatternDetector {
    pub min_early_entries: u64,
    pub min_avg_buy_size: f64,
    pub consistency_threshold: f64,
}

impl PatternDetector {
    pub fn detect_pattern(&self, interactions: &[TokenInteraction]) -> bool {
        if interactions.len() < self.min_early_entries as usize {
            return false;
        }

        let early_count = interactions.iter().filter(|i| i.is_early_entry).count() as u64;
        if early_count < self.min_early_entries {
            return false;
        }

        let avg_size: f64 = interactions.iter().map(|i| i.sol_amount).sum::<f64>() 
            / interactions.len() as f64;
        
        avg_size >= self.min_avg_buy_size
    }

    /// Calculate pattern consistency score
    pub fn consistency_score(&self, interactions: &[TokenInteraction]) -> f64 {
        if interactions.len() < 3 {
            return 0.0;
        }

        let sizes: Vec<f64> = interactions.iter().map(|i| i.sol_amount).collect();
        let mean = sizes.iter().sum::<f64>() / sizes.len() as f64;
        
        let variance = sizes.iter()
            .map(|&x| (x - mean).powi(2))
            .sum::<f64>() / sizes.len() as f64;
        
        let std_dev = variance.sqrt();
        let coefficient_of_variation = if mean > 0.0 { std_dev / mean } else { 0.0 };
        
        // Lower CV = more consistent = higher score
        (1.0 - (coefficient_of_variation.min(1.0))) * 100.0
    }
}

/// Cluster wallets by behavior patterns
pub struct WalletClusterer {
    pub similarity_threshold: f64,
}

impl WalletClusterer {
    pub fn cluster_wallets(&self, stats_map: &HashMap<String, WalletStats>) -> Vec<Vec<String>> {
        let mut clusters: Vec<Vec<String>> = Vec::new();
        let mut assigned: std::collections::HashSet<String> = std::collections::HashSet::new();

        for (addr1, stats1) in stats_map {
            if assigned.contains(addr1) {
                continue;
            }

            let mut cluster = vec![addr1.clone()];
            assigned.insert(addr1.clone());

            for (addr2, stats2) in stats_map {
                if assigned.contains(addr2) || addr1 == addr2 {
                    continue;
                }

                if self.similarity(stats1, stats2) >= self.similarity_threshold {
                    cluster.push(addr2.clone());
                    assigned.insert(addr2.clone());
                }
            }

            if !cluster.is_empty() {
                clusters.push(cluster);
            }
        }

        clusters
    }

    fn similarity(&self, stats1: &WalletStats, stats2: &WalletStats) -> f64 {
        let volume_sim = 1.0 - ((stats1.total_volume_sol - stats2.total_volume_sol).abs() 
            / (stats1.total_volume_sol + stats2.total_volume_sol + 1.0));
        
        let size_sim = 1.0 - ((stats1.average_entry_size - stats2.average_entry_size).abs() 
            / (stats1.average_entry_size + stats2.average_entry_size + 1.0));
        
        let ratio_sim = 1.0 - ((stats1.winrate_proxy - stats2.winrate_proxy).abs());
        
        (volume_sim + size_sim + ratio_sim) / 3.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamic_scorer() {
        let scorer = DynamicScorer::default();
        let stats = WalletStats {
            address: "test".to_string(),
            total_volume_sol: 50.0,
            interaction_count: 5,
            average_entry_size: 10.0,
            early_entry_count: 3,
            winrate_proxy: 0.7,
        };

        let score = scorer.calculate_score(&stats);
        assert!(score <= 100);
    }

    #[test]
    fn test_pattern_detector() {
        let detector = PatternDetector {
            min_early_entries: 2,
            min_avg_buy_size: 5.0,
            consistency_threshold: 0.8,
        };

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
                sol_amount: 12.0,
                is_early_entry: true,
            },
        ];

        assert!(detector.detect_pattern(&interactions));
    }
}

