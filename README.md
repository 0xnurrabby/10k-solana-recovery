# 10k.world Solana Wallet Recovery Tool

A local client-side recovery tool to export the embedded Solana wallet private keys created on 10k.world.

## Why this exists

When 10k.world was active, users connected their external Phantom wallet to create an account. In the background, 10k.world used Privy to generate an embedded Solana wallet to handle user balances and transactions.

Because 10k.world is offline, users can no longer log into the original website to export or view their embedded wallet private keys.

This tool solves that problem completely on your local machine:
- **Option 1: Single Phantom Connect**: Connect your Phantom wallet extension, sign the off-chain SIWS message (zero gas, no transaction fees), and export the 64-byte base58 private key.
- **Option 2: Auto Sub-Account Scanner (12 Words)**: If you created multiple sub-accounts under one master seed phrase (Account 1, Account 2, Account 3...), enter your 12-word phrase. The tool automatically derives every sub-account (`m/44'/501'/i'/0'`), scans the Solana blockchain for transaction history, stops after 10 consecutive empty accounts, and retrieves the linked 10K embedded wallet for each active account with 1-click export.
- **Option 3: Fast Terminal CLI**: Run `node scan_subwallets.mjs` directly in your terminal to scan and save all active sub-accounts and linked 10K addresses into a JSON report.

## Security

- Everything runs 100% locally on your own computer.
- Key decryption and derivation happen strictly in your browser or local Node process.
- Zero gas fees and zero on-chain transactions.
- Private keys and seed phrases are never sent to or stored on any server.

## Quick Setup (Localhost)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure local 10k.world domain

Phantom wallet extension enforces origin verification for sign-in messages. Because the Privy app configuration expects `10k.world`:

1. Right-click `setup_hosts.bat` and click **Run as administrator** (this maps `127.0.0.1 10k.world` in your Windows hosts file).
2. Start the local server:

```bash
npm run dev
```

3. Open `https://10k.world/` in your browser.
4. On first load, Chrome will show a self-signed certificate notice ("Your connection is not private"). Click **Advanced** and select **Proceed to 10k.world (unsafe)**.

### 3. Recover your keys

- Use **Phantom Single Connect** to connect your Phantom extension.
- Or switch to **Auto Sub-Wallet Scanner** to scan and recover all sub-accounts from your 12-word seed phrase in one go.

## CLI Recovery Script

If you prefer running a quick scan directly from your terminal:

```bash
node scan_subwallets.mjs
```

Enter your 12-word recovery phrase when prompted. The script scans Solana mainnet RPC, filters active accounts, authenticates with Privy, and saves a full report to `recovered_subwallets.json`.

## License

MIT
