import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Header from './components/Header';
import RecoveryCard from './components/RecoveryCard';
import StepGuide from './components/StepGuide';
import Toast from './components/Toast';
import { ShieldCheck, HelpCircle, ArrowUpRight, AlertTriangle, ArrowRight, Zap, Key, Shield } from 'lucide-react';

export function App() {
  const { authenticated, user } = usePrivy();
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [is10kHost, setIs10kHost] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      setIs10kHost(hostname === '10k.world' || hostname === 'www.10k.world');
    }
  }, []);

  const hasSolanaWallet = Boolean(
    user?.linkedAccounts?.some(
      (acc) => acc.type === 'wallet' && acc.chainType === 'solana'
    )
  );

  let currentStep = 1;
  if (authenticated) {
    currentStep = hasSolanaWallet ? 3 : 2;
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const closeToast = () => {
    setToast({ message: '', type: 'success' });
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col font-sans selection:bg-purple-500/30 selection:text-white relative overflow-hidden">
      {/* Background ambient gradient orbs */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-r from-purple-600/20 via-indigo-600/20 to-emerald-500/15 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 -right-32 w-80 h-80 bg-purple-600/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute bottom-1/4 -left-32 w-80 h-80 bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

      {/* Header */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-7 relative z-10">
        {/* Domain helper banner when opened on localhost or custom domain */}
        {!is10kHost && (
          <div className="w-full bg-slate-900/90 backdrop-blur-md rounded-2xl border border-amber-500/30 p-5 space-y-3 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm sm:text-base font-display font-bold text-white">
                    Phantom Domain Verification Notice
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300">
                    Host: {typeof window !== 'undefined' ? window.location.hostname : 'localhost'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
                  Phantom wallet checks if the sign-in message domain matches your browser tab. If you see a domain warning during signature:
                </p>
                <div className="mt-2 text-xs text-slate-300 space-y-1 font-sans">
                  <div>1. Run <strong className="text-white font-mono">setup_hosts.bat</strong> (on your PC as admin) to map 10k.world to 127.0.0.1.</div>
                  <div>2. Or open <a href="https://10k.world/" className="text-purple-400 hover:text-purple-300 font-semibold underline">https://10k.world/</a> to sign without warnings.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className="text-center space-y-3 pt-1">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-xs font-mono font-medium text-purple-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>10k.world Embedded Wallet Recovery</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-white tracking-tight">
            Recover 10K Solana Wallet
          </h1>

          <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-400 font-sans leading-relaxed">
            When you used 10k.world with Phantom, an embedded Solana wallet was created through Privy. Connect that same Phantom wallet to decrypt and export your embedded wallet private key.
          </p>

          {/* Feature Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-mono">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero Gas Fees</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-mono">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              <span>Client-Side Decryption</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-mono">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span>Base58 Private Key Export</span>
            </div>
          </div>
        </section>

        {/* Recovery Card */}
        <section className="w-full">
          <RecoveryCard
            onCopy={(msg) => showToast(msg, 'success')}
            onError={(msg) => showToast(msg, 'error')}
          />
        </section>

        {/* 3-Step Guided Checklist */}
        <section className="w-full">
          <StepGuide currentStep={currentStep} />
        </section>

        {/* Security Info Grid */}
        <section className="w-full bg-[#111622]/90 backdrop-blur-sm rounded-2xl border border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800/80">
            <HelpCircle className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-display font-bold text-white">
              Security and Decryption Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans text-slate-400">
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-1.5 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Client-Side Reconstruction</span>
              </div>
              <p className="leading-relaxed">
                Key reconstruction happens entirely inside your browser via Shamir Secret Sharing. Private keys are never transmitted to any external server.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center gap-1.5 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Self-Custody Compatibility</span>
              </div>
              <p className="leading-relaxed">
                The exported key is a standard 64-byte base58 string. You can import it into Phantom, Backpack, Solflare, or the Solana CLI.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-[#0c1019] py-6 mt-12 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold">10k.world Solana Wallet Recovery</span>
            <span>•</span>
            <span>App ID: cm66m9fnd014r12wrx2xtd63r</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://phantom.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors inline-flex items-center gap-1 font-sans text-slate-300"
            >
              <span>Phantom</span>
              <ArrowUpRight className="w-3 h-3 text-slate-500" />
            </a>
            <a
              href="https://backpack.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors inline-flex items-center gap-1 font-sans text-slate-300"
            >
              <span>Backpack</span>
              <ArrowUpRight className="w-3 h-3 text-slate-500" />
            </a>
            <a
              href="https://privy.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors inline-flex items-center gap-1 font-sans text-slate-300"
            >
              <span>Privy</span>
              <ArrowUpRight className="w-3 h-3 text-slate-500" />
            </a>
          </div>
        </div>
      </footer>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={closeToast}
      />
    </div>
  );
}

export default App;
