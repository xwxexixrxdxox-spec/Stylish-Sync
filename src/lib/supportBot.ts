import { getBusinessHoursConfig, isLiveAgentAvailable, nextAvailableWindowLabel } from "./businessHours";

// A deliberately rule-based (not LLM-backed) troubleshooting assistant.
// It always tries self-service steps first and only offers a live human
// when the customer explicitly asks for one — matching the requirement
// that the AI should *attempt* to guide customers to self-troubleshooting
// and only refer to a live agent on request.

export interface QuickReply {
  id: string;
  label: string;
}

export interface BotTurn {
  reply: string;
  quickReplies: QuickReply[];
  escalateOffered?: boolean;
}

interface TroubleshootTopic {
  id: string;
  label: string;
  steps: string[];
}

const TOPICS: TroubleshootTopic[] = [
  {
    id: "scan-not-working",
    label: "Barcode won't scan",
    steps: [
      "Make sure the app has camera permission — check your browser/device Settings > Site permissions > Camera.",
      "Hold the barcode steady, well-lit, and about 4–8 inches from the camera; glare and blur are the most common causes of a failed scan.",
      "If it still won't read, tap the barcode field and type the number in manually — everything else works the same.",
    ],
  },
  {
    id: "sheet-not-syncing",
    label: "Google Sheet not syncing",
    steps: [
      "Open Settings and tap 'Re-authenticate Google' — sync tokens expire periodically and this refreshes it.",
      "Confirm you're signed into the same Google account that owns the sheet (check Settings > Sign Out, then sign back in with the right account).",
      "Check your internet connection — changes made offline are queued locally and will sync automatically once you're back online.",
      "If the sheet was deleted or moved, use Settings > 'Start Fresh (new sheet)' to link a new one.",
    ],
  },
  {
    id: "low-stock-wrong",
    label: "Low-stock / reorder numbers look wrong",
    steps: [
      "Low stock triggers when quantity drops at or below an item's 'reorder at' threshold — tap the pencil icon on the item to check or change that number.",
      "If you recently imported a spreadsheet, confirm the quantity column mapped correctly on the import review screen.",
      "Pull to refresh the Inventory tab to make sure you're looking at the latest synced numbers.",
    ],
  },
  {
    id: "import-export",
    label: "Import / export isn't working",
    steps: [
      "Exports support .xlsx, .csv, and Google Sheets — make sure your import file's first row is a header row with columns like Barcode, Name, Quantity, Unit, Price.",
      "Very large files (5,000+ rows) can take a few seconds — give it a moment before retrying.",
      "If a specific row fails, the import screen will flag which rows were skipped so you can fix and re-import just those.",
    ],
  },
  {
    id: "billing",
    label: "Billing / subscription question",
    steps: [
      "Your receipt and next billing date are emailed by Stripe to the address you paid with — search your inbox for 'receipt'.",
      "To change or cancel your plan, use the 'Manage billing' link in Account settings, which opens Stripe's secure customer portal.",
      "Plan changes take effect at your next renewal date — you won't be charged twice for the same period.",
    ],
  },
];

const LIVE_AGENT_PATTERN = /\b(human|live agent|real person|representative|talk to (a |an )?(person|someone|human)|agent please|speak to)\b/i;

export function getGreeting(): BotTurn {
  return {
    reply:
      "Hi! I'm the InventorySync support assistant. I can usually get you unstuck in a couple of steps — what's going on?",
    quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
  };
}

export function respond(input: string, topicId?: string): BotTurn {
  const trimmed = input.trim();

  if (LIVE_AGENT_PATTERN.test(trimmed)) {
    return escalationTurn();
  }

  const topic = TOPICS.find((t) => t.id === topicId) ?? matchTopic(trimmed);
  if (topic) {
    return {
      reply: `Here's what usually fixes "${topic.label}":\n\n${topic.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")}\n\nDid that solve it? If not, just tell me and I can connect you with a live agent.`,
      quickReplies: [
        { id: "resolved", label: "That fixed it 🎉" },
        { id: "live-agent", label: "Still stuck — talk to a person" },
      ],
    };
  }

  if (/^resolved$/i.test(trimmed)) {
    return {
      reply: "Glad that worked! Anything else I can help with?",
      quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
    };
  }

  return {
    reply:
      "I want to make sure I point you to the right fix — is your issue closest to one of these?",
    quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
  };
}

function matchTopic(text: string): TroubleshootTopic | undefined {
  const lower = text.toLowerCase();
  if (/scan|camera|barcode/.test(lower)) return TOPICS[0];
  if (/sheet|sync|google/.test(lower)) return TOPICS[1];
  if (/low.?stock|reorder/.test(lower)) return TOPICS[2];
  if (/import|export|csv|excel|xlsx/.test(lower)) return TOPICS[3];
  if (/bill|charge|subscription|refund|cancel|payment/.test(lower)) return TOPICS[4];
  return undefined;
}

// Exposes the "did they ask for a human?" check on its own so other
// front-ends for this same escalation policy (e.g. an AI-backed assistant)
// can reuse it without duplicating the regex or the availability logic.
export function checkEscalationRequest(input: string): BotTurn | null {
  return LIVE_AGENT_PATTERN.test(input.trim()) ? escalationTurn() : null;
}

function escalationTurn(): BotTurn {
  const config = getBusinessHoursConfig();
  const available = isLiveAgentAvailable(config);
  if (available) {
    return {
      reply:
        "Sure thing — connecting you with a live agent now. Please hold on; someone will be with you shortly.",
      quickReplies: [],
      escalateOffered: true,
    };
  }
  return {
    reply: `Our live agents aren't online right now. ${nextAvailableWindowLabel(
      config
    )} Leave a message below and the team will follow up as soon as they're back, or I can keep helping with self-service steps in the meantime.`,
    quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
    escalateOffered: true,
  };
}

export { TOPICS };
