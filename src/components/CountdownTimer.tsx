import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface CountdownTimerProps {
  targetIso: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

function computeRemaining(targetIso: string): TimeRemaining {
  const targetMs = new Date(targetIso).getTime();
  const nowMs = Date.now();
  if (Number.isNaN(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: false };
  }
  const diff = targetMs - nowMs;
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, isPast: false };
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetIso }) => {
  const [remaining, setRemaining] = useState<TimeRemaining>(() => computeRemaining(targetIso));

  useEffect(() => {
    setRemaining(computeRemaining(targetIso));
    const interval = window.setInterval(() => {
      setRemaining(computeRemaining(targetIso));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [targetIso]);

  if (remaining.isPast) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] px-4 py-4 text-center sm:px-5"
      >
        <p className="label-caps text-[#8E3B6E]">The Celebration Has Begun</p>
        <p className="mt-1 font-editorial text-lg font-medium text-[#231420] sm:text-xl">
          With blessings and joy today
        </p>
      </motion.div>
    );
  }

  const units = [
    { label: 'Days', value: String(remaining.days).padStart(2, '0') },
    { label: 'Hours', value: String(remaining.hours).padStart(2, '0') },
    { label: 'Mins', value: String(remaining.minutes).padStart(2, '0') },
    { label: 'Secs', value: String(remaining.seconds).padStart(2, '0') },
  ];

  return (
    <div aria-label="Countdown to wedding day">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {units.map((unit) => (
          <div
            key={unit.label}
            className="flex flex-col items-center justify-center rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] px-1.5 py-2.5 sm:px-2 sm:py-3.5"
          >
            <div className="relative flex h-[1.45em] items-center justify-center overflow-hidden font-sans text-[clamp(1.25rem,5vw,1.875rem)] font-semibold tracking-tight text-[#231420] tabular-nums">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={unit.value}
                  initial={{ opacity: 0.35, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-block"
                >
                  {unit.value}
                </motion.span>
              </AnimatePresence>
            </div>
            <span className="mt-0.5 text-[clamp(0.5625rem,2.1vw,0.6875rem)] font-semibold tracking-[0.09em] uppercase text-[#8E3B6E] sm:mt-1 sm:tracking-[0.12em]">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
