'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export type ConnectivityStatus = 'CHECKING' | 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface ConnectivityContextType {
  status: ConnectivityStatus;
  consecutiveFailures: number;
  lastSuccessfulPing: number | null;
  lastCheckTimestamp: number | null;
  checkNow: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextType | null>(null);

const FOREGROUND_INTERVAL_MS = 30000; // 30 segundos
const BACKGROUND_INTERVAL_MS = 120000; // 120 segundos
const HEARTBEAT_TIMEOUT_MS = 4000; // 4 segundos
const STALE_RESUME_THRESHOLD_MS = 15000; // 15 segundos ao retornar para foreground

// Backoff progressivo para OFFLINE: 5s -> 10s -> 20s -> máx 30s
const RETRY_BACKOFF_STEPS = [5000, 10000, 20000, 30000];

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectivityStatus>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'OFFLINE';
    }
    return 'CHECKING';
  });
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 1;
    }
    return 0;
  });
  const [lastSuccessfulPing, setLastSuccessfulPing] = useState<number | null>(null);
  const [lastCheckTimestamp, setLastCheckTimestamp] = useState<number | null>(null);

  // Mutex para evitar requisições concorrentes
  const isCheckingRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFailuresRef = useRef<number>(0);
  const lastCheckTimestampRef = useRef<number | null>(null);
  const statusRef = useRef<ConnectivityStatus>('CHECKING');
  const scheduleNextHeartbeatRef = useRef<() => void>(() => {});

  // Manter refs sincronizados com state para callbacks e timers
  const updateStatus = (newStatus: ConnectivityStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const updateFailures = (count: number) => {
    consecutiveFailuresRef.current = count;
    setConsecutiveFailures(count);
  };

  const clearExistingTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleFailure = useCallback(() => {
    const newFailures = consecutiveFailuresRef.current + 1;
    updateFailures(newFailures);
    lastCheckTimestampRef.current = Date.now();
    setLastCheckTimestamp(lastCheckTimestampRef.current);

    if (newFailures === 1) {
      updateStatus('DEGRADED');
    } else {
      updateStatus('OFFLINE');
    }
  }, []);

  /**
   * Executa a sonda de conectividade via /api/health
   */
  const performCheck = useCallback(async () => {
    // 1. Mutex: evitar chamadas simultâneas
    if (isCheckingRef.current) {
      return;
    }

    // 2. navigator.onLine check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateFailures(consecutiveFailuresRef.current + 1);
      updateStatus('OFFLINE');
      lastCheckTimestampRef.current = Date.now();
      setLastCheckTimestamp(lastCheckTimestampRef.current);
      return;
    }

    isCheckingRef.current = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, HEARTBEAT_TIMEOUT_MS);

    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok && response.status === 200) {
        // Sucesso comprovado
        const now = Date.now();
        updateFailures(0);
        updateStatus('ONLINE');
        setLastSuccessfulPing(now);
        lastCheckTimestampRef.current = now;
        setLastCheckTimestamp(now);
      } else {
        // Resposta não-200 é falha de comunicação válida com o servidor
        handleFailure();
      }
    } catch {
      // AbortError (timeout de 4s), TypeError (NetworkError) ou erro de conexão
      clearTimeout(timeoutId);
      handleFailure();
    } finally {
      isCheckingRef.current = false;
    }
  }, [handleFailure]);

  /**
   * Agenda o próximo heartbeat baseado no estado atual e visibilidade
   */
  const scheduleNextHeartbeat = useCallback(() => {
    clearExistingTimer();

    let delay = FOREGROUND_INTERVAL_MS;

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      delay = BACKGROUND_INTERVAL_MS;
    } else if (statusRef.current === 'OFFLINE') {
      // Retry progressivo: 5s -> 10s -> 20s -> 30s máx
      const failureIndex = Math.min(consecutiveFailuresRef.current - 1, RETRY_BACKOFF_STEPS.length - 1);
      delay = RETRY_BACKOFF_STEPS[Math.max(0, failureIndex)];
    }

    timerRef.current = setTimeout(async () => {
      await performCheck();
      scheduleNextHeartbeatRef.current();
    }, delay);
  }, [performCheck]);

  useEffect(() => {
    scheduleNextHeartbeatRef.current = scheduleNextHeartbeat;
  }, [scheduleNextHeartbeat]);

  // Disparo manual pelo usuário ou componentes
  const checkNow = useCallback(async () => {
    clearExistingTimer();
    await performCheck();
    scheduleNextHeartbeat();
  }, [performCheck, scheduleNextHeartbeat]);

  useEffect(() => {
    // 1. Heartbeat inicial ao montar (se online)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      scheduleNextHeartbeat();
    } else {
      performCheck().then(() => {
        scheduleNextHeartbeat();
      });
    }

    // 2. Handlers de Eventos do Navegador
    const handleOnline = () => {
      clearExistingTimer();
      updateStatus('CHECKING');
      performCheck().then(() => {
        scheduleNextHeartbeat();
      });
    };

    const handleOffline = () => {
      clearExistingTimer();
      updateFailures(consecutiveFailuresRef.current + 1);
      updateStatus('OFFLINE');
      scheduleNextHeartbeat();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const lastCheck = lastCheckTimestampRef.current;
        // Se voltou para foreground e o último heartbeat foi há mais de 15 segundos
        if (!lastCheck || (now - lastCheck) > STALE_RESUME_THRESHOLD_MS) {
          clearExistingTimer();
          performCheck().then(() => {
            scheduleNextHeartbeat();
          });
        } else {
          // Apenas re-agenda para o intervalo de foreground (30s)
          scheduleNextHeartbeat();
        }
      } else {
        // Ao ir para background, ajusta intervalo para 120s
        scheduleNextHeartbeat();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearExistingTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [performCheck, scheduleNextHeartbeat]);

  return (
    <ConnectivityContext.Provider
      value={{
        status,
        consecutiveFailures,
        lastSuccessfulPing,
        lastCheckTimestamp,
        checkNow
      }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity deve ser utilizado dentro de um ConnectivityProvider');
  }
  return context;
}
