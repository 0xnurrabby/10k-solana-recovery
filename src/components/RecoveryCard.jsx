import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePrivy, useLogin, useLoginWithSiws } from '@privy-io/react-auth';
import { useSolanaWallets, useExportWallet } from '@privy-io/react-auth/solana';
import { 
  KeyRound, 
  LogOut, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldAlert, 
  Lock, 
  Wallet,
  ArrowRight,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import PhantomIcon from './PhantomIcon';

function toBase64(bytes) {
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

export function RecoveryCard({ onCopy, onError }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin();
  const { generateSiwsMessage, loginWithSiws } = useLoginWithSiws();
  const solanaWalletsHook = useSolanaWallets();
  const { exportWallet: exportWalletFromHook } = useExportWallet();

  const [hasPhantom, setHasPhantom] = useState(false);
  const [isPhantomConnected, setIsPhantomConnected] = useState(false);
  const [phantomAddress, setPhantomAddress] = useState(null);
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const [copiedPhantom, setCopiedPhantom] = useState(false);
  const [copiedSolana, setCopiedSolana] = useState(false);

  const hasAutoTriggeredRef = useRef(false);

  const getPhantomProvider = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solana?.isPhantom) return window.solana;
    return null;
  }, []);

  // Sync Phantom extension connection
  useEffect(() => {
    let cleanupListeners = null;

    const checkAndSync = () => {
      const p = getPhantomProvider();
      if (!p) {
        setHasPhantom(false);
        return;
      }
      setHasPhantom(true);

      const addr = p.publicKey?.toBase58?.();
      if (p.isConnected && addr) {
        setPhantomAddress(addr);
        setIsPhantomConnected(true);
      }
    };

    checkAndSync();
    const interval = setInterval(checkAndSync, 800);
    window.addEventListener('focus', checkAndSync);
    window.addEventListener('phantom#initialized', checkAndSync);

    const provider = getPhantomProvider();
    if (provider) {
      const handleConnect = (pubKey) => {
        const addr = pubKey?.toBase58?.() || provider.publicKey?.toBase58?.();
        if (addr) {
          setPhantomAddress(addr);
          setIsPhantomConnected(true);
        }
      };

      const handleDisconnect = () => {
        setPhantomAddress(null);
        setIsPhantomConnected(false);
      };

      const handleAccountChange = (pubKey) => {
        if (pubKey) {
          const addr = pubKey.toBase58?.() || String(pubKey);
          setPhantomAddress(addr);
          setIsPhantomConnected(true);
        } else {
          handleDisconnect();
        }
      };

      if (provider.isConnected && provider.publicKey) {
        handleConnect(provider.publicKey);
      } else if (typeof provider.connect === 'function') {
        provider.connect({ onlyIfTrusted: true })
          .then(handleConnect)
          .catch(() => {});
      }

      if (provider.on) {
        provider.on('connect', handleConnect);
        provider.on('disconnect', handleDisconnect);
        provider.on('accountChanged', handleAccountChange);

        cleanupListeners = () => {
          if (provider.removeListener) {
            provider.removeListener('connect', handleConnect);
            provider.removeListener('disconnect', handleDisconnect);
            provider.removeListener('accountChanged', handleAccountChange);
          }
        };
      }
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkAndSync);
      window.removeEventListener('phantom#initialized', checkAndSync);
      if (cleanupListeners) cleanupListeners();
    };
  }, [getPhantomProvider]);

  // Auto-prompt signature once Phantom connects
  useEffect(() => {
    if (
      !authenticated &&
      isPhantomConnected &&
      phantomAddress &&
      !hasAutoTriggeredRef.current &&
      !isAuthenticating &&
      !isConnecting
    ) {
      hasAutoTriggeredRef.current = true;
      authenticateWithPhantom(phantomAddress).catch((err) => {
        console.warn('Auto-sign prompt dismissed or errored:', err);
        hasAutoTriggeredRef.current = false;
      });
    }
  }, [authenticated, isPhantomConnected, phantomAddress, isAuthenticating, isConnecting]);

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const handleCopy = async (text, label, type) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'phantom') {
        setCopiedPhantom(true);
        setTimeout(() => setCopiedPhantom(false), 2000);
      } else {
        setCopiedSolana(true);
        setTimeout(() => setCopiedSolana(false), 2000);
      }
      if (onCopy) onCopy(`${label} copied to clipboard`);
    } catch {
      if (onError) onError('Failed to copy to clipboard');
    }
  };

  // Core SIWS Authentication Routine
  const authenticateWithPhantom = async (targetAddr) => {
    const provider = getPhantomProvider();
    if (!provider) {
      throw new Error('Phantom extension not detected in browser');
    }

    let addr = targetAddr || phantomAddress || provider.publicKey?.toBase58?.();

    if (!addr || !provider.isConnected) {
      setStatusMessage('Connecting Phantom wallet...');
      const resp = await provider.connect();
      addr = resp?.publicKey?.toBase58?.() || provider.publicKey?.toBase58?.();
    }

    if (!addr) {
      throw new Error('Could not retrieve public key from Phantom');
    }

    setPhantomAddress(addr);
    setIsPhantomConnected(true);

    // 1. Get nonce from Privy
    setStatusMessage('Preparing cryptographic sign request...');
    let nonce = '';
    try {
      const initRes = await fetch('/privy-auth/api/v1/siws/init', {
        method: 'POST',
        headers: {
          'privy-app-id': 'cm66m9fnd014r12wrx2xtd63r',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ address: addr }),
      });
      const data = await initRes.json();
      nonce = data?.nonce;
    } catch (e) {
      console.warn('Proxy init failed, falling back to SDK:', e);
      const raw = await generateSiwsMessage({ address: addr });
      const match = raw.match(/Nonce:\s*([a-zA-Z0-9]+)/);
      nonce = match ? match[1] : '';
    }

    if (!nonce) {
      throw new Error('Failed to retrieve authentication nonce from Privy');
    }

    // 2. Format SIWS message for 10k.world domain
    const issuedAt = new Date().toISOString();
    const message = [
      `10k.world wants you to sign in with your Solana account:`,
      addr,
      '',
      `You are proving you own ${addr}.`,
      '',
      `URI: https://10k.world`,
      `Version: 1`,
      `Chain ID: mainnet`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Resources:`,
      `- https://privy.io`,
    ].join('\n');

    // 3. Request signature from Phantom
    setStatusMessage('Awaiting signature in Phantom...');
    const encodedMessage = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encodedMessage, 'utf8');

    // 4. Format signature
    const signatureBytes = signed.signature || signed;
    const signatureBase64 = toBase64(signatureBytes);

    // 5. Submit signature to Privy
    setStatusMessage('Verifying signature & unlocking session...');
    await loginWithSiws({
      message,
      signature: signatureBase64,
    });

    setStatusMessage(null);
    if (onCopy) onCopy('Privy session authenticated successfully');
  };

  const handleInitialConnect = async () => {
    try {
      setIsConnecting(true);
      const provider = getPhantomProvider();

      if (provider) {
        try {
          await authenticateWithPhantom();
          return;
        } catch (siwsErr) {
          console.warn('Direct SIWS authentication error:', siwsErr);
          if (siwsErr?.code === 4001 || siwsErr?.message?.includes('User rejected')) {
            if (onError) onError('Signature cancelled in Phantom. Click "Sign & Unlock" to retry.');
            return;
          }
          if (onError) onError(siwsErr?.message || 'Authentication failed. Please retry.');
        }
      } else {
        if (onError) onError('Phantom extension not detected in browser.');
      }
    } catch (err) {
      console.error('Initial connect failed:', err);
      if (onError) onError(err?.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
      setStatusMessage(null);
    }
  };

  const handleDirectSign = async () => {
    try {
      setIsAuthenticating(true);
      await authenticateWithPhantom();
    } catch (err) {
      console.error('Direct sign failed:', err);
      if (err?.code === 4001 || err?.message?.includes('User rejected')) {
        if (onError) onError('Signature cancelled in Phantom. Click "Sign & Unlock" to retry.');
      } else {
        if (onError) onError(err?.message || 'Failed to authenticate signature with Privy.');
      }
    } finally {
      setIsAuthenticating(false);
      setStatusMessage(null);
    }
  };

  const handleDisconnectAll = async () => {
    try {
      await logout();
      const provider = getPhantomProvider();
      if (provider && typeof provider.disconnect === 'function') {
        try {
          await provider.disconnect();
        } catch {}
      }
      setPhantomAddress(null);
      setIsPhantomConnected(false);
      hasAutoTriggeredRef.current = false;
      if (onCopy) onCopy('Disconnected successfully');
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  // Identify external Phantom wallet
  const externalPhantomWallet = useMemo(() => {
    const fromPrivy = user?.linkedAccounts?.find(
      (acc) =>
        acc.type === 'wallet' &&
        (acc.walletClientType === 'phantom' ||
         acc.connectorType === 'phantom' ||
         acc.chainType === 'solana') &&
        acc.walletClientType !== 'privy'
    ) || (user?.wallet?.walletClientType === 'phantom' ? user.wallet : null);

    if (fromPrivy?.address) return fromPrivy.address;
    if (phantomAddress) return phantomAddress;
    return null;
  }, [user, phantomAddress]);

  // Identify embedded 10k.world Solana wallet
  const embeddedSolanaWallet = useMemo(() => {
    if (solanaWalletsHook?.wallets && solanaWalletsHook.wallets.length > 0) {
      const primary = solanaWalletsHook.wallets[0];
      if (primary?.address) {
        return {
          address: primary.address,
          source: 'solanaWalletsHook',
        };
      }
    }

    const embedded = user?.linkedAccounts?.find(
      (acc) =>
        acc.type === 'wallet' &&
        acc.chainType === 'solana' &&
        (acc.walletClientType === 'privy' || acc.connectorType === 'embedded')
    );
    if (embedded?.address) {
      return {
        address: embedded.address,
        source: 'linkedAccountsEmbedded',
      };
    }

    const otherSol = user?.linkedAccounts?.find(
      (acc) =>
        acc.type === 'wallet' &&
        acc.chainType === 'solana' &&
        externalPhantomWallet &&
        acc.address?.toLowerCase() !== externalPhantomWallet?.toLowerCase()
    );
    if (otherSol?.address) {
      return {
        address: otherSol.address,
        source: 'linkedAccountsOther',
      };
    }

    const anySol = user?.linkedAccounts?.find(
      (acc) => acc.type === 'wallet' && acc.chainType === 'solana'
    );
    if (anySol?.address) {
      return {
        address: anySol.address,
        source: 'linkedAccountsAny',
      };
    }

    return null;
  }, [solanaWalletsHook?.wallets, user?.linkedAccounts, externalPhantomWallet]);

  // Fixed Export Private Key Routine: Guaranteed auto-unlock to prevent infinite spinning
  const handleExportPrivateKey = async () => {
    if (!embeddedSolanaWallet?.address) {
      if (onError) onError('No embedded Solana wallet address found to export');
      return;
    }

    try {
      setIsExporting(true);
      if (onCopy) onCopy('Opening secure export modal...');

      // Safety timeout: If modal iframe opens or promise stays pending, unlock button after 3.5s
      const autoUnlockTimer = setTimeout(() => {
        setIsExporting(false);
      }, 3500);

      // Check if wallet instance in hook has direct export method
      const targetInstance = solanaWalletsHook?.wallets?.find(
        (w) => w.address?.toLowerCase() === embeddedSolanaWallet.address.toLowerCase()
      );

      if (targetInstance && typeof targetInstance.export === 'function') {
        await targetInstance.export();
      } else if (typeof solanaWalletsHook?.exportWallet === 'function') {
        await solanaWalletsHook.exportWallet({
          address: embeddedSolanaWallet.address,
        });
      } else if (typeof exportWalletFromHook === 'function') {
        await exportWalletFromHook({
          address: embeddedSolanaWallet.address,
        });
      } else {
        throw new Error('Export wallet functionality is not available in Privy SDK');
      }

      clearTimeout(autoUnlockTimer);
    } catch (err) {
      console.warn('Export private key error or dialog closed:', err);
      if (!err?.message?.includes('exited') && !err?.message?.includes('cancelled')) {
        if (onError) onError(err?.message || 'Failed to open export modal. Try again.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Loading state when Privy is authenticating
  if (!ready && authenticated) {
    return (
      <div className="w-full bg-[#111622]/90 backdrop-blur-sm rounded-2xl border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[260px] shadow-xl">
        <div className="w-8 h-8 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
        <span className="mt-3 text-xs font-mono text-slate-400">
          Decrypting session keys...
        </span>
      </div>
    );
  }

  // STATE 1: PHANTOM CONNECTED, AWAITING SIWS SIGNATURE
  if (!authenticated && isPhantomConnected && phantomAddress) {
    return (
      <div className="w-full space-y-4">
        <div className="w-full bg-[#111622]/90 backdrop-blur-sm rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle gradient corner glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center max-w-md mx-auto relative z-10">
            {/* Connected Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-mono text-slate-200 mb-4 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Phantom Connected: {formatAddress(phantomAddress)}</span>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center mb-4 text-white shadow-lg shadow-purple-500/25">
              <KeyRound className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
              Unlock Embedded Solana Key
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-sans mt-2 leading-relaxed">
              Phantom wallet <strong className="font-mono text-purple-300">{formatAddress(phantomAddress)}</strong> is connected. Sign a zero-gas message to verify your identity and decrypt your embedded 10k.world wallet.
            </p>

            {/* Status Message */}
            {statusMessage && (
              <div className="mt-4 px-4 py-2 rounded-full bg-purple-500/15 border border-purple-500/30 text-xs font-mono text-purple-200 flex items-center gap-2 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Sign & Unlock Button */}
            <button
              type="button"
              disabled={isAuthenticating || isConnecting}
              onClick={handleDirectSign}
              className="mt-6 w-full sm:w-auto min-w-[280px] inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-500 hover:to-emerald-400 text-white font-semibold text-sm shadow-xl shadow-purple-500/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-75"
            >
              {isAuthenticating || isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Awaiting Phantom Signature...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 text-emerald-300" />
                  <span>Sign & Unlock Private Key</span>
                  <ArrowRight className="w-4 h-4 ml-0.5 stroke-[2.5]" />
                </>
              )}
            </button>

            {/* Disconnect Option */}
            <div className="mt-4 flex items-center justify-center">
              <button
                type="button"
                onClick={handleDisconnectAll}
                className="text-xs text-slate-500 hover:text-slate-300 font-sans transition-colors cursor-pointer"
              >
                Disconnect / Switch Wallet
              </button>
            </div>
          </div>
        </div>

        {/* Security Note */}
        <div className="w-full bg-[#111622]/60 rounded-xl border border-slate-800/80 p-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5 text-purple-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-white">
                Cryptographic Signature Only
              </p>
              <p className="text-slate-400 leading-relaxed font-sans">
                This signature is purely off-chain. No Solana or gas fees will ever be spent.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: NOT CONNECTED
  if (!authenticated) {
    return (
      <div className="w-full space-y-4">
        <div className="w-full bg-[#111622]/90 backdrop-blur-sm rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center max-w-md mx-auto relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#AB9FF2]/30 to-[#9945FF]/30 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-300 shadow-lg shadow-purple-500/20">
              <PhantomIcon className="w-7 h-7" />
            </div>

            <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
              Connect Phantom Wallet
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-sans mt-2 leading-relaxed">
              Connect the Phantom account you originally used on 10k.world. The tool will verify your account and recover the embedded Solana wallet key shard.
            </p>

            {statusMessage && (
              <div className="mt-4 px-4 py-2 rounded-full bg-purple-500/15 border border-purple-500/30 text-xs font-mono text-purple-200 flex items-center gap-2 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>{statusMessage}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isConnecting}
              onClick={handleInitialConnect}
              className="mt-6 w-full sm:w-auto min-w-[260px] inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-500 hover:to-emerald-400 text-white font-semibold text-sm shadow-xl shadow-purple-500/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-75"
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connecting Wallet...</span>
                </>
              ) : (
                <>
                  <PhantomIcon className="w-4 h-4 fill-white" />
                  <span>Connect Phantom Wallet</span>
                  <ArrowRight className="w-4 h-4 ml-0.5 stroke-[2.5]" />
                </>
              )}
            </button>

            <div className="mt-4">
              {hasPhantom ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px] font-mono text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Phantom extension ready</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px] font-mono text-slate-400">
                  <span>Phantom not installed?</span>
                  <a
                    href="https://phantom.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 font-semibold underline underline-offset-2 inline-flex items-center gap-0.5"
                  >
                    <span>Download</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-full bg-[#111622]/60 rounded-xl border border-slate-800/80 p-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-white">
                Zero Gas and Zero On-Chain Transactions
              </p>
              <p className="text-slate-400 leading-relaxed font-sans">
                Privy reconstructs your key shard completely inside your browser. No SOL is spent, and your keys are never stored on any server.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE 3: AUTHENTICATED & READY TO EXPORT
  return (
    <div className="w-full space-y-4">
      <div className="w-full bg-[#111622]/90 backdrop-blur-sm rounded-2xl border border-slate-800 p-6 sm:p-7 space-y-6 shadow-2xl">
        {/* Top Connection Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Phantom Connected</span>
            </div>

            {externalPhantomWallet && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-mono text-slate-300">
                <span>{formatAddress(externalPhantomWallet)}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(externalPhantomWallet, 'Phantom address', 'phantom')}
                  className="hover:text-white transition-colors p-0.5 cursor-pointer ml-0.5"
                  title="Copy Phantom address"
                  aria-label="Copy Phantom address"
                >
                  {copiedPhantom ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                  )}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleDisconnectAll}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-700 hover:border-slate-500 bg-slate-800/60 text-xs font-sans font-medium text-slate-300 hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>

        {/* Embedded Solana Wallet Card */}
        {embeddedSolanaWallet ? (
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#182032] to-[#121724] border border-purple-500/30 space-y-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-md">
                  <Wallet className="w-4 h-4 text-purple-300" />
                </div>
                <div>
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-purple-300">
                    10K Embedded Solana Wallet
                  </span>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Found and decrypted from your Privy session
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-mono text-emerald-300">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Key Ready
              </span>
            </div>

            {/* Address Box */}
            <div className="p-4 rounded-xl bg-[#0b0e17] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
              <div className="space-y-1 overflow-hidden">
                <div className="text-[11px] font-sans text-slate-400 uppercase tracking-wider font-medium">
                  Public Solana Address
                </div>
                <div className="text-xs sm:text-sm font-mono text-white font-medium break-all select-all">
                  {embeddedSolanaWallet.address}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(embeddedSolanaWallet.address, 'Solana address', 'solana')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono transition-colors cursor-pointer border border-slate-700"
                >
                  {copiedSolana ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <a
                  href={`https://solscan.io/account/${embeddedSolanaWallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono transition-colors border border-slate-700"
                  title="View on Solscan"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Solscan</span>
                </a>
              </div>
            </div>

            {/* Primary Action Button: Export Private Key */}
            <div className="pt-2 relative z-10 space-y-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExportPrivateKey}
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-500 hover:to-emerald-400 text-white font-semibold text-sm shadow-xl shadow-purple-500/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-75"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Opening Export Modal...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 text-emerald-300" />
                    <span>Export Private Key</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-sans px-1">
                <span>Opens Privy secure modal to view and copy your 64-byte private key</span>
                {isExporting && (
                  <button
                    type="button"
                    onClick={() => setIsExporting(false)}
                    className="text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer"
                  >
                    Reset button
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-white">
                  No Embedded Wallet on this Account
                </p>
                <p className="text-slate-400 font-sans leading-relaxed">
                  Authenticated with Phantom <strong className="font-mono text-slate-200">{formatAddress(externalPhantomWallet)}</strong>, but no embedded Solana wallet was associated with this address.
                </p>
                <p className="text-slate-400 font-sans leading-relaxed pt-1">
                  If you used a different Phantom account or email on 10k.world, please disconnect and try that account.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleDisconnectAll}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
              >
                Switch / Connect Another Wallet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RecoveryCard;
