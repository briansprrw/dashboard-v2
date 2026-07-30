// Browser connectivity detection (M0 §8): "On connectivity loss, the
// current in-memory dashboard remains visible, displays `Offline`, and
// disables edits." This is a distinct signal from an ordinary fetch failure
// (server error, timeout) — it comes from the browser's own network-state
// events, not from interpreting a failed response.

import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
