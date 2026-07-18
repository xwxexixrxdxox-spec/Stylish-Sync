import { TOPICS, BotTurn, checkEscalationRequest, respond as fallbackRespond } from "./supportBot";

// Juesika is InventorySync's AI support assistant - a "pocket" version of an
// AI assistant wired up to Ollama Cloud (a free-tier-friendly hosted model
// API), grounded in the same troubleshooting knowledge base the old
// rule-based bot used (see supportBot.ts). If OLLAMA_API_KEY isn't
// configured yet, or a call to the API fails for any reason, this quietly
// falls back to the free rule-based assistant instead of breaking support
// chat entirely.

export interface HistoryTurn {
  role: "user" | "bot";
  text: string;
}

// gpt-oss:20b-cloud is Ollama Cloud's "Low Usage" tier - the best fit for a
// free-tier account, since a lightweight support chat doesn't need a bigger
// model and staying in the low-usage bracket helps avoid tripping the free
// plan's session/weekly caps.
const MODEL = "gpt-oss:20b-cloud";
const MAX_HISTORY_TURNS = 20;
const MAX_REPLY_TOKENS = 500;

const KNOWLEDGE_BASE = TOPICS.map(
  (t) => `## ${t.label}\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
).join("\n\n");

const SYSTEM_PROMPT = `You are Juesika, a warm, sharp, pocket-sized AI support assistant built into the InventorySync app (barcode inventory scanning, low-stock reordering, Google Sheets sync, and Stripe-based subscriptions).

Your job is to help customers get unstuck fast. Lean on the reference troubleshooting steps below whenever they're relevant, and prefer concrete, numbered steps over vague reassurance. Keep replies conversational but tight - a few short sentences or a short numbered list, not an essay.

You can't take real actions (you can't change billing, sync data, or access anyone's account) - you can only explain how to do things. If something is genuinely outside what you can help with, say so plainly.

If a customer explicitly asks for a live human/agent, let them know they can just say so ("talk to a person") and you'll connect them - don't try to talk them out of it.

Reference troubleshooting steps for InventorySync:

${KNOWLEDGE_BASE}`;

export function getGreeting(): BotTurn {
  return {
    reply:
      "Hi, I'm Juesika 👋 — think of me as a pocket-sized AI assistant here to help with InventorySync. What's going on?",
    quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
  };
}

export async function respond(message: string, topicId: string | undefined, history: HistoryTurn[]): Promise<BotTurn> {
  const escalation = checkEscalationRequest(message);
  if (escalation) return escalation;

  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    // No key configured yet - fall back to the free rule-based assistant
    // rather than breaking support chat entirely.
    return fallbackRespond(message, topicId);
  }

  try {
    const reply = await callOllama(apiKey, message, history);
    return {
      reply,
      quickReplies: [
        { id: "resolved", label: "That fixed it 🎉" },
        { id: "live-agent", label: "Still stuck — talk to a person" },
      ],
    };
  } catch {
    return fallbackRespond(message, topicId);
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
