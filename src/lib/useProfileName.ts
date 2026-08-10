import { useEffect, useState } from 'react';
import { useAuth } from './auth';

/** Prefill a display-name field from the signed-in user's profile. */
export function useProfileNamePrefill(): [string, (value: string) => void] {
  const { user } = useAuth();
  const [name, setName] = useState('');

  useEffect(() => {
    if (!user) return;
    setName((current) => current || user.name?.trim() || user.email.split('@')[0]);
  }, [user]);

  return [name, setName];
}
