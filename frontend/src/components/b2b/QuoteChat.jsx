import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import Button from '../common/Button';
import { b2bApi } from '../../services/b2bApi';
import { canWriteB2BQuoteMessage } from '../../constants/b2bQuoteStatus';

const fmtTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

export default function QuoteChat({ quoteId, quote, actorType = 'customer', pollMs = 3000 }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const shouldPinBottomRef = useRef(true);
  const writable = canWriteB2BQuoteMessage(quote);

  const loadMessages = useCallback(async (signal) => {
    if (!quoteId) return;
    try {
      setError('');
      const res = await b2bApi.getQuoteMessages(quoteId, { signal });
      if (signal?.aborted) return;
      setMessages(Array.isArray(res?.messages) ? res.messages : []);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      setError(err?.response?.data?.message || err?.message || 'Could not load messages.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadMessages(controller.signal);
    return () => controller.abort();
  }, [loadMessages]);

  useEffect(() => {
    if (!quoteId || !pollMs) return undefined;
    const timer = window.setInterval(() => {
      const controller = new AbortController();
      loadMessages(controller.signal);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [loadMessages, pollMs, quoteId]);

  useEffect(() => {
    if (!shouldPinBottomRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    shouldPinBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || sending || !writable) return;
    setSending(true);
    try {
      const res = await b2bApi.sendQuoteMessage(quoteId, { message });
      setDraft('');
      setMessages((current) => [...current, res.message].filter(Boolean));
      shouldPinBottomRef.current = true;
      const controller = new AbortController();
      await loadMessages(controller.signal);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 p-6 shadow-premium">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-text-primary">Messages</h2>
          <p className="text-xs font-semibold text-text-secondary">
            {writable ? 'Negotiation thread' : 'Read-only negotiation history'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadMessages(new AbortController().signal)}
          className="rounded-full p-2 text-text-secondary transition-colors hover:bg-stone-100 hover:text-text-primary dark:hover:bg-slate-900"
          title="Refresh messages"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-80 space-y-3 overflow-y-auto rounded-2xl bg-stone-50 p-4 dark:bg-slate-900/40"
      >
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-12 rounded-2xl bg-white/80 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-text-secondary">No messages yet.</p>
        ) : (
          messages.map((item) => {
            const mine = item.sender_type === actorType;
            const system = item.is_system_message || item.sender_type === 'system';
            return (
              <div key={item.id} className={`flex ${system ? 'justify-center' : mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={
                    system
                      ? 'max-w-[90%] rounded-full bg-blue-50 px-4 py-2 text-center text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                      : `max-w-[82%] rounded-2xl px-4 py-3 text-sm font-semibold ${
                          mine
                            ? 'bg-accent-primary text-white'
                            : 'bg-white text-text-primary border border-stone-100 dark:border-slate-700 dark:bg-slate-800'
                        }`
                  }
                >
                  {!system && (
                    <p className={`mb-1 text-[10px] font-black uppercase tracking-widest ${mine ? 'text-white/70' : 'text-text-secondary'}`}>
                      {item.sender_type === 'admin' ? 'Merchant' : 'Customer'}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{item.message}</p>
                  <p className={`mt-1 text-[10px] ${mine && !system ? 'text-white/70' : 'text-text-secondary'}`}>
                    {fmtTime(item.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700 dark:bg-red-950/25 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => loadMessages(new AbortController().signal)} className="underline">
            Retry
          </button>
        </div>
      )}

      {writable && (
        <div className="mt-4 flex gap-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Write a message..."
            className="min-w-0 flex-1 resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-text-primary outline-none focus:border-accent-primary dark:border-slate-700 dark:bg-slate-900"
          />
          <Button type="button" className="h-auto self-stretch gap-2" disabled={!draft.trim() || sending} onClick={sendMessage}>
            <Send size={16} /> Send
          </Button>
        </div>
      )}
    </div>
  );
}
