import { useActiveRooms, type ActiveRoom } from '../lib/auth';

interface Props {
  onResume: (room: ActiveRoom) => void;
}

const labels: Record<ActiveRoom['kind'], string> = {
  poker: 'Sprint Planning',
  retro: 'Sprint Retrospective',
  whiteboard: 'Whiteboard',
};

// A board outlives neither the 8-hour cap the server puts on it nor a device
// that closed without saying goodbye, so anything older is not offered.
const staleAfterMs = 8 * 60 * 60 * 1000;

/** Rooms open on this account's other devices, offered as one-click resumes. */
export default function ResumeRooms({ onResume }: Props) {
  const rooms = useActiveRooms().filter((r) => Date.now() - r.at < staleAfterMs);
  if (rooms.length === 0) return null;

  return (
    <div className="dash-resume">
      <span className="dash-resume-lead">Open on your other devices</span>
      {rooms.map((room) => (
        <button key={room.kind} type="button" className="ghost dash-resume-btn" onClick={() => onResume(room)}>
          {labels[room.kind]} · <strong>{room.code}</strong>
        </button>
      ))}
    </div>
  );
}
