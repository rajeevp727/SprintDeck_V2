import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { connectChat, type ChatConnection } from '../lib/chat';
import type { ChatEvent, ChatMessage, ChatReply } from '../lib/types';

const MaxInputLen = 2000;
const QuoteExcerptLen = 140;

interface Props {
  code: string;
  participantId: string;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessageItemProps {
  message: ChatMessage;
  mine: boolean;
  likedByMe: boolean;
  onReply: (message: ChatMessage) => void;
  onLike: (message: ChatMessage) => void;
}

function MessageItem({ message, mine, likedByMe, onReply, onLike }: MessageItemProps) {
  const likeCount = message.likes?.length ?? 0;
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
      <div className="chat-msg-actions">
        <button
          className={`chat-act ${likedByMe ? 'active' : ''}`}
          title={likedByMe ? 'Unlike' : 'Like'}
          aria-label={likedByMe ? 'Unlike' : 'Like'}
          onClick={() => onLike(message)}
        >
          👍{likeCount > 0 && <span className="chat-act-count">{likeCount}</span>}
        </button>
        <button className="chat-act" title="Reply" aria-label="Reply" onClick={() => onReply(message)}>
          ↩️
        </button>
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
  const seen = useRef<Set<string>>(new Set());
  const openRef = useRef(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  openRef.current = open;

  const addMessage = useCallback((message: ChatMessage) => {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((prev) => [...prev, message]);
    if (!openRef.current) setUnread((n) => n + 1);
  }, []);

  const applyLike = useCallback((messageId: string, likes: string[]) => {
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

  return (
    <section className={`chat ${open ? 'open' : ''}`}>
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
                  likedByMe={(m.likes ?? []).includes(participantId)}
                  onReply={startReply}
                  onLike={like}
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
    </section>
  );
}
