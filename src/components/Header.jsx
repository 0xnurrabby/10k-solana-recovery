import React from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';

export function Header() {
  return (
    <header className="w-full bg-white border-b border-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-black text-white font-bold text-xs flex items-center justify-center tracking-tight">
              10k
            </span>
            <span className="font-bold text-base text-gray-900 tracking-tight font-sans">
              10k.world
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-xs font-mono text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
            <span>Privy v2 / 10k Recovery</span>
          </div>
        </div>

        {/* Right Status Items */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-500 font-sans">
            <ShieldCheck className="w-4 h-4 text-gray-400" />
            <span>Client-side Cryptography</span>
          </div>

          <a
            href="https://docs.privy.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-xs font-sans text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>Privy Docs</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </a>
        </div>
      </div>
    </header>
  );
}

export default Header;
