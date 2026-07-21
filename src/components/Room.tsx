import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { api } from '../lib/api';
import { retroApi } from '../lib/retroApi';
import { clearIdentity, getIdentity, saveIdentity } from '../lib/storage';
import type { Session } from '../lib/types';
import ConnectToolModal, { toolMeta, type ToolId } from './ConnectToolModal';
import ThemeToggle from './ThemeToggle';
import AdBanner from './AdBanner';
import { CrownIcon } from './icons';
import { nearestDeckValue } from '../lib/estimate';
import { useSubscription, getSubscriptionRef, tiers } from '../lib/subscription';

// Modals loaded on demand — SubscriptionModal pulls in qrcode.react, so keeping
// it out of the initial bundle speeds first load (esp. for non-moderators).
const ResultsModal = lazy(() => import('./ResultsModal'));
const ToolConnectModal = lazy(() => import('./ToolConnectModal'));
const SubscriptionModal = lazy(() => import('./SubscriptionModal'));
const ChatPanel = lazy(() => import('./ChatPanel'));

const pollMs = 1500;
// Only leave the room after this many CONSECUTIVE "not found" polls — tolerates
// transient misses (tab loses focus & throttles, cold start, instance split) so
// you stay put until you leave or the moderator actually ends the room.
const maxMisses = 6;

interface Props {
  code: string;
  onLeave: () => void;
  onMissingIdentity: () => void;
  onGoRoom: () => void;
  onGoRetro: (code: string) => void;
}

