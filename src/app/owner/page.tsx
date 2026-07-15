"use client";

import { useEffect, useRef, useState } from "react";

interface LiveChatMessage {
  role: "customer" | "owner" | "system";
  text: string;
  at: string;
}

interface LiveChatSession {
  id: string;
  customerId: string;
  email: string | null;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  messages: LiveChatMessage[];
}

const LIST_POLL_MS = 5000;
const SESSION_POLL_MS = 3500;

// Password-gated owner inbox for the live-chat feature. Not linked from
// anywhere in the customer-facing UI - reached only by knowing the URL
// (/owner) - and excluded from search indexing (see public/robots.txt).
// Auth state isn't tracked in localStorage; every load just asks the API,
// which reports 401 until a valid isc_owner cookie is present.
export default function OwnerInboxPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [sessions, setSessions] = useState<LiveChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<LiveChatSession | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const listTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshList();
    return () => {
      if (listTimerRef.current) clearInterval(listTimerRef.current);
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authed) {
      listTimerRef.current = setInterval(refreshList, LIST_POLL_MS);
    }
    return () => {
      if (listTimerRef.current) clearInterval(listTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (!selectedId) {
      setSelectedSession(null);
      return;
    }
    void refreshSelected(selectedId);
    sessionTimerRef.current = setInterval(() => refreshSelected(selectedId), SESSION_POLL_MS);
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedSession?.messages.length]);

  const refreshList = async () => {
    try {
      const res = await fetch("/api/live-chat/list");
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setAuthed(true);
      setSessions(data.sessions ?? []);
    } catch {
      // transient network error - leave current state as-is, next poll retries
    }
  };

  const refreshSelected = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/live-chat/poll?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedSession(data.session ?? null);
    } catch {
      // ignore, next poll retries
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error ?? "Login failed.");
        return;
      }
      setPassword("");
      setAuthed(true);
      await refreshList();
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    await fetch("/api/owner/logout", { method: "POST" }).catch(() => {});
    setAuthed(false);
    setSessions([]);
    setSelectedId(null);
    setSelectedSession(null);
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    const text = reply.trim();
    setReply("");
    try {
      const res = await fetch("/api/live-chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.session) setSelectedSession(data.session);
    } finally {
      setSending(false);
    }
  };

  const markResolved = async () => {
    if (!selectedId) return;
    const res = await fetch("/api/live-chat/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selectedId }),
    });
    if (res.ok) {
      setSelectedId(null);
      setSelectedSession(null);
      void refreshList();
    }
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">Loading...</div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <form
          onSubmit={login}
          className="w-full max-w-xs space-y-3 rounded-xl2 border border-surface-border bg-white p-6 shadow-card"
        >
          <h1 className="text-base font-semibold text-neutral-900">Owner Inbox</h1>
          <p className="text-xs text-neutral-500">Enter the dashboard password to view live chats.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          {loginError && <p className="text-xs text-accent-low">{loginError}</p>}
          <button
            type="submit"
            disabled={loggingIn || !password}
            className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loggingIn ? "Checking..." : "Log in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <div className="flex items-center justify-between border-b border-surface-border bg-white px-4 py-3">
        <h1 className="text-sm font-semibold text-neutral-900">Live Chat Inbox</h1>
        <button onClick={logout} className="text-xs font-medium text-neutral-500 hover:text-neutral-800">
          Log out
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-full max-w-xs overflow-y-auto border-r border-surface-border bg-white">
          {sessions.length === 0 ? (
            <p className="p-4 text-xs text-neutral-400">No open conversations right now.</p>
          ) : (
            sessions.map((s) => {
              const last = s.messages[s.messages.length - 1];
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`block w-full border-b border-surface-border px-4 py-3 text-left hover:bg-surface-muted ${
                    selectedId === s.id ? "bg-surface-muted" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-neutral-900">{s.email ?? "Customer"}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{last ? last.text : "(no message yet)"}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-400">{formatTime(s.updatedAt)}</p>
                </button>
              );
            })
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {!selectedSession ? (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-surface-border bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {selectedSession.email ?? "Customer"}
                  </p>
                  <p className="text-xs text-neutral-400">Started {formatTime(selectedSession.createdAt)}</p>
                </div>
                <button
                  onClick={markResolved}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
                >
                  Mark resolved
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {selectedSession.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "owner" ? "justify-end" : m.role === "system" ? "justify-center" : "justify-start"
                    }`}
                  >
                    {m.role === "system" ? (
                      <p className="max-w-[90%] text-center text-xs text-neutral-400">{m.text}</p>
                    ) : (
                      <div
                        className={`max-w-[75%] whitespace-pre-line rounded-xl px-3 py-2 text-sm ${
                          m.role === "owner"
                            ? "bg-neutral-900 text-white"
                            : "bg-surface-muted text-neutral-800"
                        }`}
                      >
                        {m.text}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendReply();
                }}
                className="flex items-center gap-2 border-t border-surface-border bg-white p-3"
              >
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to customer..."
                  className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <button
                  type="submit"
                  disabled={sending || !reply.trim()}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
