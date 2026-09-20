import { useEffect, useState } from 'react';

export const votingMinutes = [2, 3, 5, 8, 10];
export const extendMinutes = [1, 2, 3];
/** How close to the end the extend buttons appear. */
const extendWindowMs = 10_000;

/** Whether the clock is running right now, ticking so the board reacts at 0:00. */
export function useVotingRunning(votingClosed: boolean, votingEndsAt?: number | null): boolean {
  const over = useVotingOver(votingClosed, votingEndsAt);
  return !over && !!votingEndsAt;
}

/** True once the facilitator has closed voting, or the deadline has passed. */
export function useVotingOver(votingClosed: boolean, votingEndsAt?: number | null): boolean {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (votingClosed || !votingEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [votingClosed, votingEndsAt]);

  if (votingClosed) return true;
  return !!votingEndsAt && now >= votingEndsAt;
}

interface Props {
  isFacilitator: boolean;
  votingClosed: boolean;
  votingEndsAt?: number | null;
  onStart: (minutes: number) => void;
  onStop: () => void;
  onExtend: (minutes: number) => void;
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The voting clock: the facilitator sets it, everyone watches the same one. */
export default function RetroVoting({
  isFacilitator,
  votingClosed,
  votingEndsAt,
  onStart,
  onStop,
  onExtend,
}: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (votingClosed || !votingEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [votingClosed, votingEndsAt]);

  const running = !votingClosed && !!votingEndsAt;
  const remaining = running ? (votingEndsAt as number) - now : 0;

  if (votingClosed) {
    return (
      <div className="retro-voting closed">
        <span>Voting closed — columns are sorted by votes.</span>
        {isFacilitator && (
          <button type="button" className="ghost" onClick={onStop}>
            Reopen voting
          </button>
        )}
      </div>
    );
  }

  if (running) {
    return (
      <div className={`retro-voting running${remaining <= 30_000 ? ' ending' : ''}`}>
        <span className="retro-voting-clock" role="timer">
          {mmss(remaining)}
        </span>
        <span>left to vote</span>
        {isFacilitator && remaining <= extendWindowMs && (
          <>
            <span className="retro-voting-extend-label">Need longer?</span>
            {extendMinutes.map((m) => (
              <button key={m} type="button" className="ghost retro-voting-min" onClick={() => onExtend(m)}>
                +{m} min
              </button>
            ))}
          </>
        )}
        {isFacilitator && (
          <button type="button" className="ghost" onClick={onStop}>
            Stop voting now
          </button>
        )}
      </div>
    );
  }

  if (!isFacilitator) {
    return <div className="retro-voting">Add your thoughts — voting opens when the facilitator starts it.</div>;
  }

  return (
    <div className="retro-voting">
      <span>Start voting for</span>
      {votingMinutes.map((m) => (
        <button key={m} type="button" className="ghost retro-voting-min" onClick={() => onStart(m)}>
          {m} min
        </button>
      ))}
    </div>
  );
}
