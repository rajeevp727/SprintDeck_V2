import type { RetroBoard as RetroBoardType } from '../lib/retroTypes';
import { exportDoc, retroExportDoc, exportFormats } from '../lib/retroExport';

interface Me {
  id: string;
  name: string;
  color: string;
  isFacilitator: boolean;
}

interface Props {
  board: RetroBoardType;
  me?: Me;
  isFacilitator: boolean;
  copied: boolean;
  showProfile: boolean;
  showPeople: boolean;
  showExport: boolean;
  onToggleProfile: () => void;
  onTogglePeople: () => void;
  onToggleExport: () => void;
  onCopyInvite: () => void;
  onToggleVoting: () => void;
  onEnd: () => void;
  onExit: () => void;
  onLeave: () => void;
}

export default function RetroHeader({
  board,
  me,
  isFacilitator,
  copied,
  showProfile,
  showPeople,
  showExport,
  onToggleProfile,
  onTogglePeople,
  onToggleExport,
  onCopyInvite,
  onToggleVoting,
  onEnd,
  onExit,
  onLeave,
}: Props) {
  const ended = board.phase === 'ended';

  return (
      <header className="room-header">
        <div className="room-meta">
          <span className="room-code" title="Board code">
            {board.code}
          </span>
          <h2>{board.name}</h2>
        </div>
        <div className="room-actions">
          {me && (
            <div className="profile">
              <button
                className="profile-btn"
                title="Your profile"
                style={{ background: me.color }}
                onClick={onToggleProfile}
              >
                {me.name.charAt(0).toUpperCase()}
              </button>
              {showProfile && (
                <div className="profile-menu">
                  <div className="profile-name">{me.name}</div>
                  <div className="profile-row">
                    <span className="muted">Role</span>
                    <span>{me.isFacilitator ? 'Facilitator' : 'Member'}</span>
                  </div>
                  <div className="profile-row">
                    <span className="muted">Colour</span>
                    <span className="profile-swatch" style={{ background: me.color }} />
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="status-pill status-pill-button"
            onClick={onTogglePeople}
            title="Who is in this board"
            aria-expanded={showPeople}
          >
            {board.participants.length} in board
          </button>
          {isFacilitator && (
            <button className="ghost" onClick={onCopyInvite}>
              {copied ? 'Copied!' : 'Invite'}
            </button>
          )}
          {isFacilitator && !ended && (
            <button
              className="ghost"
              onClick={onToggleVoting}
              title={
                board.votingClosed
                  ? 'Let the team vote again'
                  : 'Freeze the tally and sort each column by votes'
              }
            >
              {board.votingClosed ? 'Reopen voting' : 'Close voting'}
            </button>
          )}
          {}
          {isFacilitator && ended && (
            <div className="profile">
              <button className="ghost" title="Export the retrospective" onClick={onToggleExport}>
                Export ▾
              </button>
              {showExport && (
                <div className="profile-menu export-menu">
                  {exportFormats.map((f) => (
                    <button
                      key={f.format}
                      className="export-item"
                      onClick={() => {
                        exportDoc(f.format, retroExportDoc(board));
                        onToggleExport();
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!isFacilitator ? (
            <button className="ghost danger" onClick={onLeave}>
              Leave Retrospective
            </button>
          ) : ended ? (
            <button className="ghost danger" onClick={onExit}>
              Exit
            </button>
          ) : (
            <button className="ghost danger" onClick={onEnd}>
              End Retrospective
            </button>
          )}
        </div>
      </header>
  );
}
