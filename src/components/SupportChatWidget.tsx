"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { QuickReply } from "@/lib/supportBot";

interface ChatMessage {
  role: "bot" | "user";
  text: string;
}

// Clyde-only support widget. There used to be a "live agent" escalation
// path here (a whole second mode that polled a Redis-backed chat session
// and an owner inbox) - that's gone. This is now just a chat window
// talking to the free AI assistant.
export default function SupportChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void send("", undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string, topicId?: string, isGreeting = false) => {
    if (!isGreeting) {
      if (!text.trim()) return;
      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");
    }
    setLoading(true);
    setQuickReplies([]);
    try {
      // Send the transcript so far (excluding the message just added above)
      // so Clyde has conversational context instead of answering each
      // message cold. Capped to keep the request payload/token usage bounded.
      const history = messages.slice(-20).map((m) => ({ role: m.role, text: m.text }));
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[70vh] max-h-[560px] flex-col overflow-hidden rounded-xl2 border border-surface-border bg-white shadow-card">
      <div className="border-b border-surface-border bg-neutral-900 px-4 py-3 text-white">
        <p className="text-sm font-semibold">Clyde</p>
        <p className="text-xs text-white/60">Usually replies instantly</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <div
                className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-brand text-brand-foreground" : "bg-surface-muted text-neutral-800"
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}
        {loading && <p className="text-xs text-neutral-400">Clyde is typing...</p>}
        <div ref={bottomRef} />
      </div>

      {quickReplies.length > 0 && (
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
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <button
          type="submit"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
