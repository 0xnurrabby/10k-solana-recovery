# 10k.world Solana Wallet Recovery Tool

A client-side recovery tool to export the embedded Solana wallet private keys created on 10k.world.

## Why this exists

When 10k.world was active, users connected their external Phantom wallet to create an account. In the background, 10k.world used Privy to generate an embedded Solana wallet to handle user balances and transactions.

Because 10k.world is offline, users can no longer log into the original website to export or view their embedded wallet private keys.

This tool solves that problem:
1. Connect the same Phantom wallet you used on 10k.world.
2. Sign an off-chain message (zero gas, no transaction fees).
3. Privy authenticates your identity and unlocks your embedded Solana wallet.
4. Export the 64-byte base58 private key and import it into Phantom, Backpack, or Solflare.

## Security

- All key decryption happens directly in your browser through Privy's client SDK.
- Zero gas fees and zero on-chain transactions.
- Private keys are never sent to or stored on any server.

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- Lucide Icons
- @privy-io/react-auth (Solana)

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Running locally for Phantom signature

Phantom extension enforces origin verification for sign-in messages. Because the Privy app configuration expects `10k.world`:

1. Run `setup_hosts.bat` as administrator to map `127.0.0.1 10k.world` in your Windows hosts file.
2. Open `https://10k.world/` in your browser.
3. Accept the self-signed SSL warning (Advanced > Proceed).
4. Connect Phantom and click "Export Private Key".

## License

MIT
