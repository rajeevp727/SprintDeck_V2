import { useEffect } from 'react';
import { setActiveRoom, type ActiveRoom } from './auth';

/**
 * Publishes the room this device is in while the board is open, and clears it
 * on the way out, so the account's other devices can follow along.
 */
export function useActiveRoom(kind: ActiveRoom['kind'], code: string) {
  useEffect(() => {
    if (!code) return;
    setActiveRoom(kind, code);
    return () => {
      setActiveRoom(kind, null);
    };
  }, [kind, code]);
}
