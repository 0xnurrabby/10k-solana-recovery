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
  let attempts = 0;
  while (attempts < 3) {
    try {
      attempts++;
      const initRes = await fetch('/privy-auth/api/v1/siws/init', {
        method: 'POST',
        headers: {
          'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ address: phantomAddress }),
      });

      if (!initRes.ok) {
        console.warn(`[Privy SIWS Init Attempt ${attempts}] HTTP ${initRes.status} for ${phantomAddress}`);
        if (attempts < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempts));
          continue;
        }
        return { success: false, error: `Init HTTP ${initRes.status}` };
      }

      const initData = await initRes.json();
      const nonce = initData?.nonce;
      if (!nonce) {
        if (attempts < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempts));
          continue;
        }
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

      if (!authRes.ok) {
        console.warn(`[Privy SIWS Auth Attempt ${attempts}] HTTP ${authRes.status} for ${phantomAddress}`);
        if (attempts < 3) {
          await new Promise((r) => setTimeout(r, 1200 * attempts));
          continue;
        }
        return { success: false, error: `Auth HTTP ${authRes.status}` };
      }

      const authData = await authRes.json();
      const user = authData.user;
      const token = authData.token || authData.privy_access_token;
      const isNewUser = authData.is_new_user === true;

      // Find any embedded / privy-managed solana wallet in linked_accounts
      // Priority 1: explicitly marked as privy/embedded
      let embedded = user?.linked_accounts?.find(
        (acc) =>
          acc.type === 'wallet' &&
          acc.chain_type === 'solana' &&
          acc.address !== phantomAddress &&
          (acc.wallet_client_type === 'privy' || acc.connector_type === 'embedded' || acc.wallet_client === 'privy')
      );

      // Priority 2: any solana wallet linked to this account that is not the phantom wallet itself
      if (!embedded) {
        embedded = user?.linked_accounts?.find(
          (acc) =>
            acc.type === 'wallet' &&
            acc.chain_type === 'solana' &&
            acc.address !== phantomAddress
        );
      }

      console.log(`[Privy SIWS] ${phantomAddress}: is_new_user=${isNewUser}, linked_accounts=${user?.linked_accounts?.length || 0}, embedded=${embedded?.address || 'None'}`);

      return {
        success: true,
        message,
        signature: signatureBase64,
        user,
        token,
        isNewUser,
        embeddedWalletAddress: embedded?.address || null,
      };
    } catch (err) {
      console.warn(`[Privy SIWS Attempt ${attempts}] Error for ${phantomAddress}:`, err.message);
      if (attempts < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempts));
        continue;
      }
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'Max retry attempts exceeded' };
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
          const keypair = arr.length === 64 ? Keypair.fromSecretKey(bytes) : Keypair.fromSeed(bytes);
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
      if (bytes.length === 64) {
        const keypair = Keypair.fromSecretKey(bytes);
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
      } else if (bytes.length === 32) {
        const keypair = Keypair.fromSeed(bytes);
        const pk = keypair.publicKey.toBase58();
        if (!seenPrivateKeys.has(pk)) {
          seenPrivateKeys.add(pk);
          privateKeys.push({
            keypair,
            secretKeyBytes: bytes,
            secretKeyBase58: encodeBase58(keypair.secretKey),
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
        if (bytes.length === 64) {
          const keypair = Keypair.fromSecretKey(bytes);
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
}) {
  const parsed = typeof mnemonic === 'object' && mnemonic !== null && (mnemonic.phrases !== undefined || mnemonic.privateKeys !== undefined)
    ? mnemonic
    : parseRecoveryInput(mnemonic);

  const phrases = parsed.phrases || [];
  const privateKeys = parsed.privateKeys || [];

  if (phrases.length === 0 && privateKeys.length === 0) return [];

  const connection = new Connection(rpcUrl, 'confirmed');
  const allActiveWallets = [];

  // 1. Process directly provided Private Keys (from Pic 2 format) in parallel batches of 5
  const KEY_BATCH_SIZE = 5;
  for (let k = 0; k < privateKeys.length; k += KEY_BATCH_SIZE) {
    if (cancelSignal && cancelSignal.isCancelled) break;

    const currentKeyBatch = privateKeys.slice(k, k + KEY_BATCH_SIZE);

    if (onProgress) {
      onProgress({
        status: 'scanning_key',
        keyIndex: k + 1,
        totalKeys: privateKeys.length,
        totalFound: allActiveWallets.length,
        label: `Keys ${k + 1} - ${Math.min(k + KEY_BATCH_SIZE, privateKeys.length)}`,
      });
    }

    // Fetch on-chain signatures for the batch in parallel
    const signaturesBatch = await Promise.all(
      currentKeyBatch.map(async (item) => {
        let attempts = 0;
        while (attempts < 3) {
          try {
            attempts++;
            return await connection.getSignaturesForAddress(item.keypair.publicKey, { limit: 10 });
          } catch (err) {
            if (attempts < 3) {
              await new Promise((r) => setTimeout(r, 600 * attempts));
            }
          }
        }
        return [];
      })
    );

    // Process each key: authenticate all keys in batch in parallel
    const activeKeyItems = [];
    for (let b = 0; b < currentKeyBatch.length; b++) {
      if (cancelSignal && cancelSignal.isCancelled) break;
      const item = currentKeyBatch[b];
      const kIdx = k + b;
      const label = privateKeys.length > 1 ? `Key ${kIdx + 1}` : 'Private Key 1';
      const signatures = signaturesBatch[b] || [];

      const txDates = signatures
        .filter((s) => s.blockTime)
        .map((s) => new Date(s.blockTime * 1000).toISOString().split('T')[0]);

      const hasJun2025Tx = signatures.some((sig) => {
        if (!sig.blockTime) return false;
        const d = new Date(sig.blockTime * 1000);
        return d.getUTCFullYear() === 2025 && (d.getUTCMonth() === 4 || d.getUTCMonth() === 5);
      });

      activeKeyItems.push({ item, kIdx, label, signatures, txDates, hasJun2025Tx });
    }

    if (onProgress && activeKeyItems.length > 0) {
      onProgress({
        status: 'authenticating',
        keyIndex: activeKeyItems[0].kIdx + 1,
        phantomAddress: activeKeyItems[0].item.phantomAddress,
        label: `Authenticating ${activeKeyItems.length} key(s) with Privy`,
      });
    }

    const keyPrivyResults = await Promise.all(
      activeKeyItems.map((a) => authenticateSubAccountWithPrivy(a.item.keypair, a.item.phantomAddress))
    );

    for (let aIdx = 0; aIdx < activeKeyItems.length; aIdx++) {
      if (cancelSignal && cancelSignal.isCancelled) break;
      const a = activeKeyItems[aIdx];
      const privyResult = keyPrivyResults[aIdx];

      const walletInfo = {
        type: 'private_key',
        keyIndex: a.kIdx + 1,
        accountIndex: a.kIdx + 1,
        label: a.label,
        derivationPath: 'Direct Private Key',
        phantomAddress: a.item.phantomAddress,
        secretKeyBase58: a.item.secretKeyBase58,
        keypair: a.item.keypair,
        txCount: a.signatures.length,
        txDates: a.txDates,
        hasJun2025Tx: a.hasJun2025Tx,
        embeddedWalletAddress: privyResult.embeddedWalletAddress || null,
        isNewUser: privyResult.isNewUser || false,
        privyError: privyResult.error || null,
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
          label: a.label,
        });
      }
    }
  }

  // 2. Process Seed Phrases in parallel batches of 5 (5x faster)
  const DERIVE_BATCH_SIZE = 5;
  for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
    if (cancelSignal && cancelSignal.isCancelled) break;

    const currentPhrase = phrases[pIdx];
    const seed = Buffer.from(bip39.mnemonicToSeedSync(currentPhrase));
    let consecutiveEmpty = 0;
    let accountIndex = 0;

    while (consecutiveEmpty < gapLimit) {
      if (cancelSignal && cancelSignal.isCancelled) break;

      // 1. Derive batch of 5 accounts
      const batch = [];
      for (let b = 0; b < DERIVE_BATCH_SIZE; b++) {
        const derived = deriveAccountFromSeed(seed, accountIndex + b);
        const label = phrases.length > 1
          ? `Phrase ${pIdx + 1} - Account ${accountIndex + b + 1}`
          : `Account ${accountIndex + b + 1}`;
        batch.push({ ...derived, label });
      }

      if (onProgress) {
        onProgress({
          status: 'scanning',
          phraseIndex: pIdx + 1,
          totalPhrases: phrases.length,
          accountIndex: accountIndex + 1,
          phantomAddress: batch[0].phantomAddress,
          consecutiveEmpty,
          gapLimit,
          totalFound: allActiveWallets.length,
          label: phrases.length > 1
            ? `Phrase ${pIdx + 1}: Accounts ${accountIndex + 1} - ${accountIndex + DERIVE_BATCH_SIZE}`
            : `Accounts ${accountIndex + 1} - ${accountIndex + DERIVE_BATCH_SIZE}`,
        });
      }

      // 2. Query Solana RPC for all 5 accounts in parallel
      const signaturesBatch = await Promise.all(
        batch.map(async (acc) => {
          let attempts = 0;
          while (attempts < 3) {
            try {
              attempts++;
              return await connection.getSignaturesForAddress(acc.keypair.publicKey, { limit: 10 });
            } catch (err) {
              if (attempts < 3) {
                await new Promise((r) => setTimeout(r, 600 * attempts));
              }
            }
          }
          return [];
        })
      );

      // 3. Process each account sequentially to preserve strict gapLimit counting
      let hitGapLimit = false;
      const activeInBatch = [];

      for (let b = 0; b < DERIVE_BATCH_SIZE; b++) {
        if (cancelSignal && cancelSignal.isCancelled) {
          hitGapLimit = true;
          break;
        }

        const item = batch[b];
        const signatures = signaturesBatch[b] || [];

        if (signatures.length === 0) {
          consecutiveEmpty++;
          if (onProgress) {
            onProgress({
              status: 'empty',
              phraseIndex: pIdx + 1,
              totalPhrases: phrases.length,
              accountIndex: item.accountIndex,
              phantomAddress: item.phantomAddress,
              consecutiveEmpty,
              gapLimit,
              totalFound: allActiveWallets.length,
              label: item.label,
            });
          }
          if (consecutiveEmpty >= gapLimit) {
            hitGapLimit = true;
            break;
          }
          continue;
        }

        // Active account found: reset consecutive empty counter
        consecutiveEmpty = 0;

        const txDates = signatures
          .filter((s) => s.blockTime)
          .map((s) => new Date(s.blockTime * 1000).toISOString().split('T')[0]);

        const hasJun2025Tx = signatures.some((sig) => {
          if (!sig.blockTime) return false;
          const d = new Date(sig.blockTime * 1000);
          return d.getUTCFullYear() === 2025 && (d.getUTCMonth() === 4 || d.getUTCMonth() === 5);
        });

        activeInBatch.push({ item, signatures, txDates, hasJun2025Tx });
      }

      // Parallel Privy authentication for all active accounts in this batch
      if (activeInBatch.length > 0 && !hitGapLimit) {
        if (onProgress) {
          onProgress({
            status: 'authenticating',
            phraseIndex: pIdx + 1,
            totalPhrases: phrases.length,
            accountIndex: activeInBatch[0].item.accountIndex,
            phantomAddress: activeInBatch[0].item.phantomAddress,
            label: `Authenticating ${activeInBatch.length} active account(s) with Privy`,
          });
        }

        const privyResults = await Promise.all(
          activeInBatch.map((a) => authenticateSubAccountWithPrivy(a.item.keypair, a.item.phantomAddress))
        );

        for (let aIdx = 0; aIdx < activeInBatch.length; aIdx++) {
          if (cancelSignal && cancelSignal.isCancelled) break;
          const a = activeInBatch[aIdx];
          const privyResult = privyResults[aIdx];

          const walletInfo = {
            type: 'derived_account',
            phraseIndex: pIdx + 1,
            accountIndex: a.item.accountIndex,
            label: a.item.label,
            derivationPath: a.item.path,
            phantomAddress: a.item.phantomAddress,
            secretKeyBase58: a.item.secretKeyBase58,
            keypair: a.item.keypair,
            txCount: a.signatures.length,
            txDates: a.txDates,
            hasJun2025Tx: a.hasJun2025Tx,
            embeddedWalletAddress: privyResult.embeddedWalletAddress || null,
            isNewUser: privyResult.isNewUser || false,
            privyError: privyResult.error || null,
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
              consecutiveEmpty: 0,
              label: a.item.label,
            });
          }
        }
      }

      if (hitGapLimit) {
        break;
      }

      accountIndex += DERIVE_BATCH_SIZE;
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  return allActiveWallets;
}
