import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { connectChat, type ChatConnection } from '../lib/chat';
import type { ChatEvent, ChatLike, ChatMessage, ChatReply } from '../lib/types';

const MaxInputLen = 2000;
const QuoteExcerptLen = 140;

interface Props {
  code: string;
  participantId: string;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// The liker's display name — self shows as "*You".
function likerName(like: ChatLike, myId: string): string {
  return like.id === myId ? '*You' : like.name || 'Someone';
}

// aria-label for the like badge: "Liked by *You, Alice".
function likeTitle(likes: ChatLike[], myId: string): string {
  return `Liked by ${likes.map((l) => likerName(l, myId)).join(', ')}`;
}

interface MessageItemProps {
  message: ChatMessage;
  mine: boolean;
  myId: string;
  likedByMe: boolean;
  onReply: (message: ChatMessage) => void;
  onLike: (message: ChatMessage) => void;
  onShowLikers: (likes: ChatLike[], anchor: HTMLElement) => void;
  onHideLikers: () => void;
}

function MessageItem({
  message,
  mine,
  myId,
  likedByMe,
  onReply,
  onLike,
  onShowLikers,
  onHideLikers,
}: MessageItemProps) {
  const likes = message.likes ?? [];
  return (
    <div className={`chat-msg-row ${mine ? 'mine' : ''}`}>
      <div className="chat-msg">
        {message.replyTo && (
          <div className="chat-quote">
            <span className="chat-quote-name">↩ {message.replyTo.name}</span>
            <span className="chat-quote-text">{message.replyTo.excerpt}</span>
          </div>
        )}
        <div className="chat-msg-head">
          <span className="chat-msg-name">{mine ? 'You' : message.name}</span>
          <span className="chat-msg-time">{formatTime(message.at)}</span>
        </div>
        <div className="chat-msg-text">{message.text}</div>
      </div>
      <div className="chat-msg-under">
        {/* Persistent like indicator — shown whenever the message has likes.
            Hover for the list of who liked; click to toggle your own like. */}
        {likes.length > 0 && (
          <button
            className={`chat-likes-badge ${likedByMe ? 'liked' : ''}`}
            aria-label={likeTitle(likes, myId)}
            onClick={() => onLike(message)}
            onMouseEnter={(e) => onShowLikers(likes, e.currentTarget)}
            onMouseLeave={onHideLikers}
          >
            👍 <span className="chat-likes-count">{likes.length}</span>
          </button>
        )}
        {/* Hover-only actions. The Like button is dropped once the message has
            likes — the badge above handles liking then; only Reply remains. */}
        <div className="chat-msg-actions">
          {likes.length === 0 && (
            <button className="chat-act" aria-label="Like" onClick={() => onLike(message)}>
              👍
            </button>
          )}
          <button className="chat-act" aria-label="Reply" onClick={() => onReply(message)}>
            ↩️
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({ code, participantId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReply | null>(null);
  const [open, setOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [likeTip, setLikeTip] = useState<{
    likes: ChatLike[];
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const openRef = useRef(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLElement | null>(null);
  openRef.current = open;

  const addMessage = useCallback((message: ChatMessage) => {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((prev) => [...prev, message]);
    if (!openRef.current) setUnread((n) => n + 1);
  }, []);

  const applyLike = useCallback((messageId: string, likes: ChatLike[]) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, likes } : m)));
  }, []);

  const onEvent = useCallback(
    (ev: ChatEvent) => {
      if (ev.type === 'message') addMessage(ev.message);
      else if (ev.type === 'like') applyLike(ev.messageId, ev.likes);
    },
    [addMessage, applyLike],
  );

  useEffect(() => {
    let conn: ChatConnection | null = null;
    let stopped = false;
    (async () => {
      try {
        const { messages: history } = await api.chatHistory(code, participantId);
        history.forEach((m) => seen.current.add(m.id));
        setMessages(history.map((m) => ({ ...m, likes: m.likes ?? [] })));
      } catch {
        /* history is best-effort */
      }
      try {
        conn = await connectChat(code, participantId, onEvent);
        if (stopped) conn.stop();
      } catch {
        /* live channel unavailable — history still renders */
      }
    })();
    return () => {
      stopped = true;
      conn?.stop();
    };
  }, [code, participantId, onEvent]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  // Position the who-liked list relative to the chat panel so it stays inside
  // the window (not portaled to the body, where it overflowed outside).
  const showLikers = useCallback((likes: ChatLike[], anchor: HTMLElement) => {
    const chat = chatRef.current;
    if (!chat) return;
    const a = anchor.getBoundingClientRect();
    const c = chat.getBoundingClientRect();
    const above = a.top - c.top > 110; // enough room above inside the panel?
    // Left-align to the badge, clamped so the tooltip never spills outside the
    // panel (panel has overflow:hidden, so a centered tip near the edge clips).
    const tipWidth = 230;
    const x = Math.max(8, Math.min(a.left - c.left, c.width - tipWidth - 8));
    setLikeTip({ likes, x, y: (above ? a.top : a.bottom) - c.top, above });
  }, []);
  const hideLikers = useCallback(() => setLikeTip(null), []);

  function toggle() {
    setOpen((o) => {
      if (!o) setUnread(0);
      return !o;
    });
  }

  function startReply(message: ChatMessage) {
    setReplyTo({ id: message.id, name: message.name, excerpt: message.text.slice(0, QuoteExcerptLen) });
  }

  async function like(message: ChatMessage) {
    try {
      const { likes } = await api.likeChatMessage(code, participantId, message.id);
      applyLike(message.id, likes);
    } catch {
      /* ignore */
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const reply = replyTo;
    setInput('');
    setReplyTo(null);
    try {
      const { message } = await api.sendChatMessage(code, participantId, text, reply);
      addMessage(message);
    } catch {
      setInput(text); // restore the draft so nothing is lost
      setReplyTo(reply);
    }
  }

  // Likers most-recent first for the hover list.
  const tipLikes = likeTip ? [...likeTip.likes].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) : [];

  return (
    <section className={`chat ${open ? 'open' : ''}`} ref={chatRef}>
      <button className="chat-head" onClick={toggle} aria-expanded={open}>
        <span className="chat-title">
          <span aria-hidden>💬</span> Team chat
        </span>
        {!open && unread > 0 && <span className="chat-unread">{unread}</span>}
        <span className="chat-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <>
          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 ? (
              <p className="chat-empty">No messages yet — say hello 👋</p>
            ) : (
              messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  mine={m.participantId === participantId}
                  myId={participantId}
                  likedByMe={(m.likes ?? []).some((l) => l.id === participantId)}
                  onReply={startReply}
                  onLike={like}
                  onShowLikers={showLikers}
                  onHideLikers={hideLikers}
                />
              ))
            )}
          </div>

          {replyTo && (
            <div className="chat-replying">
              <div className="chat-replying-info">
                <span className="chat-quote-name">↩ Replying to {replyTo.name}</span>
                <span className="chat-quote-text">{replyTo.excerpt}</span>
              </div>
              <button
                className="chat-reply-cancel"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
              >
                ×
              </button>
            </div>
          )}

          <form className="chat-compose" onSubmit={send}>
            <input
              value={input}
              maxLength={MaxInputLen}
              placeholder="Message the team…"
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="primary" type="submit" disabled={!input.trim()}>
              Send
            </button>
          </form>
        </>
      )}

      {likeTip && tipLikes.length > 0 && (
        <div
          className={`chat-like-tip ${likeTip.above ? 'above' : 'below'}`}
          style={{ left: likeTip.x, top: likeTip.y }}
        >
          {tipLikes.length === 1 ? (
            <div className="chat-like-tip-single">
              Liked by{' '}
              <span className={`chat-like-tip-name ${tipLikes[0].id === participantId ? 'you' : ''}`}>
                {likerName(tipLikes[0], participantId)}
              </span>
            </div>
          ) : (
            <>
              <div className="chat-like-tip-head">Liked by</div>
              <ul>
                {tipLikes.map((l) => (
                  <li key={l.id}>
                    <span className={`chat-like-tip-name ${l.id === participantId ? 'you' : ''}`}>
                      {likerName(l, participantId)}
                    </span>
                    {l.at ? <span className="chat-like-tip-time">{formatTime(l.at)}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
