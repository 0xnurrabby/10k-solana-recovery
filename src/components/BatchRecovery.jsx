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
  Key
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

  const cancelSignalRef = useRef({ isCancelled: false });
  const cancelBatchExportRef = useRef(false);

  const { ready, authenticated, user, logout } = usePrivy();
  const { loginWithSiws } = useLoginWithSiws();
  const solanaWalletsHook = useSolanaWallets();
  const { exportWallet: exportWalletFromHook } = useExportWallet();

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

  const checkAndCaptureClipboard = async (index) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        const cleaned = text?.trim();
        if (cleaned && cleaned.length >= 40 && cleaned.length <= 90 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleaned)) {
          setDiscoveredWallets((prev) => {
            const next = [...prev];
            if (next[index]) {
              next[index] = { ...next[index], exported10kKey: cleaned };
            }
            return next;
          });
          if (onCopy) onCopy(`Captured 10k private key for ${discoveredWallets[index]?.label || `Account ${index + 1}`}!`);
          return true;
        }
      }
    } catch (e) {
      console.log('Clipboard auto-read notice:', e);
    }
    return false;
  };

  const clearPrivyStorage = () => {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.toLowerCase().includes('privy')) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));

      const toRemoveSession = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.toLowerCase().includes('privy')) toRemoveSession.push(k);
      }
      toRemoveSession.forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {
      console.warn('Storage clear notice:', e);
    }
  };

  const handleExportWallet = async (wallet, index) => {
    if (!wallet.embeddedWalletAddress) {
      if (onError) onError('No 10k embedded wallet found for this account.');
      return;
    }

    try {
      setExportingIndex(index);
      const accLabel = wallet.label || `Account ${wallet.accountIndex}`;
      if (onCopy) onCopy(`Authenticating session for ${accLabel}...`);

      // Check if Privy is currently logged in with this exact sub-account
      const isAlreadyCurrentAccount =
        authenticated &&
        user?.linkedAccounts?.some(
          (acc) => acc.address?.toLowerCase() === wallet.phantomAddress?.toLowerCase()
        );

      if (!isAlreadyCurrentAccount) {
        // Unconditionally log out previous session and wipe storage to prevent "Another user has already linked this account"
        if (onCopy) onCopy(`Preparing clean session for ${accLabel}...`);
        try {
          await logout();
        } catch (e) {}

        clearPrivyStorage();
        await new Promise((r) => setTimeout(r, 400));

        // Fetch fresh SIWS nonce with credentials: omit
        const initRes = await fetch('/privy-auth/api/v1/siws/init', {
          method: 'POST',
          headers: {
            'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
            'content-type': 'application/json',
          },
          credentials: 'omit',
          body: JSON.stringify({ address: wallet.phantomAddress }),
        });

        const initData = await initRes.json();
        const nonce = initData?.nonce;
        if (!nonce) {
          throw new Error('Failed to retrieve fresh authentication nonce from Privy');
        }

        const issuedAt = new Date().toISOString();
        const message = [
          `10k.world wants you to sign in with your Solana account:`,
          wallet.phantomAddress,
          '',
          `You are proving you own ${wallet.phantomAddress}.`,
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
        const sig = nacl.sign.detached(msgBytes, wallet.keypair.secretKey);
        const signatureBase64 = toBase64(sig);

        // Sign into Privy React SDK session
        try {
          await loginWithSiws({
            message,
            signature: signatureBase64,
          });
        } catch (siwsErr) {
          if (!siwsErr?.message?.includes('already authenticated')) {
            throw siwsErr;
          }
        }
      }

      if (onCopy) onCopy(`Opening export modal for ${accLabel}... Please copy key inside modal.`);
      await new Promise((r) => setTimeout(r, 600));

      // 2. Open Privy export modal for this embedded wallet
      if (typeof exportWalletFromHook === 'function') {
        await exportWalletFromHook({ address: wallet.embeddedWalletAddress });
      } else if (typeof solanaWalletsHook?.exportWallet === 'function') {
        await solanaWalletsHook.exportWallet({ address: wallet.embeddedWalletAddress });
      }

      // 3. Auto-capture copied private key from clipboard
      await checkAndCaptureClipboard(index);
    } catch (err) {
      console.warn('Export error or dialog closed:', err);
      await checkAndCaptureClipboard(index);
      if (!err?.message?.includes('exited') && !err?.message?.includes('cancelled')) {
        if (onError) onError(err.message || 'Failed to open export modal.');
      }
    } finally {
      setExportingIndex(null);
    }
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

  const handleStopBatchExport = () => {
    cancelBatchExportRef.current = true;
    setIsBatchExporting(false);
    if (onCopy) onCopy('Stopped sequential export');
  };

  const handleBatchExportAll = async () => {
    const pendingWallets = discoveredWallets
      .map((w, idx) => ({ wallet: w, idx }))
      .filter(({ wallet }) => !!wallet.embeddedWalletAddress && !wallet.exported10kKey);

    if (pendingWallets.length === 0) {
      if (onCopy) onCopy('All 10K keys have already been captured!');
      return;
    }

    setIsBatchExporting(true);
    cancelBatchExportRef.current = false;

    if (onCopy) onCopy(`Starting sequential export for ${pendingWallets.length} 10K wallet(s)...`);

    for (let i = 0; i < pendingWallets.length; i++) {
      if (cancelBatchExportRef.current) break;
      const { wallet, idx } = pendingWallets[i];
      const accLabel = wallet.label || `Account ${wallet.accountIndex}`;

      if (onCopy) onCopy(`[${i + 1}/${pendingWallets.length}] Exporting ${accLabel}... Please copy key inside modal.`);
      try {
        await handleExportWallet(wallet, idx);
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        console.warn(`Export failed for ${accLabel}:`, err);
      }
    }

    setIsBatchExporting(false);

    // Automatically download all captured keys once finished
    setTimeout(() => {
      setDiscoveredWallets((current) => {
        const captured = current.map((w) => w.exported10kKey).filter(Boolean);
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
        } else {
          if (onCopy) onCopy('Sequential export completed.');
        }
        return current;
      });
    }, 600);
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

    const capturedKeys = discoveredWallets
      .map((w) => w.exported10kKey)
      .filter(Boolean);

    if (capturedKeys.length === 0) {
      const has10k = discoveredWallets.some((w) => w.embeddedWalletAddress);
      if (has10k) {
        if (onCopy) onCopy('Starting Auto-Export for your 10K embedded wallets... Please copy keys inside modal.');
        handleBatchExportAll();
        return;
      }
      if (onError) {
        onError('No 10K embedded wallets found to export.');
      }
      return;
    }

    const txtContent = capturedKeys.join('\n') + '\n';
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '10k_embedded_private_keys.txt';
    a.click();
    URL.revokeObjectURL(url);
    if (onCopy) onCopy(`Exported ${capturedKeys.length} 10K embedded private key(s) (.txt) successfully`);
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
    </div>
  );
}

export default BatchRecovery;
