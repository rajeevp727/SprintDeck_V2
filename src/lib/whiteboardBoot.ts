import { displayNameFor, refreshUser, type AuthUser } from './auth';
import { getIdentity, getCurrentRoom, saveIdentity } from './storage';
import { getSubscriptionRef, isSubscribed, refreshSubscription } from './subscription';
import { whiteboardApi } from './whiteboardApi';

export class WhiteboardNeedsPro extends Error {
  override name = 'WhiteboardNeedsPro';
}

export async function bootWhiteboardForUser(user: AuthUser, boardName = 'Team whiteboard'): Promise<string> {
  await refreshSubscription();
  if (!isSubscribed()) throw new WhiteboardNeedsPro();

  const profile = (await refreshUser()) || user;
  const name = displayNameFor(profile) || 'Host';
  const roomCode = getCurrentRoom();
  const roomIdentity = roomCode ? getIdentity(roomCode) : null;
  const res = await whiteboardApi.createBoard({
    name: boardName,
    facilitatorName: name,
    roomCode: roomCode || undefined,
    roomParticipantId: roomIdentity?.participantId,
    subRef: getSubscriptionRef() ?? '',
    access: roomCode ? 'room' : 'open',
  });
  saveIdentity(res.whiteboard.code, res.participantId, name);
  return res.whiteboard.code;
}

export async function joinWhiteboardForUser(
  user: AuthUser,
  code: string,
  options?: { shareToken?: string },
): Promise<string> {
  const profile = (await refreshUser()) || user;
  const name = displayNameFor(profile) || 'Host';
  const boardCode = code.trim().toUpperCase();
  const roomCode = getCurrentRoom();
  const roomIdentity = roomCode ? getIdentity(roomCode) : null;
  const existing = getIdentity(boardCode);
  const res = await whiteboardApi.joinBoard(boardCode, {
    name,
    shareToken: options?.shareToken,
    roomCode: roomCode || undefined,
    roomParticipantId: roomIdentity?.participantId,
    participantId: existing?.participantId,
  });
  saveIdentity(res.whiteboard.code, res.participantId, name);
  return res.whiteboard.code;
}
