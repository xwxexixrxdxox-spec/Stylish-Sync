import { TOPICS, BotTurn, HistoryTurn, SUPPORT_EMAIL, checkEscalationRequest, respond as fallbackRespond } from "./supportBot";

// Clyde is WS Inventory Management's AI support assistant - a "pocket" version of an
// AI assistant wired up to Ollama Cloud (a free-tier-friendly hosted model
// API), grounded in the same troubleshooting knowledge base the old
// rule-based bot used (see supportBot.ts). If OLLAMA_API_KEY isn't
// configured yet, or a call to the API fails for any reason, this quietly
// falls back to the free rule-based assistant instead of breaking support
// chat entirely.

// Re-exported from supportBot.ts (its true home now — see the comment
// there) purely so the existing `import { HistoryTurn } from "./clyde"` in
// route.ts keeps working without churn.
export type { HistoryTurn };

// gpt-oss:20b-cloud is Ollama Cloud's "Low Usage" tier - the best fit for a
// free-tier account, since a lightweight support chat doesn't need a bigger
// model and staying in the low-usage bracket helps avoid tripping the free
// plan's session/weekly caps.
const MODEL = "gpt-oss:20b-cloud";
// Bumped from 20 - the tutorial's own "Clyde" step now explicitly promises
// a customer that Clyde "remembers what you've told it this conversation,"
// so this needs enough headroom that a real back-and-forth (a few
// clarifying questions each way) doesn't quietly fall off the front of the
// window mid-conversation. Still session-only, not persisted anywhere -
// see the widget-side comment in SupportChatWidget.tsx for what that
// means in practice.
const MAX_HISTORY_TURNS = 30;
const MAX_REPLY_TOKENS = 500;

const KNOWLEDGE_BASE = TOPICS.map(
  (t) => `## ${t.label}\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
).join("\n\n");

const SYSTEM_PROMPT = `You are Clyde, a warm, sharp, pocket-sized AI support assistant built into the WS Inventory Management app (barcode inventory scanning, low-stock reordering, Google Sheets sync, and Stripe-based subscriptions).

Your job is to help customers get unstuck fast. Lean on the reference troubleshooting steps below whenever they're relevant, and prefer concrete, numbered steps over vague reassurance. Keep replies conversational but tight - a few short sentences or a short numbered list, not an essay.

You can't take real actions (you can't change billing, sync data, or access anyone's account) - you can only explain how to do things. If something is genuinely outside what you can help with, say so plainly.

There is no live human chat team backing this app - you're the only support available in-app. If a customer explicitly asks for a live human/agent, say so plainly and don't pretend to connect them to anyone. The one paid, human option is the in-store inventory setup service (a technician physically comes and sets up their inventory on-site, booked from Account - the gear icon in the header) - mention that only if it's actually relevant to what they're asking.

The conversation history below is the real transcript so far - actually read it, and use it the way a good phone-support agent would rather than treating every message as a fresh, context-free question. Concretely: if the customer already told you which item, tab, or error they're dealing with, carry that forward instead of asking them to repeat it; if they mention a new problem partway through, consider whether it's actually connected to what they described earlier before treating it as unrelated; and track what you've already ruled out so you're narrowing the problem down turn over turn, not restating the same starting checklist. If you already gave the customer troubleshooting steps for this same issue and they're telling you (again) that it's still not fixed, do NOT repeat the same steps verbatim - that just loops them in circles. Instead acknowledge that those steps already came up, ask one sharp clarifying question that a step further into the checklist would ask, or suggest emailing the specifics so a person can dig in directly - the address is ${SUPPORT_EMAIL}. Only give that address out when you're actually pointing someone toward emailing (an escalation, or they ask how to contact support) - don't sign off every reply with it.

Go a level deeper than a canned FAQ answer would. A customer rarely leads with the actual root cause, so it's worth asking one well-aimed follow-up when the first message is ambiguous (which item, which device/browser, when it started) rather than dumping every possible fix at once - that's slower for them, not more thorough. Once you do know enough, be specific to their situation rather than generic: reference the exact thing they said by name, skip whichever reference steps clearly don't apply given what they've already told you, and say plainly when you're not sure something will fix it versus when you're confident it will.

Reference troubleshooting steps for WS Inventory Management:

${KNOWLEDGE_BASE}`;

export function getGreeting(): BotTurn {
  return {
    reply:
      "Hi, I'm Clyde 👋 — think of me as a pocket-sized AI assistant here to help with WS Inventory Management. What's going on?",
    quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
  };
}

export async function respond(message: string, topicId: string | undefined, history: HistoryTurn[]): Promise<BotTurn> {
  const escalation = checkEscalationRequest(message);
  if (escalation) return escalation;

  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    // No key configured yet - fall back to the free rule-based assistant
    // rather than breaking support chat entirely. Pass history through so
    // its own loop-breaking (see supportBot.ts) still applies here.
    return fallbackRespond(message, topicId, history);
  }

  try {
    const reply = await callOllama(apiKey, message, history);
    return {
      reply,
      quickReplies: [
        { id: "resolved", label: "That fixed it 🎉" },
        { id: "still-stuck", label: "Still stuck" },
      ],
    };
  } catch {
    return fallbackRespond(message, topicId, history);
  }
}

async function callOllama(apiKey: string, message: string, history: HistoryTurn[]): Promise<string> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? ("user" as const) : ("assistant" as const),
      content: h.text,
    })),
    { role: "user" as const, content: message },
  ];

  const res = await fetch("https://ollama.com/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      options: {
        num_predict: MAX_REPLY_TOKENS,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
  const data = await res.json();
  const text: string | undefined = data?.message?.content;
  if (!text) throw new Error("Empty response from Ollama API");
  return text;
}
