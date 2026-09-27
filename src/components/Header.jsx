import React from 'react';
import { ShieldCheck, ExternalLink, Sparkles } from 'lucide-react';

export function Header() {
  return (
    <header className="w-full border-b border-slate-800/80 bg-[#0c1019]/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-2.5 text-white hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-emerald-400 p-0.5 flex items-center justify-center shadow-md shadow-purple-500/20">
              <div className="w-full h-full bg-[#0c1019] rounded-[10px] flex items-center justify-center font-display font-bold text-xs text-white">
                10k
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-base tracking-tight text-white leading-none">
                10k.world
              </span>
              <span className="text-[10px] font-mono text-slate-400 leading-tight mt-0.5">
                Wallet Recovery Tool
              </span>
            </div>
          </a>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[11px] font-mono font-medium text-purple-300">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Privy Embedded</span>
          </div>
        </div>

        {/* Right Status Items */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Solana Mainnet</span>
          </div>

          <a
            href="https://docs.privy.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-300 hover:text-white transition-colors bg-slate-900/60"
          >
            <span>Privy Docs</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>
    </header>
  );
}

export default Header;
