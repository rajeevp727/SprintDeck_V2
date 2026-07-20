import { WebPubSubClient } from '@azure/web-pubsub-client';
import { api } from './api';
import type { ChatMessage } from './types';

export interface ChatConnection {
  stop: () => void;
}

// Connect to the room's Web PubSub group and stream chat messages. The access
// URL is fetched (and re-fetched on reconnect) via the negotiate endpoint.
export async function connectChat(
  code: string,
  participantId: string,
  onMessage: (message: ChatMessage) => void,
): Promise<ChatConnection> {
  const client = new WebPubSubClient({
    getClientAccessUrl: async () => (await api.negotiateChat(code, participantId)).url,
  });

  client.on('group-message', (e) => {
    const data = e.message.data as { type?: string; message?: ChatMessage };
    if (data?.type === 'message' && data.message) onMessage(data.message);
  });

  await client.start();
  try {
    await client.joinGroup(code);
  } catch {
    /* the access token already joins us to the group; a rejoin race is harmless */
  }

  return { stop: () => client.stop() };
}
