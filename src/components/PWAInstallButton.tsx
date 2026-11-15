import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#8E3B6E]/45 bg-[#8E3B6E]/10 px-5 py-2.5 text-[14px] font-semibold text-[#231420] transition-colors hover:bg-[#8E3B6E]/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8E3B6E] whitespace-nowrap shrink-0 cursor-pointer"
      >
        {isInstallable ? (
          <Download className="h-4 w-4 text-[#8E3B6E]" aria-hidden="true" />
        ) : (
          <Smartphone className="h-4 w-4 text-[#8E3B6E]" aria-hidden="true" />
        )}
        <span>{isIOS ? 'Add to iPhone Home' : 'Add to Home Screen'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#231420]/45 p-4 backdrop-blur-xs sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="double-filigree-card w-full max-w-md rounded-2xl p-6 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label-caps text-[#8E3B6E]">Offline Wedding Pass</p>
                <h3 id="pwa-guide-title" className="mt-1 font-editorial text-2xl font-semibold text-[#231420]">
                  Save to Home Screen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close installation guide"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[#573D4F] transition-colors hover:bg-[#efe0ea] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[#573D4F]">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#8E3B6E]/15 text-xs font-bold text-[#8E3B6E]">
                    1
                  </span>
                  <span>
                    Tap the <strong className="inline-flex items-center gap-1 text-[#231420]">Share <Share className="inline h-3.5 w-3.5" /></strong> icon in your Safari bottom bar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#8E3B6E]/15 text-xs font-bold text-[#8E3B6E]">
                    2
                  </span>
                  <span>
                    Scroll down and select <strong className="text-[#231420]">Add to Home Screen</strong> to keep ceremony timings handy offline.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[#573D4F]">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#8E3B6E]/15 text-xs font-bold text-[#8E3B6E]">
                    1
                  </span>
                  <span>
                    Open your browser menu (<strong className="text-[#231420]">⋮</strong> in Chrome or Edge).
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#8E3B6E]/15 text-xs font-bold text-[#8E3B6E]">
                    2
                  </span>
                  <span>
                    Tap <strong className="text-[#231420]">Add to Home screen</strong> or <strong className="text-[#231420]">Install app</strong> for instant one-tap access.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#8E3B6E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#742D59] cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
