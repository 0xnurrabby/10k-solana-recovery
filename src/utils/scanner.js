import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { derivePath } from 'ed25519-hd-key';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const bip39WordSet = new Set(wordlist);

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

export function decodeBase58(string) {
  if (!string || string.length === 0) return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < string.length; i++) {
    const c = string[i];
    const value = ALPHABET.indexOf(c);
    if (value === -1) throw new Error(`Invalid Base58 char: ${c}`);
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += value;
    let carry = 0;
    for (let k = 0; k < bytes.length; k++) {
      bytes[k] += carry;
      carry = bytes[k] >> 8;
      bytes[k] &= 0xff;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; string[i] === '1' && i < string.length - 1; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
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

export function parseRecoveryInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return { phrases: [], privateKeys: [] };

  const phrases = [];
  const privateKeys = [];
  const seenPrivateKeys = new Set();
  const seenPhrases = new Set();

  // 1. JSON array private keys (e.g. [123, 45, 67...])
  const jsonMatches = rawInput.match(/\[\s*(?:\d+\s*,\s*){31,63}\d+\s*\]/g);
  if (jsonMatches) {
    for (const match of jsonMatches) {
      try {
        const arr = JSON.parse(match);
        if (arr.length === 64 || arr.length === 32) {
          const bytes = new Uint8Array(arr);
          let keypair;
          try {
            keypair = arr.length === 64 ? Keypair.fromSecretKey(bytes) : Keypair.fromSeed(bytes);
          } catch {
            keypair = Keypair.fromSeed(bytes.slice(0, 32));
          }
          const pk = keypair.publicKey.toBase58();
          if (!seenPrivateKeys.has(pk)) {
            seenPrivateKeys.add(pk);
            privateKeys.push({
              keypair,
              secretKeyBytes: bytes,
              secretKeyBase58: encodeBase58(keypair.secretKey),
              phantomAddress: pk,
              rawInput: match,
            });
          }
        }
      } catch (e) {}
    }
  }

  // 2. Base58 private keys (Solana secret keys are ~87-88 chars in base58)
  const base58Candidates = rawInput.match(/[1-9A-HJ-NP-Za-km-z]{40,90}/g) || [];
  for (const candidate of base58Candidates) {
    try {
      const bytes = decodeBase58(candidate);
      let keypair = null;
      if (bytes.length === 64) {
        try {
          keypair = Keypair.fromSecretKey(bytes);
        } catch {
          keypair = Keypair.fromSeed(bytes.slice(0, 32));
        }
      } else if (bytes.length === 32) {
        keypair = Keypair.fromSeed(bytes);
      }
      if (keypair) {
        const pk = keypair.publicKey.toBase58();
        if (!seenPrivateKeys.has(pk)) {
          seenPrivateKeys.add(pk);
          privateKeys.push({
            keypair,
            secretKeyBytes: bytes,
            secretKeyBase58: candidate,
            phantomAddress: pk,
            rawInput: candidate,
          });
        }
      }
    } catch (e) {}
  }

  // 3. Check for wrapped base58 lines (e.g. copied from notes or terminal with soft line breaks)
  const lines = rawInput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentBuffer = '';
  for (const line of lines) {
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(line)) {
      currentBuffer = '';
      continue;
    }
    currentBuffer += line;
    if (currentBuffer.length >= 85 && currentBuffer.length <= 90) {
      try {
        const bytes = decodeBase58(currentBuffer);
        let keypair = null;
        if (bytes.length === 64) {
          try {
            keypair = Keypair.fromSecretKey(bytes);
          } catch {
            keypair = Keypair.fromSeed(bytes.slice(0, 32));
          }
        }
        if (keypair) {
          const pk = keypair.publicKey.toBase58();
          if (!seenPrivateKeys.has(pk)) {
            seenPrivateKeys.add(pk);
            privateKeys.push({
              keypair,
              secretKeyBytes: bytes,
              secretKeyBase58: currentBuffer,
              phantomAddress: pk,
              rawInput: currentBuffer,
            });
          }
          currentBuffer = '';
        }
      } catch (e) {}
    } else if (currentBuffer.length > 90) {
      currentBuffer = '';
    }
  }

  // 4. Mnemonic seed phrases (BIP39 12/24 words)
  // Check numbered sections (e.g. "1.\n words...", "2.\n words...")
  const numberedSections = rawInput.split(/(?:^|\n)\s*(?:\d+[\.\)\:\-]|#\d+[\:\-]?|Phrase\s*\d+[\:\-]|\bAccount\s*\d+[\:\-])\s*/i);

  for (const section of numberedSections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    const tokens = trimmed.toLowerCase().match(/[a-z]+/g) || [];
    const bipWords = tokens.filter((t) => bip39WordSet.has(t));
    if (bipWords.length >= 12) {
      let i = 0;
      while (i + 12 <= bipWords.length) {
        if (i + 24 <= bipWords.length) {
          const phrase24 = bipWords.slice(i, i + 24).join(' ');
          if (bip39.validateMnemonic(phrase24, wordlist)) {
            if (!seenPhrases.has(phrase24)) {
              seenPhrases.add(phrase24);
              phrases.push(phrase24);
            }
            i += 24;
            continue;
          }
        }
        const phrase12 = bipWords.slice(i, i + 12).join(' ');
        if (!seenPhrases.has(phrase12)) {
          seenPhrases.add(phrase12);
          phrases.push(phrase12);
        }
        i += 12;
      }
    }
  }

  // Fallback: tokenize entire input for BIP39 words if numbered split found nothing
  if (phrases.length === 0) {
    const allTokens = rawInput.toLowerCase().match(/[a-z]+/g) || [];
    const bipWords = allTokens.filter((t) => bip39WordSet.has(t));
    let i = 0;
    while (i + 12 <= bipWords.length) {
      if (i + 24 <= bipWords.length) {
        const phrase24 = bipWords.slice(i, i + 24).join(' ');
        if (bip39.validateMnemonic(phrase24, wordlist)) {
          if (!seenPhrases.has(phrase24)) {
            seenPhrases.add(phrase24);
            phrases.push(phrase24);
          }
          i += 24;
          continue;
        }
      }
      const phrase12 = bipWords.slice(i, i + 12).join(' ');
      if (!seenPhrases.has(phrase12)) {
        seenPhrases.add(phrase12);
        phrases.push(phrase12);
      }
      i += 12;
    }
  }

  return { phrases, privateKeys };
}

export function parsePhrases(rawInput) {
  const { phrases } = parseRecoveryInput(rawInput);
  return phrases;
}

export async function scanSubWallets({
  mnemonic,
  onProgress,
  rpcUrl = typeof window !== 'undefined' ? `${window.location.origin}/solana-rpc` : 'https://api.mainnet-beta.solana.com',
  gapLimit = 10,
  cancelSignal = null,
  concurrency = 50,
}) {
  const parsed = typeof mnemonic === 'object' && mnemonic !== null && (mnemonic.phrases !== undefined || mnemonic.privateKeys !== undefined)
    ? mnemonic
    : parseRecoveryInput(mnemonic);

  const phrases = parsed.phrases || [];
  const privateKeys = parsed.privateKeys || [];

  if (phrases.length === 0 && privateKeys.length === 0) return [];

  const connection = new Connection(rpcUrl, 'confirmed');
  const allActiveWallets = [];

  // 1. Process directly provided Private Keys (Pic 2 format) in 50x parallel!
  if (privateKeys.length > 0) {
    const concurrencyLimit = Math.min(concurrency, privateKeys.length);
    let nextIndex = 0;

    async function processKeyWorker() {
      while (nextIndex < privateKeys.length) {
        if (cancelSignal && cancelSignal.isCancelled) break;
        const kIdx = nextIndex++;
        const item = privateKeys[kIdx];
        const label = privateKeys.length > 1 ? `Key ${kIdx + 1}` : 'Private Key 1';

        if (onProgress) {
          onProgress({
            status: 'scanning_key',
            keyIndex: kIdx + 1,
            totalKeys: privateKeys.length,
            phantomAddress: item.phantomAddress,
            totalFound: allActiveWallets.length,
            label,
          });
        }

        let signatures = [];
        try {
          signatures = await Promise.race([
            connection.getSignaturesForAddress(item.keypair.publicKey, { limit: 10 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
          ]);
        } catch {}

        const txDates = (signatures || [])
          .filter((s) => s.blockTime)
          .map((s) => new Date(s.blockTime * 1000).toISOString().split('T')[0]);

        const hasJun2025Tx = (signatures || []).some((sig) => {
          if (!sig.blockTime) return false;
          const d = new Date(sig.blockTime * 1000);
          return d.getUTCFullYear() === 2025 && (d.getUTCMonth() === 4 || d.getUTCMonth() === 5);
        });

        // Authenticate with Privy via SIWS
        const privyResult = await authenticateSubAccountWithPrivy(item.keypair, item.phantomAddress);

        const walletInfo = {
          type: 'private_key',
          keyIndex: kIdx + 1,
          accountIndex: kIdx + 1,
          label,
          derivationPath: 'Direct Private Key',
          phantomAddress: item.phantomAddress,
          secretKeyBase58: item.secretKeyBase58,
          keypair: item.keypair,
          txCount: signatures ? signatures.length : 0,
          txDates,
          hasJun2025Tx,
          embeddedWalletAddress: privyResult.embeddedWalletAddress || null,
          privyMessage: privyResult.message || null,
          privySignature: privyResult.signature || null,
          privyUserId: privyResult.user?.id || null,
        };

        allActiveWallets.push(walletInfo);

        if (onProgress) {
          onProgress({
            status: 'found',
            wallet: walletInfo,
            totalFound: allActiveWallets.length,
            label,
          });
        }
      }
    }

    const workers = Array.from({ length: concurrencyLimit }, () => processKeyWorker());
    await Promise.all(workers);

    allActiveWallets.sort((a, b) => (a.keyIndex || 0) - (b.keyIndex || 0));
  }

  // 2. Process Seed Phrases (Pic 1 format) in parallel batches!
  for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
    if (cancelSignal && cancelSignal.isCancelled) break;

    const currentPhrase = phrases[pIdx];
    const seed = Buffer.from(bip39.mnemonicToSeedSync(currentPhrase));
    let consecutiveEmpty = 0;
    let accountIndex = 0;
    const batchSize = Math.min(concurrency, 20);

    while (consecutiveEmpty < gapLimit) {
      if (cancelSignal && cancelSignal.isCancelled) break;

      const batchIndices = [];
      for (let b = 0; b < batchSize && (consecutiveEmpty + b) < gapLimit; b++) {
        batchIndices.push(accountIndex + b);
      }

      const batchResults = await Promise.all(
        batchIndices.map(async (accIdx) => {
          const derived = deriveAccountFromSeed(seed, accIdx);
          const { phantomAddress, keypair, path } = derived;
          const label = phrases.length > 1
            ? `Phrase ${pIdx + 1} - Account ${accIdx + 1}`
            : `Account ${accIdx + 1}`;

          let signatures = [];
          try {
            signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 10 });
          } catch (e) {
            await new Promise((r) => setTimeout(r, 600));
            try {
              signatures = await connection.getSignaturesForAddress(keypair.publicKey, { limit: 10 });
            } catch {}
          }

          if (!signatures || signatures.length === 0) {
            return { isEmpty: true, accIdx, phantomAddress, label };
          }

          const txDates = signatures
            .filter((s) => s.blockTime)
            .map((s) => new Date(s.blockTime * 1000).toISOString().split('T')[0]);

          const hasJun2025Tx = signatures.some((sig) => {
            if (!sig.blockTime) return false;
            const d = new Date(sig.blockTime * 1000);
            return d.getUTCFullYear() === 2025 && (d.getUTCMonth() === 4 || d.getUTCMonth() === 5);
          });

          const privyResult = await authenticateSubAccountWithPrivy(keypair, phantomAddress);

          return {
            isEmpty: false,
            walletInfo: {
              type: 'derived_account',
              phraseIndex: pIdx + 1,
              accountIndex: accIdx + 1,
              label,
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
            },
          };
        })
      );

      for (const res of batchResults) {
        if (res.isEmpty) {
          consecutiveEmpty++;
          if (onProgress) {
            onProgress({
              status: 'empty',
              phraseIndex: pIdx + 1,
              totalPhrases: phrases.length,
              accountIndex: res.accIdx + 1,
              phantomAddress: res.phantomAddress,
              consecutiveEmpty,
              gapLimit,
              totalFound: allActiveWallets.length,
              label: res.label,
            });
          }
        } else {
          consecutiveEmpty = 0;
          allActiveWallets.push(res.walletInfo);
          if (onProgress) {
            onProgress({
              status: 'found',
              wallet: res.walletInfo,
              totalFound: allActiveWallets.length,
              consecutiveEmpty: 0,
              label: res.walletInfo.label,
            });
          }
        }
      }

      accountIndex += batchIndices.length;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return allActiveWallets;
}
