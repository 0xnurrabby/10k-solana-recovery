import React, { useState, useRef, useEffect } from 'react';
import { usePrivy, useLoginWithSiws } from '@privy-io/react-auth';
import { useSolanaWallets, useExportWallet } from '@privy-io/react-auth/solana';
import nacl from 'tweetnacl';
import { 
  KeyRound, 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Lock, 
  ShieldCheck, 
  Wallet, 
  RefreshCw, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Download,
  FileText,
  Sparkles,
  Square,
  Terminal,
  Activity,
  Layers,
  Key,
  FolderCheck,
  CheckCircle2,
  X,
  Clock
} from 'lucide-react';
import { scanSubWallets, toBase64, parseRecoveryInput, authenticateSubAccountWithPrivy } from '../utils/scanner';

export function BatchRecovery({ onCopy, onError }) {
  const [mnemonic, setMnemonic] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);
  const [discoveredWallets, setDiscoveredWallets] = useState([]);
  const [exportingIndex, setExportingIndex] = useState(null);
  const [recheckingIndex, setRecheckingIndex] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [visiblePrivateKeys, setVisiblePrivateKeys] = useState({});
  const [showAllPrivateKeys, setShowAllPrivateKeys] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [exportCompleteModal, setExportCompleteModal] = useState(null);

  const cancelSignalRef = useRef({ isCancelled: false });
  const cancelBatchExportRef = useRef(false);
  const lastCapturedKeyRef = useRef(null);
  const exportingIndexRef = useRef(exportingIndex);
  exportingIndexRef.current = exportingIndex;
  const discoveredWalletsRef = useRef(discoveredWallets);
  discoveredWalletsRef.current = discoveredWallets;
  const captured10kKeysRef = useRef(new Map());
  const currentCaptureResolverRef = useRef(null);

  const { ready, authenticated, user, logout } = usePrivy();
  const { loginWithSiws } = useLoginWithSiws();
  const solanaWalletsHook = useSolanaWallets();
  const { exportWallet: exportWalletFromHook } = useExportWallet();

  const exportWalletRef = useRef(exportWalletFromHook);
  exportWalletRef.current = exportWalletFromHook;
  const solanaWalletsRef = useRef(solanaWalletsHook);
  solanaWalletsRef.current = solanaWalletsHook;

  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const userRef = useRef(user);
  userRef.current = user;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  const loginWithSiwsRef = useRef(loginWithSiws);
  loginWithSiwsRef.current = loginWithSiws;

  const detected = parseRecoveryInput(mnemonic);
  const detectedPhrases = detected.phrases;
  const detectedPrivateKeys = detected.privateKeys;
  const hasAnyInput = detectedPhrases.length > 0 || detectedPrivateKeys.length > 0;

  // Auto-capture clipboard when window regains focus after closing Privy export modal
  useEffect(() => {
    const handleWindowFocus = () => {
      if (exportingIndex !== null) {
        checkAndCaptureClipboard(exportingIndex);
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [exportingIndex]);

  const handleCopyText = async (text, id, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
      if (onCopy) onCopy(`${label} copied to clipboard`);
    } catch {
      if (onError) onError('Failed to copy to clipboard');
    }
  };

  const togglePrivateKeyVisibility = (index) => {
    setVisiblePrivateKeys((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleAllPrivateKeys = () => {
    const next = !showAllPrivateKeys;
    setShowAllPrivateKeys(next);
    const updated = {};
    discoveredWallets.forEach((_, idx) => {
      updated[idx] = next;
    });
    setVisiblePrivateKeys(updated);
  };

  const handleStopScan = () => {
    cancelSignalRef.current.isCancelled = true;
    if (onCopy) onCopy('Stopping scan after current account...');
  };

  const handleStartScan = async () => {
    const parsed = parseRecoveryInput(mnemonic);
    if (parsed.phrases.length === 0 && parsed.privateKeys.length === 0) {
      if (onError) onError('Please enter at least one valid recovery phrase or Base58 private key.');
      return;
    }

    cancelSignalRef.current = { isCancelled: false };
    setIsScanning(true);
    setDiscoveredWallets([]);
    setScanLogs([]);

    const initLabels = [];
    if (parsed.privateKeys.length > 0) initLabels.push(`${parsed.privateKeys.length} private key(s)`);
    if (parsed.phrases.length > 0) initLabels.push(`${parsed.phrases.length} phrase(s)`);

    setScanProgress({
      message: `Initializing scan across ${initLabels.join(' and ')}...`,
      accountIndex: 0,
      consecutiveEmpty: 0,
    });

    try {
      const results = await scanSubWallets({
        mnemonic: parsed,
        cancelSignal: cancelSignalRef.current,
        onProgress: (p) => {
          if (p.status === 'scanning_key') {
            setScanProgress({
              message: `Checking Key ${p.keyIndex}/${p.totalKeys} (${p.phantomAddress.slice(0, 4)}...${p.phantomAddress.slice(-4)})`,
              accountIndex: p.keyIndex,
              consecutiveEmpty: 0,
            });
          } else if (p.status === 'scanning') {
            const phrasePrefix = p.totalPhrases > 1 ? `[Phrase ${p.phraseIndex}/${p.totalPhrases}] ` : '';
            setScanProgress({
              message: `${phrasePrefix}Checking Account ${p.accountIndex} (${p.phantomAddress.slice(0, 4)}...${p.phantomAddress.slice(-4)})`,
              accountIndex: p.accountIndex,
              consecutiveEmpty: p.consecutiveEmpty,
            });
          } else if (p.status === 'empty') {
            const phrasePrefix = p.totalPhrases > 1 ? `[Phrase ${p.phraseIndex}/${p.totalPhrases}] ` : '';
            setScanProgress({
              message: `${phrasePrefix}Account ${p.accountIndex}: No transactions (Empty streak ${p.consecutiveEmpty}/10)`,
              accountIndex: p.accountIndex,
              consecutiveEmpty: p.consecutiveEmpty,
            });
            setScanLogs((prev) => [
              ...prev.slice(-24),
              {
                id: Math.random().toString(),
                type: 'empty',
                text: `${phrasePrefix}Account ${p.accountIndex} (${p.phantomAddress.slice(0, 4)}...${p.phantomAddress.slice(-4)}): 0 txns (empty streak ${p.consecutiveEmpty}/10)`,
              },
            ]);
          } else if (p.status === 'authenticating') {
            setScanProgress((prev) => ({
              ...prev,
              message: `${p.label}: Authenticating with 10k Privy...`,
            }));
          } else if (p.status === 'found') {
            setDiscoveredWallets((prev) => {
              const uniqueKey = p.wallet.secretKeyBase58 || `${p.wallet.phraseIndex}-${p.wallet.accountIndex}`;
              const exists = prev.some((w) => (w.secretKeyBase58 || `${w.phraseIndex}-${w.accountIndex}`) === uniqueKey);
              return exists ? prev : [...prev, p.wallet];
            });
            setScanLogs((prev) => [
              ...prev.slice(-24),
              {
                id: Math.random().toString(),
                type: 'found',
                text: `${p.wallet.label} (${p.wallet.phantomAddress.slice(0, 4)}...${p.wallet.phantomAddress.slice(-4)}): ${p.wallet.txCount} txns. Linked 10k: ${p.wallet.embeddedWalletAddress ? p.wallet.embeddedWalletAddress.slice(0, 4) + '...' + p.wallet.embeddedWalletAddress.slice(-4) : 'None'}`,
              },
            ]);
          } else if (p.status === 'retrying') {
            setScanLogs((prev) => [
              ...prev.slice(-24),
              {
                id: Math.random().toString(),
                type: 'retry',
                text: `${p.label}: Rate limit encountered, retrying attempt ${p.attempt}/3...`,
              },
            ]);
          }
        },
      });

      setDiscoveredWallets(results);
      if (results.length === 0) {
        if (onError) onError('No active wallets or linked 10k embedded accounts were found.');
      } else {
        if (onCopy) onCopy(`Scan complete! Recovered ${results.length} wallet(s).`);
      }
    } catch (err) {
      console.error('Scan error:', err);
      if (onError) onError(err.message || 'Error occurred during scan.');
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const closePrivyModalDialog = () => {
    try {
      // 1. Target Privy close modal button
      const closeBtn = document.querySelector(
        'button[aria-label="close modal"], button[data-component-id="sc-e033e17a-0"], button[aria-label*="close" i], button[aria-label*="dismiss" i], button[aria-label*="lose" i], [class*="CloseButton"], button[data-component-id="sc-9b65f2b6-1"]'
      );
      if (closeBtn) {
        closeBtn.click();
      }

      // 2. Dispatch escape key event
      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(escEvent);
      document.dispatchEvent(escEvent);
      document.body?.dispatchEvent(escEvent);

      // 3. Target backdrop
      const backdrop = document.querySelector(
        '#privy-backdrop, [data-privy-backdrop], div[data-component-id="sc-311ca443-2"]'
      );
      if (backdrop) {
        backdrop.click();
      }
      return true;
    } catch (e) {
      console.warn('Auto close dialog notice:', e);
    }
    return false;
  };

  const ensureModalClosed = async (maxWaitMs = 500) => {
    closePrivyModalDialog();
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const dialog = document.querySelector('div[role="dialog"], button[aria-label="close modal"]');
      if (!dialog) break;
      closePrivyModalDialog();
      await new Promise((r) => setTimeout(r, 40));
    }
  };

  const handleCapturedKeyDirectly = (key, forcedIndex = null) => {
    const targetIdx = forcedIndex !== null ? forcedIndex : exportingIndexRef.current;
    if (targetIdx === null || targetIdx === undefined) return false;

    const cleaned = key?.trim();
    if (!cleaned || cleaned.length < 40 || cleaned.length > 90 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(cleaned)) {
      return false;
    }

    if (lastCapturedKeyRef.current === cleaned && captured10kKeysRef.current.get(targetIdx) === cleaned) {
      return false;
    }

    lastCapturedKeyRef.current = cleaned;
    captured10kKeysRef.current.set(targetIdx, cleaned);

    setDiscoveredWallets((prev) => {
      const next = [...prev];
      if (next[targetIdx] && next[targetIdx].exported10kKey !== cleaned) {
        next[targetIdx] = { ...next[targetIdx], exported10kKey: cleaned };
      }
      return next;
    });

    if (currentCaptureResolverRef.current) {
      currentCaptureResolverRef.current(cleaned);
      currentCaptureResolverRef.current = null;
    }

    const accLabel = discoveredWalletsRef.current[targetIdx]?.label || `Account ${targetIdx + 1}`;
    if (onCopy) {
      onCopy(`Captured key for ${accLabel}! Next wallet loading...`);
    }

    // Instantly close modal upon copy
    closePrivyModalDialog();
    return true;
  };

  const checkAndCaptureClipboard = async (index) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        const cleaned = text?.trim();
        if (cleaned && cleaned.length >= 40 && cleaned.length <= 90 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleaned)) {
          return handleCapturedKeyDirectly(cleaned, index);
        }
      }
    } catch (e) {}
    return false;
  };

  // Intercept navigator.clipboard.writeText so that when Privy copies the key, it is captured at 0ms
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) return;

    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);

    navigator.clipboard.writeText = async (text) => {
      try {
        const cleaned = text?.trim();
        if (cleaned && cleaned.length >= 40 && cleaned.length <= 90 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleaned)) {
          handleCapturedKeyDirectly(cleaned);
        }
      } catch (err) {
        console.warn('Intercept writeText notice:', err);
      }
      return originalWriteText(text);
    };

    return () => {
      navigator.clipboard.writeText = originalWriteText;
    };
  }, []);

  // Global click listener for "Copy key" button to instantly trigger capture and close
  useEffect(() => {
    const handleGlobalClick = (e) => {
      const btn = e.target?.closest?.('button');
      if (!btn) return;
      const text = btn.innerText || btn.textContent || '';
      if (text.includes('Copy key') || text.includes('Copy private key')) {
        setTimeout(async () => {
          if (exportingIndexRef.current !== null) {
            await checkAndCaptureClipboard(exportingIndexRef.current);
            closePrivyModalDialog();
          }
        }, 40);
      }
    };

    document.addEventListener('click', handleGlobalClick, true);
    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
    };
  }, []);

  // Poll clipboard while modal is open as active fallback
  useEffect(() => {
    if (exportingIndex === null) return;
    const interval = setInterval(() => {
      checkAndCaptureClipboard(exportingIndex);
    }, 200);
    return () => clearInterval(interval);
  }, [exportingIndex]);

  // Seamless Linear Async Flow for Instant Privy Export
  const switchPrivyAccount = async (targetWallet) => {
    const targetAddr = targetWallet.phantomAddress?.toLowerCase();

    const isTargetAlreadyAuthenticated =
      authenticatedRef.current &&
      (userRef.current?.linkedAccounts?.some((acc) => acc.address?.toLowerCase() === targetAddr) ||
        userRef.current?.wallet?.address?.toLowerCase() === targetAddr);

    if (isTargetAlreadyAuthenticated) {
      return true;
    }

    if (authenticatedRef.current) {
      try {
        await logoutRef.current();
      } catch (e) {
        console.warn('Logout notice:', e);
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    try {
      localStorage.removeItem('privy:token');
      localStorage.removeItem('privy:refresh_token');
      localStorage.removeItem('privy:id_token');
      sessionStorage.removeItem('privy:token');
      sessionStorage.removeItem('privy:refresh_token');
      sessionStorage.removeItem('privy:id_token');
    } catch (e) {}

    const initRes = await fetch('/privy-auth/api/v1/siws/init', {
      method: 'POST',
      headers: {
        'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
        'content-type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({ address: targetWallet.phantomAddress }),
    });

    const initData = await initRes.json();
    const nonce = initData?.nonce;
    if (!nonce) throw new Error('Failed to retrieve authentication nonce from Privy');

    const issuedAt = new Date().toISOString();
    const message = [
      '10k.world wants you to sign in with your Solana account:',
      targetWallet.phantomAddress,
      '',
      `You are proving you own ${targetWallet.phantomAddress}.`,
      '',
      'URI: https://10k.world',
      'Version: 1',
      'Chain ID: mainnet',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      'Resources:',
      '- https://privy.io',
    ].join('\n');

    const msgBytes = new TextEncoder().encode(message);
    const sig = nacl.sign.detached(msgBytes, targetWallet.keypair.secretKey);
    const signatureBase64 = toBase64(sig);

    try {
      await loginWithSiwsRef.current({
        message,
        signature: signatureBase64,
      });
    } catch (siwsErr) {
      if (!siwsErr?.message?.includes('already authenticated')) {
        throw siwsErr;
      }
    }

    // Wait until authenticatedRef becomes true or max 2s
    const authStart = Date.now();
    while (Date.now() - authStart < 2000) {
      if (authenticatedRef.current) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    return true;
  };

  const waitForClipboardKey = async (walletIndex, timeoutMs = 180000) => {
    const startTime = Date.now();
    let modalSeen = false;

    while (Date.now() - startTime < timeoutMs) {
      if (cancelBatchExportRef.current) return false;

      if (captured10kKeysRef.current?.has(walletIndex)) {
        return true;
      }

      const captured = await checkAndCaptureClipboard(walletIndex);
      if (captured) {
        return true;
      }

      const hasModal = !!document.querySelector('div[role="dialog"], button[aria-label="close modal"]');
      if (hasModal) {
        modalSeen = true;
      } else if (modalSeen && Date.now() - startTime > 1200) {
        // Modal was manually closed by the user without copying
        return false;
      }

      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  const openExportModalForWallet = (wallet) => {
    const exportFn = exportWalletRef.current || exportWalletFromHook;
    const solanaHook = solanaWalletsRef.current || solanaWalletsHook;

    let p;
    if (typeof exportFn === 'function') {
      p = exportFn({ address: wallet.embeddedWalletAddress });
    } else if (typeof solanaHook?.exportWallet === 'function') {
      p = solanaHook.exportWallet({ address: wallet.embeddedWalletAddress });
    } else {
      throw new Error('Privy export wallet function is not available.');
    }

    // DO NOT await p: Privy export promise does not resolve when closed via close button
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
    return p;
  };

  const triggerAutoDownload10kKeys = () => {
    setDiscoveredWallets((latest) => {
      const captured = latest.map((w) => w.exported10kKey).filter(Boolean);
      if (captured.length > 0) {
        const txtContent = captured.join('\n') + '\n';
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '10k_embedded_private_keys.txt';
        a.click();
        URL.revokeObjectURL(url);
        if (onCopy) onCopy(`Export finished! Auto-downloaded ${captured.length} 10K keys (.txt)`);
        setExportCompleteModal({
          count: captured.length,
          fileName: '10k_embedded_private_keys.txt',
          keys: captured,
        });
      } else {
        if (onCopy) onCopy('Sequential export completed.');
      }
      return latest;
    });
  };

  const runBatchExportLoop = async (walletsToExport) => {
    cancelBatchExportRef.current = false;
    setIsBatchExporting(true);

    for (let i = 0; i < walletsToExport.length; i++) {
      if (cancelBatchExportRef.current) break;

      const { wallet, index } = walletsToExport[i];
      const accLabel = wallet.label || `Account ${wallet.accountIndex || index + 1}`;
      setExportingIndex(index);

      try {
        if (onCopy) onCopy(`Authenticating ${accLabel} with 10k Privy...`);
        await switchPrivyAccount(wallet);

        if (cancelBatchExportRef.current) break;

        // Reset resolver promise for this index
        let resolver;
        const keyCapturePromise = new Promise((resolve) => {
          resolver = resolve;
        });
        currentCaptureResolverRef.current = resolver;

        if (onCopy) onCopy(`Opening export modal for ${accLabel}... Please copy key.`);
        openExportModalForWallet(wallet);

        // Wait for key capture (either from writeText hook, click listener, or clipboard read)
        await Promise.race([
          keyCapturePromise,
          waitForClipboardKey(index, 180000),
        ]);

        if (cancelBatchExportRef.current) break;

        // Close modal immediately and ensure it is removed from DOM before opening next
        await ensureModalClosed(400);

        // Instant yield before opening next account modal
        await new Promise((r) => setTimeout(r, 80));
      } catch (err) {
        console.error(`Export error for ${accLabel}:`, err);
        if (onError) onError(err.message || `Export error for ${accLabel}`);
        await ensureModalClosed(300);
      }
    }

    setIsBatchExporting(false);
    setExportingIndex(null);
    closePrivyModalDialog();
    triggerAutoDownload10kKeys();
  };

  const handleExportWallet = (wallet, index) => {
    if (!wallet.embeddedWalletAddress) {
      if (onError) onError('No 10k embedded wallet found for this account.');
      return;
    }
    runBatchExportLoop([{ wallet, index }]);
  };

  const handleBatchExportAll = () => {
    const pending = discoveredWallets
      .map((w, idx) => ({ wallet: w, index: idx }))
      .filter(({ wallet }) => !!wallet.embeddedWalletAddress && !wallet.exported10kKey);

    if (pending.length === 0) {
      const hasCaptured = discoveredWallets.some((w) => !!w.exported10kKey);
      if (hasCaptured) {
        triggerAutoDownload10kKeys();
      } else {
        if (onCopy) onCopy('All 10K keys have already been captured!');
      }
      return;
    }

    runBatchExportLoop(pending);
  };

  const handleStopBatchExport = () => {
    cancelBatchExportRef.current = true;
    setIsBatchExporting(false);
    setExportingIndex(null);
    closePrivyModalDialog();
    if (onCopy) onCopy('Stopped auto export.');
  };

  const handlePasteKey = async (index) => {
    try {
      let text = '';
      if (navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {}
      }
      if (!text) {
        text = window.prompt('Paste the 10K private key:');
      }
      const cleaned = text?.trim();
      if (cleaned && cleaned.length >= 40 && cleaned.length <= 90) {
        setDiscoveredWallets((prev) => {
          const next = [...prev];
          if (next[index]) {
            next[index] = { ...next[index], exported10kKey: cleaned };
          }
          return next;
        });
        if (onCopy) onCopy(`10K Private Key saved for Account ${index + 1}!`);
      } else if (cleaned) {
        if (onError) onError('Invalid Solana private key length (expected 40-90 characters base58)');
      }
    } catch (e) {
      console.warn('Paste key error:', e);
    }
  };

  const handleClearKey = (index) => {
    setDiscoveredWallets((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], exported10kKey: null };
      }
      return next;
    });
    if (onCopy) onCopy(`10K key cleared for Account ${index + 1}`);
  };

  const handleRecheckPrivy = async (wallet, index) => {
    try {
      setRecheckingIndex(index);
      const accLabel = wallet.label || `Account ${wallet.accountIndex}`;
      if (onCopy) onCopy(`Connecting with Privy for ${accLabel}...`);

      const res = await authenticateSubAccountWithPrivy(wallet.keypair, wallet.phantomAddress);

      setDiscoveredWallets((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          embeddedWalletAddress: res.embeddedWalletAddress || null,
          isNewUser: res.isNewUser || false,
          privyError: res.error || null,
          privyMessage: res.message || null,
          privySignature: res.signature || null,
          privyUserId: res.user?.id || null,
        };
        return updated;
      });

      if (res.embeddedWalletAddress) {
        if (onCopy) onCopy(`Linked 10k embedded wallet found: ${res.embeddedWalletAddress}`);
      } else if (res.isNewUser) {
        if (onCopy) onCopy('Privy confirms: No 10k embedded wallet was created with this account.');
      } else if (res.error) {
        if (onError) onError(`Privy API: ${res.error}`);
      } else {
        if (onCopy) onCopy('Checked Privy: No embedded wallet linked to this account.');
      }
    } catch (err) {
      if (onError) onError(err.message || 'Failed to re-check Privy.');
    } finally {
      setRecheckingIndex(null);
    }
  };

  // Dedicated Export for Real 10K Embedded Private Keys ONLY
  const handleDownload10kKeysTXT = () => {
    if (discoveredWallets.length === 0) return;

    const uncapturedCount = discoveredWallets.filter(
      (w) => !!w.embeddedWalletAddress && !w.exported10kKey
    ).length;

    if (uncapturedCount > 0) {
      if (onCopy) {
        onCopy(
          `Starting sequential export for ${uncapturedCount} 10K embedded wallet(s)... Please copy keys inside modal.`
        );
      }
      handleBatchExportAll();
      return;
    }

    triggerAutoDownload10kKeys();
  };

  // Dedicated Export for Phantom Sub-Account Private Keys
  const handleDownloadPhantomKeysTXT = () => {
    if (discoveredWallets.length === 0) return;

    const phantomKeys = discoveredWallets
      .map((w) => w.secretKeyBase58)
      .filter(Boolean);

    if (phantomKeys.length === 0) {
      if (onError) onError('No Phantom sub-account private keys available.');
      return;
    }

    const txtContent = phantomKeys.join('\n') + '\n';
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phantom_sub_account_keys.txt';
    a.click();
    URL.revokeObjectURL(url);
    if (onCopy) onCopy(`Exported ${phantomKeys.length} Phantom sub-account private keys (.txt) successfully`);
  };

  const handleDownloadJSON = () => {
    if (discoveredWallets.length === 0) return;
    const exportData = discoveredWallets.map((w, i) => ({
      index: i + 1,
      label: w.label || `Wallet ${i + 1}`,
      type: w.type || 'derived_account',
      phraseIndex: w.phraseIndex,
      accountIndex: w.accountIndex,
      derivationPath: w.derivationPath,
      phantomAddress: w.phantomAddress,
      phantomPrivateKey: w.secretKeyBase58,
      txCount: w.txCount,
      txDates: w.txDates,
      hasJun2025Tx: w.hasJun2025Tx,
      embedded10kSolanaWallet: w.embeddedWalletAddress,
      exported10kPrivateKey: w.exported10kKey || null,
      privyUserId: w.privyUserId,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '10k_recovered_subwallets.json';
    a.click();
    URL.revokeObjectURL(url);
    if (onCopy) onCopy('Recovery report (.json) downloaded successfully');
  };

  return (
    <div className="w-full space-y-6">
      {/* Input Card */}
      <div className="w-full bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 font-sans tracking-tight">
              Auto Sub-Account & Key Recovery Scanner
            </h2>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              Paste numbered seed phrases (1., 2.), multi-line notes, or raw Base58 private keys.
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[11px] font-mono text-gray-600">
            Gap Limit: 10 Empty
          </span>
        </div>

        {/* Textarea for Mnemonic / Private Keys */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="mnemonic-input" className="font-semibold text-gray-900">
                Phantom Recovery Phrase(s) or Base58 Private Key(s)
              </label>
              {detectedPhrases.length > 0 && detectedPrivateKeys.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  {detectedPhrases.length} phrase(s), {detectedPrivateKeys.length} key(s) detected
                </span>
              )}
              {detectedPhrases.length > 0 && detectedPrivateKeys.length === 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  {detectedPhrases.length} {detectedPhrases.length === 1 ? 'phrase' : 'phrases'} detected
                </span>
              )}
              {detectedPrivateKeys.length > 0 && detectedPhrases.length === 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  {detectedPrivateKeys.length} {detectedPrivateKeys.length === 1 ? 'private key' : 'private keys'} detected
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowMnemonic(!showMnemonic)}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
            >
              {showMnemonic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showMnemonic ? 'Hide input' : 'Show input'}</span>
            </button>
          </div>

          <div className="relative">
            <textarea
              id="mnemonic-input"
              rows={5}
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder={`Paste your notes here. Supports multiple formats:\n\nFormat A (Numbered seed phrases from notes):\n1.\nable forest inherit slim craft law banner genuine draft skate slot find\n2.\nspoon olive forest alarm wash car ask exhaust replace sting slot find\n\nFormat B (List of Base58 private keys):\n4Pr88TRhVYY9eWyseYmcBfF9A2sFDZtZQGitWtbVyCarsAEAHJ3njRsJFavBbUuvy3PWMwwVDQzu6WZTYjNAvny4\n49tmW9aqzA8qkyYu4xLh9evD4XzcFYTforbxPwQfkwSghJQpgQdq3JQ5T2pPZVZN9D9rK7tGSuhriPsvTGjeYjpt`}
              className={`w-full p-3.5 rounded-2xl border border-gray-200 bg-gray-50/70 text-xs font-mono text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all resize-y ${
                !showMnemonic && mnemonic ? 'blur-[3px] focus:blur-none transition-all' : ''
              }`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-sans flex-wrap gap-1">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
              <span>Processed strictly in your local browser memory. Never sent to any server.</span>
            </div>
            <span className="text-gray-500">Auto-cleans numbers (1., 2.), line breaks, and date headers</span>
          </div>
        </div>

        {/* Scan Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 flex-wrap">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isScanning ? (
              <>
                <button
                  type="button"
                  disabled
                  className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-black text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm opacity-90 cursor-wait"
                >
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Scanning Accounts...</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopScan}
                  className="w-full sm:w-auto px-5 py-3.5 rounded-full bg-red-50 hover:bg-red-100 text-red-700 font-medium text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-red-200"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Scan</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!hasAnyInput}
                onClick={handleStartScan}
                className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
              >
                <Search className="w-4 h-4 text-white" />
                <span>
                  {detectedPhrases.length > 0 && detectedPrivateKeys.length > 0
                    ? `Scan ${detectedPhrases.length} Phrases & ${detectedPrivateKeys.length} Keys`
                    : detectedPhrases.length > 0
                    ? `Scan & Recover ${detectedPhrases.length > 1 ? `${detectedPhrases.length} Phrases` : 'Sub-Wallets'}`
                    : detectedPrivateKeys.length > 0
                    ? `Scan & Recover ${detectedPrivateKeys.length > 1 ? `${detectedPrivateKeys.length} Private Keys` : 'Private Key'}`
                    : 'Scan & Recover Wallets'}
                </span>
              </button>
            )}
          </div>

          {discoveredWallets.length > 0 && !isScanning && (
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              {discoveredWallets.some((w) => w.embeddedWalletAddress) && (
                isBatchExporting ? (
                  <button
                    type="button"
                    onClick={handleStopBatchExport}
                    className="flex-1 sm:flex-initial px-4 py-3.5 rounded-full bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-red-200"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Auto-Export</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBatchExportAll}
                    className="flex-1 sm:flex-initial px-4 py-3.5 rounded-full bg-gray-900 hover:bg-black text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    title="Sequentially open Privy export modal for all accounts"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Batch Export 10K Keys ({discoveredWallets.filter((w) => w.exported10kKey).length}/{discoveredWallets.filter((w) => w.embeddedWalletAddress).length})
                    </span>
                  </button>
                )
              )}

              {/* Dedicated Export for Real 10K Keys */}
              <button
                type="button"
                onClick={handleDownload10kKeysTXT}
                className="flex-1 sm:flex-initial px-4 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                title="Download .txt containing ONLY real 10K embedded wallet private keys"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>
                  Export 10K Keys (.txt)
                  {discoveredWallets.filter((w) => w.exported10kKey).length > 0
                    ? ` (${discoveredWallets.filter((w) => w.exported10kKey).length} Ready)`
                    : ''}
                </span>
              </button>

              {/* Dedicated Export for Phantom Sub-Account Keys */}
              <button
                type="button"
                onClick={handleDownloadPhantomKeysTXT}
                className="flex-1 sm:flex-initial px-4 py-3.5 rounded-full border border-gray-300 hover:bg-gray-100 text-gray-800 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Download .txt containing Phantom sub-account private keys, one per line"
              >
                <Download className="w-3.5 h-3.5 text-gray-500" />
                <span>Export Phantom Keys (.txt)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadJSON}
                className="flex-1 sm:flex-initial px-4 py-3.5 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON ({discoveredWallets.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Active Batch Export Guidance Banner */}
        {isBatchExporting && (
          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 font-sans shadow-xs">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>10K Privy Secure Export Active:</strong> Click <strong>&quot;Copy key&quot;</strong> in each modal or use your auto-clicker. Next wallet will appear instantly!
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-amber-200/80 font-mono font-bold text-amber-950 text-[11px]">
                {discoveredWallets.filter((w) => w.exported10kKey).length}/{discoveredWallets.filter((w) => w.embeddedWalletAddress).length} Captured
              </span>
            </div>
          </div>
        )}

        {/* Live Scan Status & Activity */}
        {isScanning && scanProgress && (
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-white border border-gray-100 text-center">
                <div className="text-[10px] font-mono text-gray-400 uppercase">Processed</div>
                <div className="text-base font-bold font-mono text-gray-900">{scanProgress.accountIndex}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-gray-100 text-center">
                <div className="text-[10px] font-mono text-gray-400 uppercase">Found Active</div>
                <div className="text-base font-bold font-mono text-emerald-600">{discoveredWallets.length}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-gray-100 text-center">
                <div className="text-[10px] font-mono text-gray-400 uppercase">Empty Streak</div>
                <div className="text-base font-bold font-mono text-gray-700">{scanProgress.consecutiveEmpty} / 10</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-gray-600 px-0.5">
              <span className="truncate pr-2">{scanProgress.message}</span>
              <span className="text-[11px] text-gray-400 shrink-0">Auto-authenticating with 10k Privy</span>
            </div>

            {/* Live Terminal Log Stream */}
            {scanLogs.length > 0 && (
              <div className="p-3 rounded-xl bg-gray-900 text-gray-200 font-mono text-[11px] space-y-1.5 max-h-36 overflow-y-auto">
                <div className="flex items-center gap-1.5 text-gray-400 text-[10px] border-b border-gray-800 pb-1">
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  <span>LIVE SCAN LOG</span>
                </div>
                {scanLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`leading-relaxed ${
                      log.type === 'found'
                        ? 'text-emerald-400 font-semibold'
                        : log.type === 'retry'
                        ? 'text-amber-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {log.type === 'found' ? '✓ ' : log.type === 'retry' ? '! ' : '· '}
                    {log.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Discovered Wallets Result */}
      {discoveredWallets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Discovered Wallets ({discoveredWallets.length})
              </h3>
              <p className="text-xs text-gray-500 font-sans">
                Each account is authenticated with 10k Privy to recover its linked embedded wallet.
              </p>
            </div>

            <button
              type="button"
              onClick={toggleAllPrivateKeys}
              className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {showAllPrivateKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAllPrivateKeys ? 'Hide All Keys' : 'Reveal All Private Keys'}</span>
            </button>
          </div>

          <div className="space-y-4">
            {discoveredWallets.map((wallet, idx) => (
              <div
                key={wallet.secretKeyBase58 || `${wallet.phraseIndex || 1}-${wallet.accountIndex || idx}`}
                className="w-full bg-white border border-gray-200/80 rounded-2xl p-5 space-y-4 shadow-sm"
              >
                {/* Header row */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-black text-white text-xs font-mono font-bold">
                      {wallet.label || `Account ${wallet.accountIndex}`}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-mono">
                      {wallet.txCount} txns on-chain
                    </span>
                    {wallet.hasJun2025Tx && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-semibold">
                        Active May/Jun 2025
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-gray-400">
                    {wallet.derivationPath || 'Direct Private Key'}
                  </span>
                </div>

                {/* Phantom Address Box */}
                <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-200/80 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-500 flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold text-gray-800">
                        {wallet.type === 'private_key' ? 'PHANTOM WALLET (RECOVERED)' : 'PHANTOM SUB-ACCOUNT (RECOVERED)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePrivateKeyVisibility(idx)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-[11px] font-sans transition-colors cursor-pointer"
                      >
                        {visiblePrivateKeys[idx] ? 'Hide Key' : 'Reveal Key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyText(wallet.phantomAddress, `p-${idx}`, 'Phantom address')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-[11px] font-sans transition-colors cursor-pointer"
                      >
                        {copiedKey === `p-${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copy Address</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-mono font-semibold text-gray-900 break-all select-all bg-white p-2.5 rounded-lg border border-gray-200">
                    {wallet.phantomAddress}
                  </div>

                  {visiblePrivateKeys[idx] && (
                    <div className="pt-2 border-t border-gray-200/60 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-gray-500 font-mono text-[10px]">
                        <span>PHANTOM PRIVATE KEY (BASE58)</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(wallet.secretKeyBase58, `pk-${idx}`, 'Phantom private key')}
                          className="inline-flex items-center gap-1 text-gray-600 hover:text-black cursor-pointer font-sans"
                        >
                          {copiedKey === `pk-${idx}` ? (
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy Key</span>
                        </button>
                      </div>
                      <div className="font-mono text-gray-800 break-all select-all bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-200 text-xs font-semibold">
                        {wallet.secretKeyBase58}
                      </div>
                    </div>
                  )}
                </div>

                {/* 10K Embedded Wallet Box */}
                {wallet.embeddedWalletAddress ? (
                  <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-gray-900">
                        <Wallet className="w-4 h-4 text-gray-600" />
                        <span>LINKED 10K EMBEDDED WALLET</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        Key Ready
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs font-mono font-bold text-gray-900 break-all select-all">
                        {wallet.embeddedWalletAddress}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyText(wallet.embeddedWalletAddress, `e-${idx}`, '10K address')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-sans transition-colors border border-gray-200 cursor-pointer"
                        >
                          {copiedKey === `e-${idx}` ? (
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy</span>
                        </button>

                        <a
                          href={`https://solscan.io/account/${wallet.embeddedWalletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-sans transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Solscan</span>
                        </a>
                      </div>
                    </div>

                    {/* 10K Private Key Display or Export Buttons */}
                    {wallet.exported10kKey ? (
                      <div className="pt-2 border-t border-gray-100 space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="inline-flex items-center gap-1.5 text-emerald-800 font-bold">
                            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                            10K EMBEDDED PRIVATE KEY (CAPTURED)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyText(wallet.exported10kKey, `10k-pk-${idx}`, '10K private key')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-sans font-medium transition-colors cursor-pointer"
                            >
                              {copiedKey === `10k-pk-${idx}` ? (
                                <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Copy Key</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearKey(idx)}
                              className="text-[11px] text-gray-400 hover:text-red-600 font-sans cursor-pointer"
                              title="Clear and re-export"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="font-mono text-gray-900 break-all select-all bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200 text-xs font-semibold">
                          {wallet.exported10kKey}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={exportingIndex === idx || isBatchExporting}
                          onClick={() => handleExportWallet(wallet, idx)}
                          className="flex-1 py-3 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-xs inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                        >
                          {exportingIndex === idx ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Opening Privy Export Modal...</span>
                            </>
                          ) : (
                            <>
                              <KeyRound className="w-3.5 h-3.5 text-white" />
                              <span>Export Private Key ({wallet.label || `Account ${wallet.accountIndex}`})</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePasteKey(idx)}
                          className="px-3.5 py-3 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-700 font-medium text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Manually paste or enter the 10K private key"
                        >
                          <Key className="w-3.5 h-3.5 text-gray-500" />
                          <span>Paste Key</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-gray-200/90 bg-gray-50/60 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-gray-700">
                        <Wallet className="w-3.5 h-3.5 text-gray-500" />
                        <span>10K EMBEDDED WALLET STATUS</span>
                      </div>

                      <button
                        type="button"
                        disabled={recheckingIndex === idx}
                        onClick={() => handleRecheckPrivy(wallet, idx)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-800 text-xs font-medium transition-colors border border-gray-200 cursor-pointer shadow-xs disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3 h-3 ${recheckingIndex === idx ? 'animate-spin text-black' : 'text-gray-500'}`} />
                        <span>{recheckingIndex === idx ? 'Re-checking Privy...' : 'Check 10k Privy Again'}</span>
                      </button>
                    </div>

                    <div className="text-xs text-gray-600 font-sans space-y-1">
                      <p>
                        {wallet.privyError ? (
                          <span className="text-amber-700 font-medium">
                            Connection notice: {wallet.privyError}. Click &quot;Check 10k Privy Again&quot; above to retry.
                          </span>
                        ) : wallet.isNewUser ? (
                          <span>
                            Privy reports this specific Phantom address was never connected to 10k.world (no embedded wallet was created on Privy for this account).
                          </span>
                        ) : (
                          <span>
                            No internal 10k embedded wallet was found linked to this Phantom address on Privy.
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Note: Your Phantom wallet for this account is already 100% recovered above with its private key.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Complete Notification & Keys Modal */}
      {exportCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-2xl p-6 space-y-5 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Export Complete!</h3>
                  <p className="text-xs text-emerald-600 font-medium">
                    Successfully exported {exportCompleteModal.count} 10K Embedded Private Key(s)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportCompleteModal(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2 text-xs">
              <div className="flex items-start gap-2.5 text-blue-900">
                <FolderCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <span className="font-bold text-blue-950 block text-sm">File Saved Successfully</span>
                  <p className="text-blue-800 text-xs">
                    The keys have been downloaded directly to your computer:
                  </p>
                  <div className="mt-2 font-mono bg-white p-3 rounded-lg border border-blue-200 text-gray-800 text-[11px] break-all select-all space-y-1.5">
                    <div>
                      <strong className="text-gray-500 font-sans">File Name: </strong>
                      <span className="font-bold text-gray-900">{exportCompleteModal.fileName}</span>
                    </div>
                    <div>
                      <strong className="text-gray-500 font-sans">Saved Folder: </strong>
                      <span className="text-blue-600 font-bold">Downloads</span> (Browser default: <code>C:\Users\&lt;Username&gt;\Downloads</code>)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Exported 10K Private Keys ({exportCompleteModal.count})</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(exportCompleteModal.keys.join('\n'), 'all_exported_modal', 'All private keys')}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  {copiedKey === 'all_exported_modal' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600 font-semibold">Copied All!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All Keys</span>
                    </>
                  )}
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] text-gray-800 space-y-1 select-all">
                {exportCompleteModal.keys.map((key, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5 border-b border-gray-100 last:border-none">
                    <span className="text-gray-400 select-none text-[10px] w-5 text-right">{i + 1}.</span>
                    <span className="break-all">{key}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const txtContent = exportCompleteModal.keys.join('\n') + '\n';
                  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = exportCompleteModal.fileName;
                  a.click();
                  URL.revokeObjectURL(url);
                  if (onCopy) onCopy('Re-downloaded 10K private keys text file.');
                }}
                className="px-4 py-2.5 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-700 font-medium text-xs inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-gray-500" />
                <span>Download Again (.txt)</span>
              </button>
              <button
                type="button"
                onClick={() => setExportCompleteModal(null)}
                className="px-5 py-2.5 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-xs inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BatchRecovery;
