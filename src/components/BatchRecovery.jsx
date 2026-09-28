import React, { useState } from 'react';
import { useLoginWithSiws } from '@privy-io/react-auth';
import { useSolanaWallets, useExportWallet } from '@privy-io/react-auth/solana';
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
  Sparkles
} from 'lucide-react';
import { scanSubWallets } from '../utils/scanner';

export function BatchRecovery({ onCopy, onError }) {
  const [mnemonic, setMnemonic] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [discoveredWallets, setDiscoveredWallets] = useState([]);
  const [exportingIndex, setExportingIndex] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [visiblePrivateKeys, setVisiblePrivateKeys] = useState({});

  const { loginWithSiws } = useLoginWithSiws();
  const solanaWalletsHook = useSolanaWallets();
  const { exportWallet: exportWalletFromHook } = useExportWallet();

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

  const handleStartScan = async () => {
    const clean = mnemonic.trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 12) {
      if (onError) onError('Please enter a valid 12-word or 24-word recovery phrase.');
      return;
    }

    setIsScanning(true);
    setDiscoveredWallets([]);
    setScanProgress({
      message: 'Initializing derivation and scanning on-chain activity...',
      accountIndex: 0,
      consecutiveEmpty: 0,
    });

    try {
      const results = await scanSubWallets({
        mnemonic: clean,
        onProgress: (p) => {
          if (p.status === 'scanning') {
            setScanProgress({
              message: `Checking Account ${p.accountIndex} (${p.phantomAddress.slice(0, 4)}...${p.phantomAddress.slice(-4)})`,
              accountIndex: p.accountIndex,
              consecutiveEmpty: p.consecutiveEmpty,
            });
          } else if (p.status === 'authenticating') {
            setScanProgress((prev) => ({
              ...prev,
              message: `Found activity on Account ${p.accountIndex}! Authenticating with Privy...`,
            }));
          } else if (p.status === 'found') {
            setDiscoveredWallets((prev) => {
              const exists = prev.some((w) => w.accountIndex === p.wallet.accountIndex);
              return exists ? prev : [...prev, p.wallet];
            });
          }
        },
      });

      setDiscoveredWallets(results);
      if (results.length === 0) {
        if (onError) onError('No sub-accounts with transaction activity were found.');
      } else {
        if (onCopy) onCopy(`Scan complete! Found ${results.length} active sub-accounts.`);
      }
    } catch (err) {
      console.error('Scan error:', err);
      if (onError) onError(err.message || 'Error occurred during scan.');
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const handleExportWallet = async (wallet, index) => {
    if (!wallet.embeddedWalletAddress) {
      if (onError) onError('No 10k embedded wallet found for this sub-account.');
      return;
    }

    try {
      setExportingIndex(index);
      if (onCopy) onCopy(`Activating Privy session for Account ${wallet.accountIndex}...`);

      // 1. Activate Privy session for this sub-account
      if (wallet.privyMessage && wallet.privySignature) {
        await loginWithSiws({
          message: wallet.privyMessage,
          signature: wallet.privySignature,
        });
      }

      // Safety timer: unlock button after 4s if modal stays pending
      const timer = setTimeout(() => {
        setExportingIndex(null);
      }, 4000);

      // 2. Open Privy export modal for this embedded wallet
      if (typeof exportWalletFromHook === 'function') {
        await exportWalletFromHook({ address: wallet.embeddedWalletAddress });
      } else if (typeof solanaWalletsHook?.exportWallet === 'function') {
        await solanaWalletsHook.exportWallet({ address: wallet.embeddedWalletAddress });
      }

      clearTimeout(timer);
    } catch (err) {
      console.warn('Export error or dialog closed:', err);
      if (!err?.message?.includes('exited') && !err?.message?.includes('cancelled')) {
        if (onError) onError(err.message || 'Failed to open export modal.');
      }
    } finally {
      setExportingIndex(null);
    }
  };

  const handleDownloadJSON = () => {
    if (discoveredWallets.length === 0) return;
    const exportData = discoveredWallets.map((w) => ({
      account: `Account ${w.accountIndex}`,
      derivationPath: w.derivationPath,
      phantomAddress: w.phantomAddress,
      phantomPrivateKey: w.secretKeyBase58,
      txCount: w.txCount,
      txDates: w.txDates,
      hasJun2025Tx: w.hasJun2025Tx,
      embedded10kSolanaWallet: w.embeddedWalletAddress,
      privyUserId: w.privyUserId,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '10k_recovered_subwallets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-6">
      {/* Input Card */}
      <div className="w-full bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 font-sans tracking-tight">
              Auto Sub-Account Recovery Scanner
            </h2>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              Derives Phantom sub-accounts (Account 1, 2, 3...) and checks on-chain Solana activity.
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[11px] font-mono text-gray-600">
            Gap Limit: 10 Empty
          </span>
        </div>

        {/* Textarea for Mnemonic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <label htmlFor="mnemonic-input" className="font-medium">Phantom 12-Word Recovery Phrase</label>
            <button
              type="button"
              onClick={() => setShowMnemonic(!showMnemonic)}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
            >
              {showMnemonic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showMnemonic ? 'Hide words' : 'Show words'}</span>
            </button>
          </div>

          <div className="relative">
            <textarea
              id="mnemonic-input"
              rows={3}
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="e.g. apple banana cherry dog elephant fox grape horse igloo jaguar kangaroo lemon"
              className={`w-full p-3.5 rounded-2xl border border-gray-200 bg-gray-50/70 text-xs font-mono text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all resize-none ${
                !showMnemonic && mnemonic ? 'blur-[3px] focus:blur-none transition-all' : ''
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-sans">
            <Lock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            <span>Processed strictly in your local browser memory. Never sent to any server.</span>
          </div>
        </div>

        {/* Scan Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isScanning || !mnemonic.trim()}
            onClick={handleStartScan}
            className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Scanning Sub-Accounts...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-white" />
                <span>Scan & Recover Sub-Wallets</span>
              </>
            )}
          </button>

          {discoveredWallets.length > 0 && !isScanning && (
            <button
              type="button"
              onClick={handleDownloadJSON}
              className="w-full sm:w-auto px-4 py-3.5 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Report (JSON)</span>
            </button>
          )}
        </div>

        {/* Live Scan Progress */}
        {isScanning && scanProgress && (
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-gray-700 font-medium">{scanProgress.message}</span>
              <span className="text-gray-500">Empty: {scanProgress.consecutiveEmpty}/10</span>
            </div>
            <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-black h-full transition-all duration-300"
                style={{ width: `${Math.min(100, (scanProgress.accountIndex / 20) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Discovered Wallets Result */}
      {discoveredWallets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-gray-900">
              Discovered Active Sub-Accounts ({discoveredWallets.length})
            </h3>
            <span className="text-xs text-gray-500 font-mono">
              Auto-authenticated with Privy
            </span>
          </div>

          <div className="space-y-4">
            {discoveredWallets.map((wallet, idx) => (
              <div
                key={wallet.accountIndex}
                className="w-full bg-white border border-gray-200/80 rounded-2xl p-5 space-y-4 shadow-sm"
              >
                {/* Header row */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-black text-white text-xs font-mono font-bold">
                      Account {wallet.accountIndex}
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
                    {wallet.derivationPath}
                  </span>
                </div>

                {/* Phantom Address Box */}
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-500">
                    <span>PHANTOM SUB-ACCOUNT PUBLIC KEY</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePrivateKeyVisibility(idx)}
                        className="text-gray-500 hover:text-gray-900 cursor-pointer text-[10px]"
                      >
                        {visiblePrivateKeys[idx] ? 'Hide private key' : 'Show private key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyText(wallet.phantomAddress, `p-${idx}`, 'Phantom address')}
                        className="inline-flex items-center gap-1 text-gray-600 hover:text-black cursor-pointer"
                      >
                        {copiedKey === `p-${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-mono font-semibold text-gray-900 break-all select-all">
                    {wallet.phantomAddress}
                  </div>

                  {visiblePrivateKeys[idx] && (
                    <div className="pt-2 border-t border-gray-200/60 text-[11px] space-y-1">
                      <div className="text-gray-400 font-mono">PHANTOM PRIVATE KEY (BASE58)</div>
                      <div className="font-mono text-gray-800 break-all select-all bg-white p-2 rounded-lg border border-gray-200">
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
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-xs font-mono text-gray-700">
                        <Sparkles className="w-3 h-3" />
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

                    {/* Action Button: Export Private Key */}
                    <button
                      type="button"
                      disabled={exportingIndex === idx}
                      onClick={() => handleExportWallet(wallet, idx)}
                      className="w-full py-3 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-xs inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                    >
                      {exportingIndex === idx ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>Opening Privy Export Modal...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-3.5 h-3.5 text-white" />
                          <span>Export Private Key for Account {wallet.accountIndex}</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500 font-sans">
                    No 10k embedded wallet found linked to this sub-account.
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
