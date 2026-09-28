import * as bip39 from '@scure/bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(source) {
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

export function toBase64(bytes) {
  if (!bytes) return '';
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength || bytes.length || 0;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function deriveAccountFromSeed(seed, index) {
  const path = `m/44'/501'/${index}'/0'`;
  const derived = derivePath(path, seed.toString('hex'));
  const keypair = Keypair.fromSeed(derived.key);
  const phantomAddress = keypair.publicKey.toBase58();
  const secretKeyBase58 = encodeBase58(keypair.secretKey);
  return {
    accountIndex: index + 1,
    path,
    keypair,
    phantomAddress,
    secretKeyBase58,
  };
}

export async function authenticateSubAccountWithPrivy(keypair, phantomAddress) {
  try {
    const initRes = await fetch('/privy-auth/api/v1/siws/init', {
      method: 'POST',
      headers: {
        'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ address: phantomAddress }),
    });

    const initData = await initRes.json();
    const nonce = initData?.nonce;
    if (!nonce) {
      return { success: false, error: 'Failed to retrieve nonce' };
    }

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
    const signatureBase64 = toBase64(sig);

    const authRes = await fetch('/privy-auth/api/v1/siws/authenticate', {
      method: 'POST',
      headers: {
        'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message, signature: signatureBase64 }),
    });

    const authData = await authRes.json();
    const user = authData.user;
    const token = authData.token || authData.privy_access_token;

    const embedded = user?.linked_accounts?.find(
      (acc) =>
        acc.type === 'wallet' &&
        acc.chain_type === 'solana' &&
        (acc.wallet_client_type === 'privy' || acc.connector_type === 'embedded')
    );

    return {
      success: true,
      message,
      signature: signatureBase64,
      user,
      token,
      embeddedWalletAddress: embedded?.address || null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function scanSubWallets({
  mnemonic,
  onProgress,
  rpcUrl = typeof window !== 'undefined' ? `${window.location.origin}/solana-rpc` : 'https://api.mainnet-beta.solana.com',
  gapLimit = 10,
  cancelSignal = null,
}) {
  const cleanMnemonic = mnemonic.trim();
  const seed = Buffer.from(bip39.mnemonicToSeedSync(cleanMnemonic));
  const connection = new Connection(rpcUrl, 'confirmed');

  const activeWallets = [];
  let consecutiveEmpty = 0;
  let accountIndex = 0;

  while (consecutiveEmpty < gapLimit) {
    if (cancelSignal && cancelSignal.isCancelled) {
      break;
    }

    const derived = deriveAccountFromSeed(seed, accountIndex);
    const { phantomAddress, keypair, path } = derived;

    if (onProgress) {
      onProgress({
        status: 'scanning',
        accountIndex: accountIndex + 1,
        phantomAddress,
        consecutiveEmpty,
        gapLimit,
        totalFound: activeWallets.length,
      });
    }

    let signatures = [];
    let fetchSuccess = false;
    let attempts = 0;

    while (!fetchSuccess && attempts < 3) {
      try {
        attempts++;
        signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 10 });
        fetchSuccess = true;
      } catch (err) {
        console.warn(`RPC attempt ${attempts} failed for Account ${accountIndex + 1}:`, err.message);
        if (attempts < 3) {
          if (onProgress) {
            onProgress({
              status: 'retrying',
              accountIndex: accountIndex + 1,
              attempt: attempts,
            });
          }
          await new Promise((r) => setTimeout(r, 1200 * attempts));
        }
      }
    }

    // If all attempts failed due to network/RPC error, retry once after a longer delay rather than counting as empty
    if (!fetchSuccess) {
      console.warn(`RPC error for Account ${accountIndex + 1}. Retrying once after delay...`);
      await new Promise((r) => setTimeout(r, 2000));
      try {
        signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 10 });
        fetchSuccess = true;
      } catch (e) {
        // Still failed: skip without incrementing consecutiveEmpty to avoid false stops
        accountIndex++;
        continue;
      }
    }

    if (signatures.length === 0) {
      consecutiveEmpty++;
      if (onProgress) {
        onProgress({
          status: 'empty',
          accountIndex: accountIndex + 1,
          phantomAddress,
          consecutiveEmpty,
          gapLimit,
          totalFound: activeWallets.length,
        });
      }
      accountIndex++;
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    // Found active account: reset consecutive empty counter
    consecutiveEmpty = 0;

    const txDates = signatures
      .filter((s) => s.blockTime)
      .map((s) => new Date(s.blockTime * 1000).toISOString().split('T')[0]);

    const hasJun2025Tx = signatures.some((sig) => {
      if (!sig.blockTime) return false;
      const d = new Date(sig.blockTime * 1000);
      return d.getUTCFullYear() === 2025 && (d.getUTCMonth() === 4 || d.getUTCMonth() === 5); // May or June 2025
    });

    if (onProgress) {
      onProgress({
        status: 'authenticating',
        accountIndex: accountIndex + 1,
        phantomAddress,
        txCount: signatures.length,
        hasJun2025Tx,
      });
    }

    // Authenticate with Privy automatically
    const privyResult = await authenticateSubAccountWithPrivy(keypair, phantomAddress);

    const walletInfo = {
      accountIndex: accountIndex + 1,
      derivationPath: path,
      phantomAddress,
      secretKeyBase58: derived.secretKeyBase58,
      keypair,
      txCount: signatures.length,
      txDates,
      hasJun2025Tx,
      embeddedWalletAddress: privyResult.embeddedWalletAddress || null,
      privyMessage: privyResult.message || null,
      privySignature: privyResult.signature || null,
      privyUserId: privyResult.user?.id || null,
    };

    activeWallets.push(walletInfo);

    if (onProgress) {
      onProgress({
        status: 'found',
        wallet: walletInfo,
        totalFound: activeWallets.length,
        consecutiveEmpty: 0,
      });
    }

    accountIndex++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return activeWallets;
}
