import { WebPubSubClient } from '@azure/web-pubsub-client';
import { api } from './api';
import type { ChatEvent } from './types';

export interface ChatConnection {
  stop: () => void;
}

// Connect to the room's Web PubSub group and stream chat events (new messages
// and like updates). The access URL is fetched (and re-fetched on reconnect)
// via the negotiate endpoint.
export async function connectChat(
  code: string,
  participantId: string,
  onEvent: (event: ChatEvent) => void,
): Promise<ChatConnection> {
  const client = new WebPubSubClient({
    getClientAccessUrl: async () => (await api.negotiateChat(code, participantId)).url,
  });

  client.on('group-message', (e) => {
    const data = e.message.data as ChatEvent;
    if (data?.type === 'message' || data?.type === 'like') onEvent(data);
  });

  await client.start();
  try {
    await client.joinGroup(code);
  } catch {
    /* the access token already joins us to the group; a rejoin race is harmless */
  }

  return { stop: () => client.stop() };
}
