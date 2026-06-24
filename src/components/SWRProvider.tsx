/**
 * Global SWR configuration provider.
 * Wrap App (or CRM subtree) with this to apply shared SWR settings.
 */
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { logger } from '../utils/logger';

interface SWRProviderProps {
  children: ReactNode;
}

export default function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        // Deduplicate identical requests within 5s window
        dedupingInterval: 5000,
        // Don't retry on focus — prevents noisy refetches
        revalidateOnFocus: false,
        // Max 2 error retries
        errorRetryCount: 2,
        // Global error handler
        onError: (err: Error) => {
          if (err?.message !== 'canceled') {
            logger.warn('[SWR] fetch error:', err?.message);
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
