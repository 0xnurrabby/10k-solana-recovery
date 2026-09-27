import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import App from './App';
import './index.css';

// Initialize Solana connectors for external wallets (Phantom, Backpack, etc.)
let solanaConnectors = undefined;
try {
  solanaConnectors = toSolanaWalletConnectors({
    shouldAutoConnect: true,
  });
} catch (err) {
  console.warn('Failed to initialize Solana connectors:', err);
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0d14] text-white flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-[#111622] rounded-2xl border border-slate-800 p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400 font-bold font-mono">
              !
            </div>
            <h2 className="text-lg font-display font-bold text-white">
              Something went wrong
            </h2>
            <p className="text-xs font-mono text-slate-400 break-words bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 text-left">
              {this.state.error?.message || 'Unknown runtime error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-emerald-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <PrivyProvider
      appId="cm66m9fnd014r12wrx2xtd63r"
      config={{
        loginMethods: ['wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#9945FF',
          walletChainType: 'solana-only',
          showWalletLoginFirst: true,
          walletList: ['phantom', 'detected_solana_wallets', 'backpack', 'solflare'],
        },
        embeddedWallets: {
          createOnLogin: 'off',
          solana: {
            createOnLogin: 'off',
          },
          ethereum: {
            createOnLogin: 'off',
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      <App />
    </PrivyProvider>
  </ErrorBoundary>
);
