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
  RefreshCw
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

  // SIWS Authentication Routine
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
    setStatusMessage('Preparing sign request...');
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

    // 2. Format SIWS message for 10k.world
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
    setStatusMessage('Verifying signature with Privy...');
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
      <div className="w-full bg-white rounded-3xl border border-gray-200/80 p-8 flex flex-col items-center justify-center min-h-[240px] shadow-sm">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
        <span className="mt-3 text-xs font-mono text-gray-500">
          Initializing cryptographic session...
        </span>
      </div>
    );
  }

  // STATE 1: PHANTOM CONNECTED, AWAITING SIWS SIGNATURE
  if (!authenticated && isPhantomConnected && phantomAddress) {
    return (
      <div className="w-full bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center">
        {/* Top Connected Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs font-mono text-gray-700 mb-6">
          <span className="w-2 h-2 rounded-full bg-gray-500" />
          <span>Phantom Connected: {formatAddress(phantomAddress)}</span>
        </div>

        {/* Center Key Icon */}
        <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700 mb-4">
          <KeyRound className="w-5 h-5 text-gray-700" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight font-sans">
          Unlock 10K Embedded Keys
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 font-sans max-w-md mx-auto mt-2 leading-relaxed">
          Phantom extension account <strong className="font-mono text-gray-800">{formatAddress(phantomAddress)}</strong> is connected. Sign a zero-gas cryptographic message to verify ownership and reveal your embedded 10k.world wallet.
        </p>

        {/* Status Message */}
        {statusMessage && (
          <div className="mt-4 px-4 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600 inline-flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-500" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Sign & Unlock Button */}
        <button
          type="button"
          disabled={isAuthenticating || isConnecting}
          onClick={handleDirectSign}
          className="mt-6 px-6 py-3.5 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-70 active:scale-[0.99]"
        >
          {isAuthenticating || isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Awaiting signature in Phantom...</span>
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4 text-white" />
              <span>Sign & Unlock Private Key</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </>
          )}
        </button>

        {/* Disconnect Option */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleDisconnectAll}
            className="text-xs text-gray-500 hover:text-gray-800 font-sans transition-colors cursor-pointer"
          >
            Switch / Disconnect Phantom
          </button>
        </div>
      </div>
    );
  }

  // STATE 2: NOT CONNECTED (INITIAL STATE)
  if (!authenticated) {
    return (
      <div className="w-full bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center">
        {/* Center Wallet Icon */}
        <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700 mb-4">
          <Wallet className="w-5 h-5 text-gray-700" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight font-sans">
          Connect Phantom Wallet
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 font-sans max-w-md mx-auto mt-2 leading-relaxed">
          Connect the Phantom account you originally used on 10k.world to recover your embedded Solana wallet.
        </p>

        {statusMessage && (
          <div className="mt-4 px-4 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600 inline-flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-500" />
            <span>{statusMessage}</span>
          </div>
        )}

        <button
          type="button"
          disabled={isConnecting}
          onClick={handleInitialConnect}
          className="mt-6 px-6 py-3.5 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-70 active:scale-[0.99]"
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
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </>
          )}
        </button>

        <div className="mt-4">
          {hasPhantom ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-mono text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <span>Phantom extension ready</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-mono text-gray-500">
              <span>Phantom not installed?</span>
              <a
                href="https://phantom.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-900 underline underline-offset-2 font-medium"
              >
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // STATE 3: AUTHENTICATED & READY TO EXPORT (MATCHING EXACT media_1790481660266.png)
  return (
    <div className="w-full bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
      {/* Top Connection Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs font-mono text-gray-700">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <span>Phantom Connected</span>
          </div>

          {externalPhantomWallet && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700">
              <span>{formatAddress(externalPhantomWallet)}</span>
              <button
                type="button"
                onClick={() => handleCopy(externalPhantomWallet, 'Phantom address', 'phantom')}
                className="hover:text-black transition-colors p-0.5 cursor-pointer ml-0.5"
                title="Copy Phantom address"
                aria-label="Copy Phantom address"
              >
                {copiedPhantom ? (
                  <Check className="w-3.5 h-3.5 text-gray-700 stroke-[3]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700" />
                )}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleDisconnectAll}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-sans text-gray-700 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Disconnect</span>
        </button>
      </div>

      {/* Embedded Solana Wallet Card */}
      {embeddedSolanaWallet ? (
        <div className="rounded-2xl border border-gray-200 p-5 space-y-4 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-700">
                EMBEDDED 10K SOLANA WALLET
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-gray-200 text-xs font-mono text-gray-600">
              <Sparkles className="w-3 h-3 text-gray-500" />
              <span>Recoverable Key</span>
            </span>
          </div>

          {/* Address Box */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 overflow-hidden">
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400 font-semibold">
                PUBLIC SOLANA ADDRESS
              </div>
              <div className="text-xs sm:text-sm font-mono font-bold text-gray-900 break-all select-all">
                {embeddedSolanaWallet.address}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(embeddedSolanaWallet.address, 'Solana address', 'solana')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-sans font-medium transition-colors border border-gray-200 cursor-pointer"
              >
                {copiedSolana ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-gray-700 stroke-[3]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <a
                href={`https://solscan.io/account/${embeddedSolanaWallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-sans font-medium transition-colors"
                title="View on Solscan"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                <span>Explorer</span>
              </a>
            </div>
          </div>

          {/* Primary Action Button: Export Private Key */}
          <div className="pt-1 space-y-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExportPrivateKey}
              className="w-full py-4 rounded-full bg-black hover:bg-gray-900 text-white font-medium text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer disabled:opacity-70"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Opening Export Modal...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 text-white" />
                  <span>Export Private Key</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-gray-400 font-mono pt-1">
              <span className="mx-auto text-center">
                Triggers Privy's self-custody private key export modal. Store your key securely.
              </span>
              {isExporting && (
                <button
                  type="button"
                  onClick={() => setIsExporting(false)}
                  className="text-gray-500 hover:text-black underline cursor-pointer text-xs"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-gray-200 bg-gray-50 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-gray-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-gray-900">
                No Embedded Wallet on this Account
              </p>
              <p className="text-gray-600 leading-relaxed font-sans">
                Authenticated with Phantom <strong className="font-mono text-gray-900">{formatAddress(externalPhantomWallet)}</strong>, but no embedded Solana wallet was associated with this address.
              </p>
              <p className="text-gray-600 leading-relaxed font-sans pt-1">
                If you used a different Phantom account or email on 10k.world, please disconnect and try that account.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleDisconnectAll}
              className="px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-900 text-xs font-semibold transition-colors cursor-pointer border border-gray-200"
            >
              Disconnect & Try Another Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecoveryCard;
