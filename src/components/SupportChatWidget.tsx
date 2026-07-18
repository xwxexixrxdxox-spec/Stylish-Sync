"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { QuickReply } from "@/lib/supportBot";
import { getLiveChatSessionId, setLiveChatSessionId } from "@/lib/storage";

interface ChatMessage {
  role: "bot" | "user" | "agent" | "system";
  text: string;
}

interface LiveChatMessage {
  role: "customer" | "owner" | "system";
  text: string;
  at: string;
}

interface LiveChatSession {
  id: string;
  status: "open" | "closed";
  messages: LiveChatMessage[];
}

type Mode = "bot" | "connecting" | "live" | "closed";

const POLL_INTERVAL_MS = 4000;

function toDisplayMessage(m: LiveChatMessage): ChatMessage {
  if (m.role === "owner") return { role: "agent", text: m.text };
  if (m.role === "system") return { role: "system", text: m.text };
  return { role: "user", text: m.text };
}

export default function SupportChatWidget() {
  const [mode, setMode] = useState<Mode>("bot");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownMessageCountRef = useRef(0);

  useEffect(() => {
    void init();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const fetchSession = async (sessionId: string): Promise<LiveChatSession | null> => {
    try {
      const res = await fetch(`/api/live-chat/poll?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.session as LiveChatSession;
    } catch {
      return null;
    }
  };

  const init = async () => {
    const existingId = getLiveChatSessionId();
    if (!existingId) {
      await send("", undefined, true);
      return;
    }
    // Resume a chat the customer already started (e.g. after a reload).
    // If it's gone or was closed, fall back to the normal bot greeting
    // instead of leaving the widget stuck showing nothing.
    const session = await fetchSession(existingId);
    if (session && session.status === "open") {
      sessionIdRef.current = existingId;
      setMode("live");
      setMessages([
        { role: "system", text: "You're connected with support." },
        ...session.messages.map(toDisplayMessage),
      ]);
      knownMessageCountRef.current = session.messages.length;
      startPolling(existingId);
    } else {
      setLiveChatSessionId(null);
      await send("", undefined, true);
    }
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startPolling = (sessionId: string) => {
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      const session = await fetchSession(sessionId);
      if (!session) return;

      if (session.messages.length !== knownMessageCountRef.current) {
        knownMessageCountRef.current = session.messages.length;
        setMessages((prev) => {
          // Keep everything up through the "connected" system notice, then
          // replay the live transcript fresh from the server so the two
          // sides never drift out of sync.
          const connectIndex = prev.findIndex((m) => m.role === "system");
          const head = connectIndex >= 0 ? prev.slice(0, connectIndex + 1) : prev;
          return [...head, ...session.messages.map(toDisplayMessage)];
        });
      }

      if (session.status === "closed") {
        stopPolling();
        setMode("closed");
        setMessages((prev) => [
          ...prev,
          { role: "system", text: "This conversation has been marked resolved." },
        ]);
      }
    }, POLL_INTERVAL_MS);
  };

  const startLiveChat = async (initialMessage?: string) => {
    setMode("connecting");
    setQuickReplies([]);
    try {
      const res = await fetch("/api/live-chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: initialMessage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMode("bot");
        setMessages((m) => [
          ...m,
          { role: "bot", text: data.error ?? "Couldn't connect you to a live agent right now." },
        ]);
        return;
      }
      sessionIdRef.current = data.sessionId;
      setLiveChatSessionId(data.sessionId);
      knownMessageCountRef.current = initialMessage ? 1 : 0;
      setMode("live");
      setMessages((m) => [
        ...m,
        {
          role: "system",
          text: data.available
            ? "You're connected - a live agent has been notified and will be with you shortly."
            : `${data.availabilityLabel ?? "Our live agents are offline right now."} Your message has been saved and the team will follow up as soon as they're back.`,
        },
      ]);
      startPolling(data.sessionId);
    } catch {
      setMode("bot");
      setMessages((m) => [...m, { role: "bot", text: "Couldn't connect you to a live agent right now." }]);
    }
  };

  const sendLive = async (text: string) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    try {
      const res = await fetch("/api/live-chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.session) {
        knownMessageCountRef.current = data.session.messages.length;
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "system", text: "That message may not have sent - check your connection." },
      ]);
    }
  };

  const startOver = async () => {
    stopPolling();
    setLiveChatSessionId(null);
    sessionIdRef.current = null;
    knownMessageCountRef.current = 0;
    setMode("bot");
    setMessages([]);
    await send("", undefined, true);
  };

  const send = async (text: string, topicId?: string, isGreeting = false) => {
    if (mode === "live") {
      if (!text.trim()) return;
      await sendLive(text);
      return;
    }

    if (!isGreeting) {
      if (!text.trim()) return;
      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");
    }
    setLoading(true);
    setQuickReplies([]);
    try {
      // Send the transcript so far (excluding the message just added above)
      // so Juesika has conversational context instead of answering each
      // message cold. Capped to keep the request payload/token usage bounded.
      const history = messages
        .filter((m): m is ChatMessage & { role: "bot" | "user" } => m.role === "bot" || m.role === "user")
        .slice(-20)
        .map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: isGreeting ? "" : text, topicId, history }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessages((m) => [
          ...m,
          { role: "bot", text: body.error ?? "Support chat isn't available right now." },
        ]);
        return;
      }
      const turn = await res.json();
      setMessages((m) =>
        isGreeting ? [{ role: "bot", text: turn.reply }] : [...m, { role: "bot", text: turn.reply }]
      );
      setQuickReplies(turn.quickReplies ?? []);

      if (turn.escalateOffered) {
        await startLiveChat(isGreeting ? undefined : text);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLive = mode === "live" || mode === "closed";

  return (
    <div className="flex h-[70vh] max-h-[560px] flex-col overflow-hidden rounded-xl2 border border-surface-border bg-white shadow-card">
      <div className="border-b border-surface-border bg-neutral-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          {isLive && (
            <span
              className={`h-2 w-2 rounded-full ${mode === "closed" ? "bg-neutral-400" : "bg-green-400"}`}
              aria-hidden
            />
          )}
          <p className="text-sm font-semibold">
            {mode === "live"
              ? "Connected with Support"
              : mode === "connecting"
              ? "Connecting..."
              : mode === "closed"
              ? "Support (resolved)"
              : "Juesika"}
          </p>
        </div>
        <p className="text-xs text-white/60">
          {mode === "live" ? "A team member can see this conversation" : "Usually replies instantly"}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.role === "user" ? "justify-end" : m.role === "system" ? "justify-center" : "justify-start"
            }`}
          >
            {m.role === "system" ? (
              <p className="max-w-[90%] text-center text-xs text-neutral-400">{m.text}</p>
            ) : (
              <div className="max-w-[85%]">
                {m.role === "agent" && (
                  <p className="mb-0.5 px-1 text-[11px] font-medium text-neutral-400">Support agent</p>
                )}
                <div
                  className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-brand text-brand-foreground"
                      : m.role === "agent"
                      ? "border border-green-200 bg-green-50 text-neutral-800"
                      : "bg-surface-muted text-neutral-800"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            )}
          </div>
        ))}
        {(loading || mode === "connecting") && (
          <p className="text-xs text-neutral-400">
            {mode === "connecting" ? "Connecting you with support..." : "Juesika is typing..."}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {quickReplies.length > 0 && mode === "bot" && (
        <div className="flex flex-wrap gap-2 border-t border-surface-border px-4 py-2">
          {quickReplies.map((q) => (
            <button
              key={q.id}
              onClick={() => send(q.label, q.id)}
              className="rounded-full border border-surface-border px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {mode === "closed" ? (
        <div className="border-t border-surface-border p-3 text-center">
          <button
            onClick={startOver}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Start a new chat
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-surface-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "live" ? "Message support..." : "Type a message..."}
            disabled={mode === "connecting"}
            className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={mode === "connecting"}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
