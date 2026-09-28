import readline from 'readline';
import * as bip39 from '@scure/bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import fs from 'fs';

const RPC_URL = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(source) {
  if (!source || source.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < source.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += source[i];
    let carry = 0;
    for (let k = 0; k < digits.length; k++) {
      digits[k] += carry;
      carry = (digits[k] / 58) | 0;
      digits[k] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; source[i] === 0 && i < source.length - 1; i++) {
    digits.push(0);
  }
  return digits.reverse().map((d) => ALPHABET[d]).join('');
}

async function main() {
  console.log('====================================================');
  console.log('  10k.world Phantom Sub-Account Auto-Recovery Tool   ');
  console.log('====================================================\n');

  let mnemonic = process.argv.slice(2).join(' ').trim();

  if (!mnemonic) {
    mnemonic = (await ask('Enter your 12-word Phantom recovery seed phrase: ')).trim();
  }

  const words = mnemonic.split(/\s+/);
  if (words.length < 12) {
    console.error('\n[ERROR] Seed phrase must be at least 12 words.');
    rl.close();
    process.exit(1);
  }

  console.log('\n[1/3] Generating master seed from mnemonic...');
  const seed = Buffer.from(bip39.mnemonicToSeedSync(mnemonic));

  console.log('[2/3] Starting Phantom sub-account derivation & on-chain scan...');
  console.log('      Rule: Scanning sub-accounts until 10 consecutive empty accounts are found.\n');

  const activeWallets = [];
  let consecutiveEmpty = 0;
  let accountIndex = 0;

  while (consecutiveEmpty < 10) {
    const path = `m/44'/501'/${accountIndex}'/0'`;
    const derived = derivePath(path, seed.toString('hex'));
    const keypair = Keypair.fromSeed(derived.key);
    const phantomAddress = keypair.publicKey.toBase58();

    process.stdout.write(`Checking Account ${accountIndex + 1} (${phantomAddress.slice(0, 4)}...${phantomAddress.slice(-4)})... `);

    let signatures = [];
    try {
      signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 10 });
    } catch (err) {
      // Brief delay on rate limit
      await new Promise((r) => setTimeout(r, 1200));
      try {
        signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 10 });
      } catch (e) {
        signatures = [];
      }
    }

    if (signatures.length === 0) {
      consecutiveEmpty++;
      console.log(`No txns (empty ${consecutiveEmpty}/10)`);
      accountIndex++;
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    // Found active account
    consecutiveEmpty = 0;
    const txDates = signatures.filter(s => s.blockTime).map(s => new Date(s.blockTime * 1000).toISOString().split('T')[0]);
    console.log(`[FOUND ${signatures.length} txns: ${txDates.slice(0, 3).join(', ')}]`);

    // Authenticate with Privy via SIWS using this sub-account's keypair
    process.stdout.write(`  └─ Authenticating with Privy... `);
    let embeddedAddress = 'Not found';
    let privyToken = null;

    try {
      const initRes = await fetch('https://auth.privy.io/api/v1/siws/init', {
        method: 'POST',
        headers: {
          'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
          'content-type': 'application/json',
          'origin': 'https://10k.world',
          'referer': 'https://10k.world/',
        },
        body: JSON.stringify({ address: phantomAddress }),
      });
      const { nonce } = await initRes.json();

      if (nonce) {
        const issuedAt = new Date().toISOString();
        const message = [
          `10k.world wants you to sign in with your Solana account:`,
          phantomAddress,
          '',
          `You are proving you own ${phantomAddress}.`,
          '',
          `URI: https://10k.world`,
          `Version: 1`,
          `Chain ID: mainnet`,
          `Nonce: ${nonce}`,
          `Issued At: ${issuedAt}`,
          `Resources:`,
          `- https://privy.io`,
        ].join('\n');

        const msgBytes = new TextEncoder().encode(message);
        const sig = nacl.sign.detached(msgBytes, keypair.secretKey);
        const signatureBase64 = Buffer.from(sig).toString('base64');

        const authRes = await fetch('https://auth.privy.io/api/v1/siws/authenticate', {
          method: 'POST',
          headers: {
            'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
            'content-type': 'application/json',
            'origin': 'https://10k.world',
            'referer': 'https://10k.world/',
          },
          body: JSON.stringify({ message, signature: signatureBase64 }),
        });

        const authData = await authRes.json();
        privyToken = authData.token || authData.privy_access_token;
        const embedded = authData.user?.linked_accounts?.find(
          (acc) =>
            acc.type === 'wallet' &&
            acc.chain_type === 'solana' &&
            (acc.wallet_client_type === 'privy' || acc.connector_type === 'embedded')
        );

        if (embedded?.address) {
          embeddedAddress = embedded.address;
          console.log(`Embedded 10K Wallet: ${embeddedAddress}`);
        } else {
          console.log(`No 10K embedded wallet linked to this account`);
        }
      }
    } catch (authErr) {
      console.log(`SIWS error: ${authErr.message}`);
    }

    activeWallets.push({
      account: `Account ${accountIndex + 1}`,
      path,
      phantomAddress,
      phantomPrivateKey: encodeBase58(keypair.secretKey),
      txCount: signatures.length,
      txDates,
      embedded10kWallet: embeddedAddress,
      privyToken,
    });

    accountIndex++;
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\n====================================================');
  console.log(`  Scan Complete! Stopped after 10 consecutive empty accounts.`);
  console.log(`  Total Active Sub-Accounts Found: ${activeWallets.length}`);
  console.log('====================================================\n');

  if (activeWallets.length > 0) {
    console.table(activeWallets.map(w => ({
      Account: w.account,
      'Phantom Address': w.phantomAddress,
      'Txns': w.txCount,
      'Embedded 10K Wallet': w.embedded10kWallet
    })));

    const outFile = 'recovered_subwallets.json';
    fs.writeFileSync(outFile, JSON.stringify(activeWallets, null, 2), 'utf8');
    console.log(`\n[SUCCESS] Full recovery report saved to: ${outFile}`);
  } else {
    console.log('No sub-accounts with transactions found.');
  }

  rl.close();
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  rl.close();
});