export default function Room({ code, onLeave, onMissingIdentity, onGoRoom, onGoRetro }: Props) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId ?? '';

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [myVote, setMyVote] = useState<string | null>(null);
  const [queueDraft, setQueueDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [viewedCount, setViewedCount] = useState(0); // history entries the moderator has opened
  const [linearEnabled, setLinearEnabled] = useState(false);
  const [linearDraft, setLinearDraft] = useState('');
  const [linearMissing, setLinearMissing] = useState<string[]>([]);
  const [linearNotice, setLinearNotice] = useState('');
  const [linearConnected, setLinearConnected] = useState(false);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [pendingTool, setPendingTool] = useState<ToolId | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const subChecked = useRef(false);
  const chatSynced = useRef(false);
  const [pushEntryId, setPushEntryId] = useState<string | null>(null);
  const [pushValue, setPushValue] = useState('');
  const missCount = useRef(0);

  // No identity for this room (e.g. opened an invite link directly) → bounce to join.
  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  const isModerator = session?.moderatorId === participantId;
  const { subscription, subscribed, loaded: subLoaded } = useSubscription();

  // Results the moderator hasn't opened yet (new rounds since they last viewed).
  const unviewedCount = session ? Math.max(0, session.history.length - viewedCount) : 0;
  const hasUnviewed = unviewedCount > 0;
  // Mirror into a ref so the beforeunload handler reads the latest value without
  // needing to re-register the listener on every change.
  const hasUnviewedRef = useRef(false);
  hasUnviewedRef.current = hasUnviewed;

  const refresh = useCallback(async () => {
    if (!participantId) return;
    try {
      const { session: s } = await api.getSession(code, participantId);
      missCount.current = 0; // successful poll resets the miss streak
      // Removed by the moderator (kicked) → the room still exists but we're no
      // longer in it. Leave gracefully.
      const me = s.participants.find((p) => p.id === participantId);
      if (!me) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }
      setSession(s);
      setError('');
      setMyVote(me.vote); // keep my selected card in sync with the server
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        // Tolerate transient misses; only exit after a sustained run of them
        // (room truly gone / moderator ended it).
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

  useEffect(() => {
    refresh();
    // Pause polling while the tab is backgrounded (no point syncing an unseen
    // room); refresh immediately when it becomes visible again.
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, pollMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Remind the moderator to review results before they close/refresh/navigate away.
  // (Browsers show their own generic confirm text, but this guarantees the prompt.)
  useEffect(() => {
    if (!isModerator) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnviewedRef.current) return; // only warn when unviewed results exist
      e.preventDefault();
      e.returnValue = 'You have unviewed sprint results — review them before leaving.';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isModerator]);

  // Is the Linear flow available on the server? (LINEAR_API_KEY configured.)
  useEffect(() => {
    api.linearStatus().then((r) => setLinearEnabled(r.enabled)).catch(() => {});
  }, []);

  // Show the subscription popup on every moderator login (unless already
  // subscribed), 2 seconds after entering the room so it zooms in over the UI.
  useEffect(() => {
    if (!subLoaded || subChecked.current || !isModerator || subscribed) return;
    subChecked.current = true;
    const t = setTimeout(() => setShowSubscribe(true), 2000);
    return () => clearTimeout(t);
  }, [isModerator, subscribed, subLoaded]);

  // Unlock the shared chat when a subscribed moderator is in a room that doesn't
  // yet have it on (i.e. they subscribed after creating the room).
  useEffect(() => {
    if (!isModerator || !session || session.chatEnabled || chatSynced.current) return;
    if (!subscribed) return;
    chatSynced.current = true;
    api.enableChat(code, participantId).then(({ session: s }) => setSession(s)).catch(() => {});
  }, [isModerator, subscribed, session, code, participantId]);

  // On a freshly revealed Linear-backed round, prefill the push value with the
  // median-nearest deck value — once per entry, so polling doesn't clobber a
  // manual selection.
  useEffect(() => {
    if (!session) return;
    const entry = session.history.find((h) => h.id === session.currentEntryId);
    if (session.status === 'revealed' && entry?.linearId && entry.id !== pushEntryId) {
      setPushEntryId(entry.id);
      setPushValue(nearestDeckValue(entry.median, session.deck));
    }
  }, [session, pushEntryId]);

  async function castVote(card: string) {
    if (!session || session.status !== 'voting') return;
    const next = myVote === card ? null : card; // click again to clear
    setMyVote(next); // optimistic
    try {
      const { session: s } = await api.vote(code, participantId, next);
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moderatorAction(fn: () => Promise<{ session: Session }>) {
    try {
      const { session: s } = await fn();
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addQueue() {
    const titles = queueDraft
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    if (titles.length === 0) return;
    setQueueDraft('');
    moderatorAction(() => api.addToQueue(code, participantId, titles));
  }

  async function importLinear() {
    const identifiers = linearDraft
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (identifiers.length === 0) return;
    try {
      const { session: s, missing } = await api.linearImport(code, participantId, identifiers);
      setSession(s);
      setLinearDraft('');
      setLinearMissing(missing);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Load the Linear "Estimation" view tickets into the queue (mock data for now;
  // becomes a live fetch once OAuth credentials are configured server-side).
  async function loadEstimation() {
    try {
      const { session: s } = await api.linearImportEstimation(code, participantId);
      setSession(s);
      setLinearConnected(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Tool picked from the picker → open its key-entry modal.
  function selectTool(tool: ToolId) {
    setShowToolPicker(false);
    setPendingTool(tool);
  }

  // Closing the key-entry modal steps back to the tool picker (not a full close).
  function backToPicker() {
    setPendingTool(null);
    setShowToolPicker(true);
  }

  // Read/write key entered → (mock) connect and load the estimation tickets. The
  // key isn't sent anywhere yet; real read/write lands with the provider adapter.
  function onToolConnected(tool: ToolId) {
    setPendingTool(null);
    setLinearConnected(true);
    setLinearNotice(
      `Connected to ${toolMeta[tool].name} (demo — sample tickets loaded; live read/write once the integration is wired).`,
    );
    loadEstimation();
  }

  async function pushToLinear(entryId: string) {
    const estimate = Number(pushValue);
    if (!Number.isInteger(estimate)) return;
    try {
      const { session: s } = await api.linearPush(code, participantId, entryId, estimate);
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function kickMember(targetId: string, targetName: string) {
    if (!window.confirm(`Remove ${targetName} from the room?`)) return;
    moderatorAction(() => api.kick(code, participantId, targetId));
  }

  // Header links are real anchors (to the invite URL) so Ctrl/Cmd/middle-click
  // opens a new tab. A plain left-click stays in-app via SPA navigation.
  function roomLinkClick(e: ReactMouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // allow open-in-new-tab
    e.preventDefault();
    onGoRoom();
  }

  function leave() {
    clearIdentity(code);
    onLeave();
  }

  // Moderator opens a retrospective for the room (PRO+ only, verified server-side
  // via the subscription order ref). The board carries this room's action items
  // from its previous retro; roomCode links them across sprints.
  async function startRetro() {
    if (!session) return;
    const subRef = getSubscriptionRef();
    if (!subRef) {
      setShowSubscribe(true);
      return;
    }
    const myName = session.participants.find((p) => p.id === participantId)?.name || 'Facilitator';
    try {
      const res = await retroApi.createBoard(`${session.name} — Retrospective`, myName, '', code, subRef);
      saveIdentity(res.board.code, res.participantId, myName);
      await api.setRetro(code, participantId, res.board.code).catch(() => {});
      onGoRetro(res.board.code);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function endRoom() {
    if (hasUnviewed) {
      window.alert('You have unviewed results — please review them before closing the room.');
    }
    if (!window.confirm('End this room for everyone? This cannot be undone.')) return;
    try {
      await api.end(code, participantId);
    } catch {
      /* even if it fails, leave locally */
    }
    clearIdentity(code);
    onLeave();
  }

  async function copyInvite() {
    // Invite link carries the code as a query param; the app reads it on open
    // and strips it from the URL, so the code isn't left in the address bar.
    const url = `${location.origin}/?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Invite link:', url);
    }
  }

  if (!participantId) return null;
  if (!session) {
    return (
      <div className="room-loading">
        {error ? <p className="error">{error}</p> : <p>Loading room…</p>}
      </div>
    );
  }

  // Only members vote — the moderator facilitates, so the tally excludes them.
  const voters = session.participants.filter((p) => !p.isModerator);
  const voted = voters.filter((p) => p.hasVoted).length;
  const total = voters.length;

  // The just-revealed round — used by the Linear "confirm & push estimate" control.
  const currentEntry = session.history.find((h) => h.id === session.currentEntryId);
  const showLinearPush = session.status === 'revealed' && !!currentEntry?.linearId;

  // Estimation list state: the story being voted now (selected), the pending
  // queue, and the already-estimated stories (greyed). Works for both Linear
  // tickets and manually-added tasks. The active story only appears as "current"
  // while voting, then moves to "done" once revealed.
  const currentStory =
    session.status === 'voting' && session.story
      ? {
          identifier: session.currentLinear?.identifier ?? null,
          title: session.currentLinear?.title ?? session.story,
          url: session.currentLinear?.url ?? null,
        }
      : null;
  const doneStories = session.history;
  const linearUrl = (identifier?: string | null, url?: string | null) =>
    url ?? (identifier ? `https://linear.app/trivinna/issue/${identifier}` : undefined);

  // Position-aware label for the Start button (first / next / last / only),
  // based purely on the queue — stories are always pulled from it.
  const queued = session.queue.length;
  const done = session.history.length;
  let startLabel = 'Start voting';
  if (queued > 0) {
    if (done === 0 && queued === 1) startLabel = 'Start story';
    else if (done === 0) startLabel = 'Start first story';
    else if (queued === 1) startLabel = 'Start last story';
    else startLabel = 'Start next story';
  }
  // Don't allow starting a round with nothing to estimate — require either a
  // Linear connection or at least one queued ticket.
  const canStart = linearConnected || queued > 0;

  return (
    <div className="room">
      <header className="room-header">
        <div className="room-meta">
          <a
            className="brand-link"
            href={`/?room=${session.code}`}
            title="Go to your room"
            onClick={roomLinkClick}
          >
            <span className="brand-mark-sm" aria-hidden>♠</span> SprintDeck
          </a>
          <a
            className="room-code"
            href={`/?room=${session.code}`}
            title="Go to your room"
            onClick={roomLinkClick}
          >
            {session.code}
          </a>
        </div>
        <div className="room-actions">
          <ThemeToggle />
          {isModerator &&
            (() => {
              const active = subscription;
              const plan = active ? tiers.find((t) => t.id === active.tier) : null;
              return (
                <button
                  className={`ghost upgrade-btn${plan ? ' current-plan' : ''}`}
                  onClick={() => setShowSubscribe(true)}
                  title={plan ? 'Your plan — tap to change' : 'Upgrade'}
                >
                  {plan ? <span className="upgrade-icon" aria-hidden>{plan.icon}</span> : <CrownIcon />}
                  {plan ? plan.name : 'Upgrade'}
                </button>
              );
            })()}
          <span className={`status-pill ${session.status}`}>
            {session.status === 'waiting' && 'Not started'}
            {session.status === 'voting' && `Voting · ${voted}/${total}`}
            {session.status === 'revealed' && (
              <>
                Revealed <span aria-hidden>🎉</span>
              </>
            )}
          </span>
          {isModerator && (
            <button
              className="ghost"
              title="View results"
              onClick={() => {
                setShowResults(true);
                setViewedCount(session.history.length); // mark all current results viewed
              }}
            >
              Results
              {hasUnviewed && <span className="badge">{unviewedCount}</span>}
            </button>
          )}
          {isModerator && (
            <button className="ghost" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Invite'}
            </button>
          )}
          {/* Retrospective (PRO+). If one is open for the room, everyone can join;
              otherwise a subscribed moderator can start one. */}
          {session.retroCode ? (
            <button className="ghost" onClick={() => onGoRetro(session.retroCode as string)}>
              Retrospective
            </button>
          ) : (
            isModerator &&
            subscribed && (
              <button className="ghost" onClick={startRetro}>
                Start Retro
              </button>
            )
          )}
          {isModerator ? (
            <button className="ghost danger" onClick={endRoom}>
              End room
            </button>
          ) : (
            <button className="ghost danger" onClick={leave}>
              Leave
            </button>
          )}
        </div>
      </header>

      <section className="participants">
        {session.participants.map((p) => {
          const showFace = session.status !== 'revealed';
          return (
            <div key={p.id} className={`seat ${p.hasVoted ? 'voted' : ''}`}>
              <div className="seat-name">
                {p.isModerator && <span className="crown" role="img" aria-label="Moderator" title="Moderator">★</span>}
                {p.name}
                {p.id === participantId && <span className="you"> (you)</span>}
              </div>
              <div className={`seat-card ${p.hasVoted ? 'flipped' : ''}`}>
                {isModerator && p.id !== session.moderatorId && (
                  <button
                    className="seat-kick"
                    title={`Remove ${p.name}`}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => kickMember(p.id, p.name)}
                  >
                    ×
                  </button>
                )}
                {session.status === 'revealed' ? (
                  <span className="seat-value">{p.vote ?? '–'}</span>
                ) : p.hasVoted ? (
                  <span className="seat-back" role="img" aria-label="Voted">✓</span>
                ) : (
                  <span className="seat-thinking" aria-hidden>{showFace ? '🤔' : ''}</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Section-level ad */}
      <AdBanner className="ad-section" />


      {/* Moderator controls */}
      {isModerator && (
        <>
          <div className="panel">
            <div className="panel-buttons">
              {session.status === 'waiting' && (
                <button
                  className="primary"
                  disabled={!canStart}
                  title={canStart ? undefined : 'Connect Linear or load tickets to estimate first'}
                  onClick={() => moderatorAction(() => api.start(code, participantId, ''))}
                >
                  {startLabel}
                </button>
              )}
              {session.status === 'voting' && (
                <>
                  <button
                    className="primary"
                    onClick={() => moderatorAction(() => api.reveal(code, participantId))}
                  >
                    Reveal cards
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.reset(code, participantId))}
                  >
                    Clear votes
                  </button>
                </>
              )}
              {session.status === 'revealed' && (
                <>
                  <button
                    className="primary"
                    onClick={() => moderatorAction(() => api.next(code, participantId))}
                  >
                    {queued > 0 ? 'Next story' : 'Next Vote'}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.reset(code, participantId))}
                  >
                    Vote again
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.finish(code, participantId))}
                  >
                    Finish
                  </button>
                </>
              )}
            </div>

            {/* Linear: confirm the agreed estimate and write it back to the issue */}
            {showLinearPush && currentEntry && (
              <div className="linear-push">
                {currentEntry.pushedEstimate != null ? (
                  <span className="linear-pushed">
                    ✓ {currentEntry.identifier} = {currentEntry.pushedEstimate} pushed to Linear
                  </span>
                ) : (
                  <>
                    <span className="linear-push-label">
                      Estimate for {currentEntry.identifier}
                      {currentEntry.median != null && (
                        <span className="muted"> · median {currentEntry.median}</span>
                      )}
                    </span>
                    <select
                      className="linear-push-select"
                      value={pushValue}
                      onChange={(e) => setPushValue(e.target.value)}
                    >
                      {session.deck.map((card) => (
                        <option key={card} value={card}>
                          {card}
                        </option>
                      ))}
                    </select>
                    <button className="primary" onClick={() => pushToLinear(currentEntry.id)}>
                      Push to Linear
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Linear — Connect (OAuth) + Estimation-view tickets */}
          <div className="queue-panel linear-panel">
            <div className="queue-head">
              <span className="queue-title">Linear · Estimation</span>
              <button
                className="linear-connect"
                onClick={() => setShowToolPicker(true)}
                disabled={linearConnected}
              >
                {linearConnected ? 'Connected · sample data' : 'Connect a project tool'}
              </button>
            </div>

            {linearNotice && <p className="linear-notice">{linearNotice}</p>}

            {currentStory || session.queue.length > 0 || doneStories.length > 0 ? (
              <ul className="queue-list est-list">
                {/* Story being estimated right now — selected/highlighted */}
                {currentStory && (
                  <li className="est-current">
                    <span className="est-dot" aria-hidden />
                    {currentStory.identifier &&
                      (() => {
                        const url = linearUrl(currentStory.identifier, currentStory.url);
                        return url ? (
                          <a className="q-badge q-link" href={url} target="_blank" rel="noreferrer">
                            {currentStory.identifier}
                          </a>
                        ) : (
                          <span className="q-badge">{currentStory.identifier}</span>
                        );
                      })()}
                    <span className="q-title">{currentStory.title}</span>
                    <span className="est-tag">Estimating…</span>
                  </li>
                )}

                {/* Up next — pending tickets */}
                {session.queue.map((q, i) => (
                  <li key={q.id}>
                    <span className="q-num">{i + 1}</span>
                    {q.identifier &&
                      (q.url ? (
                        <a className="q-badge q-link" href={q.url} target="_blank" rel="noreferrer">
                          {q.identifier}
                        </a>
                      ) : (
                        <span className="q-badge">{q.identifier}</span>
                      ))}
                    <span className="q-title">{q.title}</span>
                    {q.status && <span className="q-status">{q.status}</span>}
                    <button
                      className="q-remove"
                      title="Remove"
                      onClick={() => moderatorAction(() => api.removeFromQueue(code, participantId, q.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}

                {/* Already estimated — greyed out with the agreed points */}
                {doneStories.map((h) => {
                  const url = linearUrl(h.identifier, h.url);
                  return (
                    <li key={h.id} className="est-done">
                      {h.identifier &&
                        (url ? (
                          <a className="q-badge q-link" href={url} target="_blank" rel="noreferrer">
                            {h.identifier}
                          </a>
                        ) : (
                          <span className="q-badge">{h.identifier}</span>
                        ))}
                      <span className="q-title">{h.title}</span>
                      <span className="q-est">{h.pushedEstimate ?? h.median ?? '—'} pts</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="linear-empty">
                Connect a project management tool to load its estimation tickets, or add tasks manually below — then Start to estimate each one.
              </p>
            )}

            {/* Live paste-ID import — only when a server API key is configured */}
            {linearEnabled && (
              <div className="queue-add">
                <textarea
                  value={linearDraft}
                  placeholder="Paste Linear ticket IDs (e.g. ENG-876) — one per line or comma-separated"
                  rows={2}
                  onChange={(e) => setLinearDraft(e.target.value)}
                />
                <button className="ghost" disabled={!linearDraft.trim()} onClick={importLinear}>
                  Import from Linear
                </button>
              </div>
            )}
            {linearMissing.length > 0 && (
              <p className="linear-missing">Not found: {linearMissing.join(', ')}</p>
            )}

            {/* Manual entry — add tasks to estimate without Linear */}
            <div className="queue-add">
              <textarea
                value={queueDraft}
                placeholder="Add tasks manually — one per line (no Linear needed)"
                rows={2}
                onChange={(e) => setQueueDraft(e.target.value)}
              />
              <button className="ghost" disabled={!queueDraft.trim()} onClick={addQueue}>
                Add task
              </button>
            </div>
          </div>
        </>
      )}

      {!isModerator && session.status === 'waiting' && (
        <p className="wait-msg">Waiting for the moderator to start voting…</p>
      )}

      {/* The deck — voting cards are for members only; the moderator facilitates
          the round but doesn't vote, so it's hidden from them. */}
      {!isModerator && (
        <section className={`deck ${session.status === 'voting' ? '' : 'disabled'}`}>
          {session.deck.map((card) => (
            <button
              key={card}
              className={`poker-card ${myVote === card ? 'selected' : ''}`}
              disabled={session.status !== 'voting'}
              aria-label={`Vote ${card}`}
              aria-pressed={myVote === card}
              onClick={() => castVote(card)}
            >
              <span className="corner tl">{card}</span>
              <span className="face">{card}</span>
              <span className="corner br">{card}</span>
            </button>
          ))}
        </section>
      )}

      {/* Team chat (PRO+) — team-members-only back-channel below the deck.
          The moderator unlocks it but never sees or joins it. */}
      {session.chatEnabled && !isModerator && (
        <Suspense fallback={null}>
          <ChatPanel code={code} participantId={participantId} />
        </Suspense>
      )}

      {error && <p className="error room-error">{error}</p>}

      {/* Page-level ad */}
      <AdBanner className="ad-page" />

      <Suspense fallback={null}>
        {showResults && (
          <ResultsModal
            sessionName={session.name}
            history={session.history}
            onClose={() => setShowResults(false)}
          />
        )}

        {showToolPicker && (
          <ConnectToolModal onClose={() => setShowToolPicker(false)} onSelect={selectTool} />
        )}

        {pendingTool && (
          <ToolConnectModal
            tool={pendingTool}
            onBack={backToPicker}
            onClose={() => setPendingTool(null)}
            onConnected={onToolConnected}
          />
        )}

        {showSubscribe && <SubscriptionModal onClose={() => setShowSubscribe(false)} />}
      </Suspense>
    </div>
  );
}
