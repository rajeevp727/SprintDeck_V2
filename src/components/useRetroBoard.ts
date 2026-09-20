import { useCallback, useEffect, useRef, useState } from 'react';
import { retroApi } from '../lib/retroApi';
import { clearIdentity, getIdentity } from '../lib/storage';
import type { RetroBoard as RetroBoardType } from '../lib/retroTypes';
import { useRealtime } from '../lib/realtime';
import { notifyPresence } from '../lib/presence';

const pollMs = 1500;
// Realtime carries the updates, but a client that missed a message would sit
// on a stale board forever, so it keeps a slow poll as a safety net.
const realtimePollMs = 5000;
const maxMisses = 6;
const typingClearMs = 2500;

/** Names of people currently typing, each forgotten shortly after they stop. */
function useTypingNames(participantId: string) {
  const [typingNames, setTypingNames] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const showTyping = useCallback(
    (id: string, name: string) => {
      if (!id || id === participantId) return;
      setTypingNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name }));
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        delete timers.current[id];
        setTypingNames((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, typingClearMs);
    },
    [participantId],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  return { typingNames, showTyping };
}

/**
 * Everything the retrospective board needs to stay current: the board itself,
 * who is typing, and the actions that change it. The component below is left
 * with rendering.
 */
export function useRetroBoard(code: string, onLeave: () => void, onMissingIdentity: () => void) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId ?? '';

  const [board, setBoard] = useState<RetroBoardType | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const missCount = useRef(0);
  const prevParticipants = useRef<{ id: string; name: string }[] | null>(null);
  const { typingNames, showTyping } = useTypingNames(participantId);

  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  const refresh = useCallback(async () => {
    if (!participantId) return;
    try {
      const { board: b } = await retroApi.getBoard(code, participantId);
      missCount.current = 0;
      if (!b.participants.some((p) => p.id === participantId)) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }

      notifyPresence(b.participants, b.facilitatorId === participantId, participantId, prevParticipants, 'retrospective');
      setBoard(b);
      setError('');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.toLowerCase().includes('not found')) {
        missCount.current += 1;
        if (missCount.current >= maxMisses) {
          clearIdentity(code);
          onMissingIdentity();
        }
        return;
      }
      setError(msg);
    }
  }, [code, participantId, onMissingIdentity]);

  
  const onRealtime = useCallback(
    (data: unknown) => {
      const d = data as { t?: string; id?: string; name?: string } | undefined;
      if (d?.t === 'typing') showTyping(d.id ?? '', d.name ?? 'Someone');
      else refresh();
    },
    [refresh, showTyping],
  );

  const { connected: rtConnected, send } = useRealtime(`retro:${code}`, participantId, onRealtime);

  
  const notifyTyping = useCallback(() => {
    send({ t: 'typing', id: participantId, name: getIdentity(code)?.name ?? 'Someone' });
  }, [send, participantId, code]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, rtConnected ? realtimePollMs : pollMs);
    return () => clearInterval(id);
  }, [refresh, rtConnected]);

  async function run(fn: () => Promise<{ board: RetroBoardType }>) {
    try {
      const { board: b } = await fn();
      setBoard(b);
      send({ t: 'update', id: participantId });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function leave() {
    retroApi.leave(code, participantId).catch(() => {}); 
    clearIdentity(code);
    onLeave();
  }

  
  async function endRetro() {
    if (!window.confirm('End this retrospective? Notes become read-only and you can then export the results.')) return;
    await run(() => retroApi.end(code, participantId));
  }

  
  function exit() {
    clearIdentity(code);
    onLeave();
  }

  async function copyInvite() {
    const url = `${location.origin}/retro/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Invite link:', url);
    }
  }
  return {
    refresh,
    participantId,
    board,
    error,
    copied,
    showPeople,
    setShowPeople,
    showProfile,
    setShowProfile,
    showExport,
    setShowExport,
    typingNames,
    notifyTyping,
    run,
    leave,
    endRetro,
    exit,
    copyInvite,
  };
}
