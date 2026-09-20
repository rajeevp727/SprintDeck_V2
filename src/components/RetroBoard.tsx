import { retroApi } from '../lib/retroApi';
import ReviewPanel from './RetroReviewPanel';
import RetroPeople from './RetroPeople';
import RetroHeader from './RetroHeader';
import RetroColumnView from './RetroColumn';
import AdBanner from './AdBanner';
import { useRetroBoard } from './useRetroBoard';

interface Props {
  code: string;
  onLeave: () => void;
  onMissingIdentity: () => void;
}

export default function RetroBoard({ code, onLeave, onMissingIdentity }: Props) {
  const {
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
  } = useRetroBoard(code, onLeave, onMissingIdentity);

  if (!participantId) return null;
  if (!board) {
    return (
      <div className="room-loading">
        {error ? <p className="error">{error}</p> : <p>Loading board…</p>}
      </div>
    );
  }

  const isFacilitator = board.facilitatorId === participantId;
  const me = board.participants.find((p) => p.id === participantId);

  return (
    <div className="retro">
      <RetroHeader
        board={board}
        me={me}
        isFacilitator={isFacilitator}
        copied={copied}
        showProfile={showProfile}
        showPeople={showPeople}
        showExport={showExport}
        onToggleProfile={() => setShowProfile((open) => !open)}
        onTogglePeople={() => setShowPeople((open) => !open)}
        onToggleExport={() => setShowExport((open) => !open)}
        onCopyInvite={copyInvite}
        onToggleVoting={() => run(() => retroApi.setVoting(code, participantId, !board.votingClosed))}
        onEnd={endRetro}
        onExit={exit}
        onLeave={leave}
      />

      {board.phase === 'review' ? (
        <ReviewPanel
          board={board}
          isFacilitator={isFacilitator}
          onToggle={(id) => run(() => retroApi.reviewToggle(code, participantId, id))}
          onOpen={() => run(() => retroApi.openBoard(code, participantId))}
        />
      ) : (
        <>
          {board.phase === 'ended' && (
            <div className="retro-ended">
              This retrospective has ended — the board is read-only.
              {isFacilitator && ' Export the results from the top bar.'}
            </div>
          )}
          <div className="retro-legend">
            {board.participants.map((p) => (
              <span key={p.id} className="retro-legend-item">
                <span className="retro-legend-dot" style={{ background: p.color }} />
                {p.name}
                {p.isFacilitator && <span className="crown"> ★</span>}
                {p.id === participantId && <span className="you"> (you)</span>}
              </span>
            ))}
          </div>

          {showPeople && (
            <RetroPeople
              board={board}
              participantId={participantId}
              isFacilitator={isFacilitator}
              onClose={() => setShowPeople(false)}
              onRemove={(targetId) => run(() => retroApi.removeParticipant(code, participantId, targetId))}
            />
          )}

          {Object.keys(typingNames).length > 0 && (
            <div className="retro-typing">
              {Object.values(typingNames).join(', ')}{' '}
              {Object.keys(typingNames).length === 1 ? 'is' : 'are'} typing…
            </div>
          )}

          <section className="retro-columns">
            {board.columns.map((col) => (
              <RetroColumnView
                key={col.id}
                column={col}
                board={board}
                participantId={participantId}
                isFacilitator={isFacilitator}
                onAdd={(text) => run(() => retroApi.addNote(code, participantId, col.id, text))}
                onEdit={(id, text) => run(() => retroApi.updateNote(code, participantId, id, { text }))}
                onDelete={(id) => run(() => retroApi.deleteNote(code, participantId, id))}
                onMove={(id, columnId) => run(() => retroApi.moveNote(code, participantId, id, columnId))}
                onVote={(id) => run(() => retroApi.voteNote(code, participantId, id))}
                onTyping={notifyTyping}
              />
            ))}
          </section>
        </>
      )}

      {error && <p className="error room-error">{error}</p>}

      <AdBanner className="ad-page" />
    </div>
  );
}
