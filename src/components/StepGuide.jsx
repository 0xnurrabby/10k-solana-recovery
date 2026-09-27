import React from 'react';
import { ShieldCheck, Check } from 'lucide-react';

export function StepGuide({ currentStep = 1 }) {
  const steps = [
    {
      num: 1,
      title: "Connect your original Phantom wallet",
      description: "Sign in with the exact Phantom wallet account you initially linked to 10k.world. The cryptographic signature will verify ownership without broadcasting any on-chain transaction or consuming SOL.",
    },
    {
      num: 2,
      title: "Locate your embedded Solana address",
      description: "Privy resolves your linked accounts and retrieves the embedded Solana wallet key shard associated with your identity.",
    },
    {
      num: 3,
      title: "Export base58 private key",
      description: "Open Privy's secure client modal to copy your raw Solana private key and import it into Phantom, Backpack, or Solflare.",
    },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Recovery Instructions Card */}
      <div className="w-full bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 font-sans">
              Recovery Instructions
            </h2>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              Follow this 3-step workflow to regain full self-custody of your Solana wallet.
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[11px] font-mono text-gray-600">
            Step {Math.min(currentStep, 3)} of 3
          </span>
        </div>

        <div className="space-y-4">
          {steps.map((step) => {
            const isDone = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <div key={step.num} className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-medium shrink-0 mt-0.5 ${
                    isDone
                      ? 'bg-black text-white'
                      : isCurrent
                      ? 'border-2 border-black text-black font-bold'
                      : 'border border-gray-300 text-gray-400'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : (
                    step.num
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-gray-900 font-sans">
                      {step.title}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-mono text-gray-600">
                        In progress
                      </span>
                    )}
                    {isDone && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-mono text-gray-600">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-sans leading-relaxed mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security Note Card */}
      <div className="w-full bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <p className="font-bold text-gray-900">
            Cryptographic Signature Only
          </p>
          <p className="text-gray-500 font-sans">
            Signing is purely off-chain and will never initiate transactions or consume SOL.
          </p>
        </div>
      </div>
    </div>
  );
}

export default StepGuide;
