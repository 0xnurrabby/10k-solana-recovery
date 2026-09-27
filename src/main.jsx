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
        <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 space-y-4 text-center shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-500 font-bold font-mono">
              !
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              Something went wrong
            </h2>
            <p className="text-xs font-mono text-gray-600 break-words bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-left">
              {this.state.error?.message || 'Unknown runtime error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full bg-black text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
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
          theme: 'light',
          accentColor: '#000000',
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
