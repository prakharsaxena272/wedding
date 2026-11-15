import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border border-[#8E3B6E] bg-[#2D1928] px-4 py-2 text-xs font-medium text-[#fdf5f8] shadow-md"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#F4B6D2]" aria-hidden="true" />
      <span>Offline mode — invitation &amp; schedule remain cached</span>
    </div>
  );
};
