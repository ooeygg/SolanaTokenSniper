export const config = {
  pump_fun_strategy: {
    enabled: true,
    minimum_sol_balance: 0.1,
    rsi: {
      period: 14,
      oversold: 30,
      overbought: 70
    },
    macd: {
      fast_period: 12,
      slow_period: 26,
      signal_period: 9,
      buy_threshold: 0.02,
      sell_threshold: -0.02
    },
    moving_average: {
      short_period: 10,
      long_period: 21
    },
    volume_profile: {
      buy_pressure_threshold: 0.6,
      sell_pressure_threshold: 0.4
    },
    market_depth: {
      min_bid_ask_ratio: 1.2
    },
    profit_target_percentage: 5,
    stop_loss_percentage: 2,
    max_concurrent_trades: 3,
    price_check_interval: 5000
  },
  hft_strategy: {
    enabled: false,
    minimum_sol_balance: 0.1,
    rsi: {
      period: 14,
      oversold: 30,
      overbought: 70
    },
    macd: {
      fast_period: 12,
      slow_period: 26,
      signal_period: 9,
      buy_threshold: 0.02,
      sell_threshold: -0.02
    },
    moving_average: {
      short_period: 10,
      long_period: 21
    },
    volume_profile: {
      buy_pressure_threshold: 0.6,
      sell_pressure_threshold: 0.4
    },
    profit_target_percentage: 5,
    stop_loss_percentage: 2,
    max_concurrent_trades: 3,
    price_check_interval: 5000 // ms
  },
  liquidity_pool: {
    radiyum_program_id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
  },
  tx: {
    fetch_tx_max_retries: 10,
    fetch_tx_initial_delay: 3000, // Initial delay before fetching LP creation transaction details (3 seconds)
    swap_tx_initial_delay: 1000, // Initial delay before first buy (1 second)
    get_timeout: 10000, // Timeout for API requests
    concurrent_transactions: 1, // Number of simultaneous transactions
    retry_delay: 500, // Delay between retries (0.5 seconds)
  },
  swap: {
    verbose_log: false,
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "veryHigh", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    amount: "10000000", //0.01 SOL
    slippageBps: "200", // 2%
    db_name_tracker_holdings: "src/tracker/holdings.db", // Sqlite Database location
    token_not_tradable_400_error_retries: 5, // How many times should the bot try to get a quote if the token is not tradable yet
    token_not_tradable_400_error_delay: 2000, // How many seconds should the bot wait before retrying to get a quote again
  },
  sell: {
    price_source: "dex", // dex=Dexscreener,jup=Jupiter Agregator (Dex is most accurate and Jupiter is always used as fallback)
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "veryHigh", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    slippageBps: "200", // 2%
    auto_sell: true, // If set to true, stop loss and take profit triggers automatically when set.
    stop_loss_percent: 15,
    take_profit_percent: 50,
    track_public_wallet: "", // If set an additional log line will be shown with a link to track your wallet
  },
  rug_check: {
    verbose_log: false,
    simulation_mode: true,
    // Dangerous
    allow_mint_authority: false, // The mint authority is the address that has permission to mint (create) new tokens. Strongly Advised to set to false.
    allow_not_initialized: false, // This indicates whether the token account is properly set up on the blockchain. Strongly Advised to set to false
    allow_freeze_authority: false, // The freeze authority is the address that can freeze token transfers, effectively locking up funds. Strongly Advised to set to false
    allow_rugged: false,
    // Critical
    allow_mutable: false,
    block_returning_token_names: true,
    block_returning_token_creators: true,
    block_symbols: ["XXX"],
    block_names: ["XXX"],
    allow_insider_topholders: false, // Allow inseder accounts to be part of the topholders
    max_alowed_pct_topholders: 1, // Max allowed percentage an individual topholder might hold
    exclude_lp_from_topholders: false, // If true, Liquidity Pools will not be seen as top holders
    // Warning
    min_total_markets: 999,
    min_total_lp_providers: 999,
    min_total_market_Liquidity: 1000000,
    // Misc
    ignore_pump_fun: true,
    max_score: 1, // Set to 0 to ignore
    legacy_not_allowed: [
      "Low Liquidity",
      "Single holder ownership",
      "High holder concentration",
      "Freeze Authority still enabled",
      "Large Amount of LP Unlocked",
      "Copycat token",
      "Low amount of LP Providers",
    ],
  },
};
