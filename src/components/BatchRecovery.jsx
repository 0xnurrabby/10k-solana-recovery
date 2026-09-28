import React, { useState, useRef } from 'react';
import { useLoginWithSiws } from '@privy-io/react-auth';
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
  Layers
} from 'lucide-react';
import { scanSubWallets, toBase64, parsePhrases } from '../utils/scanner';

export function BatchRecovery({ onCopy, onError }) {
  const [mnemonic, setMnemonic] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);
  const [discoveredWallets, setDiscoveredWallets] = useState([]);
  const [exportingIndex, setExportingIndex] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [visiblePrivateKeys, setVisiblePrivateKeys] = useState({});
  const [showAllPrivateKeys, setShowAllPrivateKeys] = useState(false);

  const cancelSignalRef = useRef({ isCancelled: false });

  const { loginWithSiws } = useLoginWithSiws();
  const solanaWalletsHook = useSolanaWallets();
  const { exportWallet: exportWalletFromHook } = useExportWallet();

  const detectedPhrases = parsePhrases(mnemonic);

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
    const phrases = parsePhrases(mnemonic);
    if (phrases.length === 0) {
      if (onError) onError('Please enter at least one valid 12-word or 24-word recovery phrase.');
      return;
    }

    cancelSignalRef.current = { isCancelled: false };
    setIsScanning(true);
    setDiscoveredWallets([]);
    setScanLogs([]);
    setScanProgress({
      message: `Initializing scan across ${phrases.length} phrase(s)...`,
      accountIndex: 0,
      consecutiveEmpty: 0,
    });

    try {
      const results = await scanSubWallets({
        mnemonic: phrases,
        cancelSignal: cancelSignalRef.current,
        onProgress: (p) => {
          const phrasePrefix = p.totalPhrases > 1 ? `[Phrase ${p.phraseIndex}/${p.totalPhrases}] ` : '';
          if (p.status === 'scanning') {
            setScanProgress({
              message: `${phrasePrefix}Checking Account ${p.accountIndex} (${p.phantomAddress.slice(0, 4)}...${p.phantomAddress.slice(-4)})`,
              accountIndex: p.accountIndex,
              consecutiveEmpty: p.consecutiveEmpty,
            });
          } else if (p.status === 'empty') {
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
              message: `${phrasePrefix}Found activity on Account ${p.accountIndex}! Linking with Privy...`,
            }));
          } else if (p.status === 'found') {
            setDiscoveredWallets((prev) => {
              const key = `${p.wallet.phraseIndex}-${p.wallet.accountIndex}`;
              const exists = prev.some((w) => `${w.phraseIndex}-${w.accountIndex}` === key);
              return exists ? prev : [...prev, p.wallet];
            });
            setScanLogs((prev) => [
              ...prev.slice(-24),
              {
                id: Math.random().toString(),
                type: 'found',
                text: `${phrasePrefix}Account ${p.wallet.accountIndex} (${p.wallet.phantomAddress.slice(0, 4)}...${p.wallet.phantomAddress.slice(-4)}): Found ${p.wallet.txCount} txns! Linked 10k: ${p.wallet.embeddedWalletAddress ? p.wallet.embeddedWalletAddress.slice(0, 4) + '...' + p.wallet.embeddedWalletAddress.slice(-4) : 'None'}`,
              },
            ]);
          } else if (p.status === 'retrying') {
            setScanLogs((prev) => [
              ...prev.slice(-24),
              {
                id: Math.random().toString(),
                type: 'retry',
                text: `${phrasePrefix}Account ${p.accountIndex}: Rate limit encountered, retrying attempt ${p.attempt}/3...`,
              },
            ]);
          }
        },
      });

      setDiscoveredWallets(results);
      if (results.length === 0) {
        if (onError) onError('No sub-accounts with transaction activity were found.');
      } else {
        if (onCopy) onCopy(`Scan complete! Found ${results.length} active sub-accounts across ${phrases.length} phrase(s).`);
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
      if (onCopy) onCopy(`Authenticating session for Account ${wallet.accountIndex}...`);

      // 1. Fetch a fresh SIWS nonce for this specific sub-account
      const initRes = await fetch('/privy-auth/api/v1/siws/init', {
        method: 'POST',
        headers: {
          'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
          'content-type': 'application/json',
        },
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
      await loginWithSiws({
        message,
        signature: signatureBase64,
      });

      if (onCopy) onCopy(`Opening export modal for Account ${wallet.accountIndex}...`);
      await new Promise((r) => setTimeout(r, 600));

      // 2. Open Privy export modal for this embedded wallet
      if (typeof exportWalletFromHook === 'function') {
        await exportWalletFromHook({ address: wallet.embeddedWalletAddress });
      } else if (typeof solanaWalletsHook?.exportWallet === 'function') {
        await solanaWalletsHook.exportWallet({ address: wallet.embeddedWalletAddress });
      }
    } catch (err) {
      console.warn('Export error or dialog closed:', err);
      if (!err?.message?.includes('exited') && !err?.message?.includes('cancelled')) {
        if (onError) onError(err.message || 'Failed to open export modal.');
      }
    } finally {
      setExportingIndex(null);
    }
  };

  const handleDownloadTXT = () => {
    if (discoveredWallets.length === 0) return;

    let txt = '======================================================================\n';
    txt += '            10K.WORLD PHANTOM SUB-WALLET RECOVERY REPORT              \n';
    txt += `  Generated: ${new Date().toLocaleString()}\n`;
    txt += `  Total Active Accounts Found: ${discoveredWallets.length}\n`;
    txt += '======================================================================\n\n';

    discoveredWallets.forEach((w, i) => {
      txt += `----------------------------------------------------------------------\n`;
      txt += `[#${i + 1}] ${w.label || `Account ${w.accountIndex}`}\n`;
      txt += `----------------------------------------------------------------------\n`;
      txt += `Phantom Public Address  : ${w.phantomAddress}\n`;
      txt += `Phantom Private Key (B58): ${w.secretKeyBase58}\n`;
      txt += `Derivation Path         : ${w.derivationPath}\n`;
      txt += `On-Chain Transactions   : ${w.txCount} txns (${(w.txDates || []).slice(0, 3).join(', ')})\n`;
      txt += `Linked 10K Embedded Addr: ${w.embeddedWalletAddress || 'None'}\n`;
      txt += `Privy User ID           : ${w.privyUserId || 'N/A'}\n\n`;
    });

    txt += '======================================================================\n';
    txt += '  BULK PHANTOM PRIVATE KEYS (ONE PER LINE FOR IMPORT):\n';
    txt += '======================================================================\n';
    discoveredWallets.forEach((w) => {
      txt += `${w.secretKeyBase58}\n`;
    });

    txt += '\n======================================================================\n';
    txt += '  BULK LINKED 10K EMBEDDED WALLET ADDRESSES:\n';
    txt += '======================================================================\n';
    discoveredWallets.forEach((w) => {
      if (w.embeddedWalletAddress) {
        txt += `${w.embeddedWalletAddress}\n`;
      }
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '10k_recovered_subwallets.txt';
    a.click();
    URL.revokeObjectURL(url);
    if (onCopy) onCopy('Recovery report (.txt) downloaded successfully');
  };

  const handleDownloadJSON = () => {
    if (discoveredWallets.length === 0) return;
    const exportData = discoveredWallets.map((w) => ({
      label: w.label || `Account ${w.accountIndex}`,
      phraseIndex: w.phraseIndex,
      accountIndex: w.accountIndex,
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
    if (onCopy) onCopy('Recovery report (.json) downloaded successfully');
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
          <div className="flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="mnemonic-input" className="font-semibold text-gray-900">
                Phantom 12/24-Word Recovery Phrase(s)
              </label>
              {detectedPhrases.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  {detectedPhrases.length} {detectedPhrases.length === 1 ? 'phrase' : 'phrases'} detected
                </span>
              )}
            </div>
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
              rows={4}
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder={`Enter one or multiple seed phrases (1 phrase per line):\n\ne.g.\nembrace one private divorce purse primary address runway hidden hamster slot find\napple banana cherry dog elephant fox grape horse igloo jaguar kangaroo lemon`}
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
            <span className="text-gray-500">Multiple phrases? Paste each on a new line</span>
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
                disabled={detectedPhrases.length === 0}
                onClick={handleStartScan}
                className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
              >
                <Search className="w-4 h-4 text-white" />
                <span>
                  {detectedPhrases.length > 1
                    ? `Scan & Recover ${detectedPhrases.length} Phrases`
                    : 'Scan & Recover Sub-Wallets'}
                </span>
              </button>
            )}
          </div>

          {discoveredWallets.length > 0 && !isScanning && (
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <button
                type="button"
                onClick={handleDownloadTXT}
                className="flex-1 sm:flex-initial px-4 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export Report (.txt)</span>
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
                <div className="text-[10px] font-mono text-gray-400 uppercase">Scanned</div>
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
              <span className="text-[11px] text-gray-400 shrink-0">Stops at 10 consecutive empty</span>
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
                Discovered Active Sub-Accounts ({discoveredWallets.length})
              </h3>
              <p className="text-xs text-gray-500 font-sans">
                Each account is auto-authenticated with 10k Privy.
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
                key={`${wallet.phraseIndex || 1}-${wallet.accountIndex}`}
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
                      <div className="flex items-center justify-between text-gray-500 font-mono text-[10px]">
                        <span>PHANTOM PRIVATE KEY (BASE58)</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(wallet.secretKeyBase58, `pk-${idx}`, 'Phantom private key')}
                          className="inline-flex items-center gap-1 text-gray-600 hover:text-black cursor-pointer"
                        >
                          {copiedKey === `pk-${idx}` ? (
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy Key</span>
                        </button>
                      </div>
                      <div className="font-mono text-gray-800 break-all select-all bg-white p-2.5 rounded-lg border border-gray-200 text-xs">
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
                          <span>Export Private Key ({wallet.label || `Account ${wallet.accountIndex}`})</span>
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
