import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Info, ShieldCheck } from 'lucide-react';

export function StepGuide({ currentStep = 1 }) {
  const [showImportDetails, setShowImportDetails] = useState(false);

  const steps = [
    {
      num: 1,
      title: "Connect your original Phantom wallet",
      description: "Connect the same Phantom address you used on 10k.world to identify your linked account.",
    },
    {
      num: 2,
      title: "Sign authentication message",
      description: "Sign a zero-gas message in Phantom. This verifies your ownership and unlocks Privy.",
    },
    {
      num: 3,
      title: "Export private key to Phantom or Backpack",
      description: "Trigger the self-custody export modal to reveal and copy your 64-byte Solana private key.",
    },
  ];

  return (
    <div className="w-full bg-[#111622]/90 backdrop-blur-sm rounded-2xl border border-slate-800 p-6 shadow-xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-display font-bold text-white flex items-center gap-2">
            <span>Recovery Steps</span>
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Three simple steps to export your embedded Solana wallet
          </p>
        </div>
        <div className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono font-medium text-slate-300">
          Step {Math.min(currentStep, 3)} of 3
        </div>
      </div>

      <div className="divide-y divide-slate-800/60">
        {steps.map((step) => {
          const isDone = currentStep > step.num;
          const isCurrent = currentStep === step.num;

          return (
            <div key={step.num} className="py-4 first:pt-4 last:pb-1">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 transition-all ${
                    isDone
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : isCurrent
                      ? 'bg-purple-600 text-white border border-purple-400 shadow-md shadow-purple-500/25 ring-2 ring-purple-500/20'
                      : 'bg-slate-800/80 border border-slate-700/80 text-slate-500'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : (
                    step.num
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm font-semibold tracking-tight ${
                        isCurrent ? 'text-white' : isDone ? 'text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {step.title}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[10px] font-mono text-purple-300 animate-pulse">
                        In progress
                      </span>
                    )}
                    {isDone && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    {step.description}
                  </p>

                  {/* Expandable guide for Step 3 */}
                  {step.num === 3 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setShowImportDetails(!showImportDetails)}
                        className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors cursor-pointer group"
                      >
                        <Info className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300" />
                        <span>How to import the private key into Phantom or Backpack</span>
                        {showImportDetails ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {showImportDetails && (
                        <div className="mt-2.5 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-2 font-sans animate-in fade-in duration-150">
                          <p className="font-semibold text-white">
                            Phantom Import Instructions:
                          </p>
                          <ol className="list-decimal list-inside space-y-1 text-slate-300 text-xs pl-1">
                            <li>Open your Phantom wallet extension.</li>
                            <li>Click the top-left account avatar / menu.</li>
                            <li>Click <strong>Manage Accounts</strong> &gt; <strong>Add / Connect Wallet</strong>.</li>
                            <li>Choose <strong>Import Private Key</strong>.</li>
                            <li>Paste the exported base58 private key and click Import.</li>
                          </ol>
                          <p className="text-[11px] text-slate-400 border-t border-slate-800 pt-2 font-mono flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Keep your private key secret. Never share it with anyone.</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StepGuide;
