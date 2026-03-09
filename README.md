# Raydium Volume Bot – CPMM Auto Volume for Solana

A **Raydium volume bot** that generates natural-looking trading volume on **Raydium CPMM** (Constant Product Market Maker) pools on Solana. Use it to run automated buy/sell cycles with configurable amounts, wallet counts, and delays. Supports both interactive CLI and config-file mode.

---

## Table of Contents

- [What is the Raydium Volume Bot?](#what-is-the-raydium-volume-bot)
- [Features](#features)
- [Project Architecture](#project-architecture)
- [Prerequisites](#prerequisites)
- [How to Run This Project](#how-to-run-this-project)
- [Configuration](#configuration)
- [Usage](#usage)
- [Author & Contact](#author--contact)
- [Disclaimer](#disclaimer)

---

## What is the Raydium Volume Bot?

This **Raydium volume bot** interacts with **Raydium CPMM** pools on Solana. It:

- Creates ephemeral wallets and funds them with SOL from your main wallet.
- Executes **buys** (SOL/WSOL → token) on a given Raydium CPMM pool to generate volume.
- Optionally **sells** tokens from older wallets and **retrieves SOL** back to your main wallet.
- Runs in configurable **cycles** with random min/max buy amounts, wallet counts per cycle, and delays between swaps.

Ideal for developers and traders who need a **Raydium CPMM volume bot** for testing, marketing, or volume generation on Raydium pools.

---

## Features

- **Raydium CPMM** pool support via `@raydium-io/raydium-sdk-v2`
- **SPL Token & Token-2022** (mint program detection)
- **Interactive CLI** (menu-driven) or **headless mode** with a JSON config file
- **Retrieve SOL**: close token accounts and drain SOL from all wallets for a pool
- **Address Lookup Tables** for smaller transactions
- Optional **Jito** integration (bundle sending) for advanced use
- Configurable: buy/sell ranges, wallets per cycle, delay between swaps, number of cycles

---

## Project Architecture

```
Raydium-CPMM-volume-bot/
├── main.ts                 # Entry point: CLI menu, -c config.json support
├── config.ts               # RPC, wallet (SECRET_KEY), API_KEY from .env
├── .env.example            # Template for RPC, SECRET_KEY, API_KEY, DEBUG
├── package.json            # Scripts: start (ts-node main.ts)
│
└── src/
    ├── bot.ts              # Core volume logic
    │   ├── extender()           # Main buy/sell cycle loop (interactive or config)
    │   ├── executeSwaps()       # Build & send: fund keypairs → create ATAs → wrap SOL → CPMM buy
    │   ├── sendTransactionsSequentially()  # Send versioned txns one by one
    │   └── sendBundle()         # Optional Jito bundle send
    │
    ├── retrieve.ts         # SOL retrieval & account closing
    │   ├── closeAcc()           # Retrieve SOL from ALL wallets for a pool (interactive)
    │   ├── closeSpecificAcc()   # Sell + close specific keypairs (used after buy cycle)
    │   ├── checkTokenAccountExists(), deleteKeypairFile()
    │   └── loadKeypairs()       # Load keypairs from src/keypairs/<poolId>/
    │
    ├── utils.ts            # Raydium CPMM swap instructions & helpers
    │   ├── getSwapInstruction()   # Build buy/sell IX for CPMM (swapBaseInput / swapBaseOutput)
    │   ├── buyExactInIx(), sellExactInIx()
    │   ├── getPoolInfo(), getSwapQuote()
    │   └── checkMintKey(), getRandomNumber(), isValidTwoNumberInput()
    │
    ├── keypairs/           # Generated ephemeral keypairs per pool (keypair-<pubkey>.json)
    │
    └── clients/
        ├── jito.ts             # Jito block engine / searcher client (optional)
        ├── LookupTableProvider.ts  # Address lookup table cache for smaller txns
        ├── config.ts          # Jito-related config
        ├── constants.ts       # Raydium/CPMM constants
        ├── instruction.ts    # Struct layouts for instructions
        ├── marshmallow/       # Buffer layout (u64, etc.)
        └── encrypt/           # Parse pool/global/platform config accounts
```

**Flow (high level):**

1. **main.ts** loads env, shows menu: (1) AUTO Random Buyers, (2) Retrieve SOL, or run with `-c config.json`.
2. **extender()** (in `bot.ts`): for each cycle, generates N keypairs, funds them, runs **executeSwaps()** (CPMM buys), then picks older keypairs and runs **closeSpecificAcc()** (sell + close + drain SOL).
3. **executeSwaps()**: one txn to fund all new keypairs with SOL for fees; then per keypair: create WSOL ATA, create token ATA, transfer SOL → sync native → **CPMM buy** via `getSwapInstruction()` in `utils.ts`.
4. **retrieve.ts**: `closeAcc()` for full retrieval by pool ID; `closeSpecificAcc()` sells token → closes token/WSOL accounts → transfers remaining SOL to main wallet.

---

## Prerequisites

- **Node.js** (v18+ recommended)
- **Yarn** or **npm**
- A **Solana wallet** with SOL for fees and volume (used as funder)
- A **Raydium CPMM pool ID** (e.g. from [Raydium](https://raydium.io))

---

## How to Run This Project

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Raydium-CPMM-volume-bot
yarn install
# or: npm install
```

### 2. Environment variables

Copy the example env and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
RPC=https://your-rpc-url.com
SECRET_KEY=your_base58_private_key
API_KEY=your_api_key
DEBUG=false
```

- **RPC**: Solana RPC endpoint (mainnet). A paid RPC is recommended for stability.
- **SECRET_KEY**: Base58-encoded private key of the wallet that funds the volume (funder).
- **API_KEY**: Used by the project (e.g. validation/API); set as required.
- **DEBUG**: Set to `true` to enable simulation logging and extra checks.

### 3. Start the bot

**Interactive mode (CLI menu):**

```bash
yarn start
# or: npm start
# or: npx ts-node main.ts
```

Then choose:

- **1** – AUTO Random Buyers (prompts for pool ID, min/max buy, min/max sell wallets, min/max wallets per cycle, delay, number of cycles).
- **2** – Retrieve SOL from all wallets for a given pool ID.

**Headless mode (config file):**

```bash
npx ts-node main.ts -c path/to/config.json
```

Example `config.json`:

```json
{
  "marketID": "YourRaydiumCPMMPoolId",
  "minAndMaxBuy": "0.001 0.003",
  "minAndMaxSell": "1 2",
  "minAndMaxwalletNumber": "1 3",
  "delay": "2 5",
  "cycles": "50"
}
```

- **marketID**: Raydium CPMM pool public key.
- **minAndMaxBuy**: Min and max SOL amount per buy (e.g. `"0.001 0.003"`).
- **minAndMaxSell**: Min and max number of wallets to sell/close per cycle (e.g. `"1 2"`).
- **minAndMaxwalletNumber**: Min and max new wallets per cycle (e.g. `"1 3"`).
- **delay**: Min and max delay in seconds between cycles (e.g. `"2 5"`).
- **cycles**: Number of buy/sell cycles to run (e.g. `"50"`).

---

## Configuration

| Variable    | Description                                      |
|------------|---------------------------------------------------|
| `RPC`      | Solana RPC URL (mainnet recommended)             |
| `SECRET_KEY` | Base58 private key of the funder wallet         |
| `API_KEY`  | API/validation key as used by the project       |
| `DEBUG`    | `true` / `false` – simulation and extra logging  |

Keypairs created by the bot are stored under `src/keypairs/<poolId>/`. Use **Retrieve SOL** (menu option 2) to sell tokens and pull SOL back from those wallets.

---

## Usage

- **First run**: Use option **1**, enter a valid **Raydium CPMM pool ID**, then follow the prompts for buy range, sell count, wallets per cycle, delay, and cycles.
- **Retrieve SOL**: Use option **2**, enter the same pool ID, set min/max delay between retrieves. The bot will sell tokens, close ATAs, and drain SOL to your main wallet.
- **Headless**: Use `-c config.json` for scripts or automation.

---

## Author & Contact

- **Author**: microRustyme  
- **Telegram**: [@microRustyme](https://t.me/microRustyme)  
- **Project**: Raydium CPMM volume bot – auto volume for Raydium pools on Solana.

---

## Disclaimer

This **Raydium volume bot** is for educational and development purposes. Generating volume may have legal and platform-policy implications. Use at your own risk. The author is not responsible for any misuse or loss of funds. Always comply with Raydium’s and Solana’s terms of service and applicable laws.

---

## Keywords (for search)

Raydium volume bot, Raydium CPMM volume bot, Solana volume bot, Raydium auto volume, CPMM pool volume, Raydium SDK volume.
