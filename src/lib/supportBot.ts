// A deliberately rule-based (not LLM-backed) troubleshooting assistant.
// It always tries self-service steps first. There is no live human agent
// to escalate to anymore — if someone asks for one, Juesika says so
// plainly and points them at the paid in-store setup service (booked
// separately) or a direct email, rather than pretending to connect them.

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
    id: "install-booking",
    label: "In-store setup / booking question",
    steps: [
      "The flat installation fee books a technician to come scan and enter your inventory on-site — see the Account tab for pricing and booking.",
      "Once that's paid, you'll get a calendar to pick an available date for the visit.",
      "The technician's on-site time is billed per day on top of the flat installation fee, based on how many days the job actually takes — you'll be told the daily rate before you book.",
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
    return noLiveAgentTurn();
  }

  const topic = TOPICS.find((t) => t.id === topicId) ?? matchTopic(trimmed);
  if (topic) {
    return {
      reply: `Here's what usually fixes "${topic.label}":\n\n${topic.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")}\n\nDid that solve it?`,
      quickReplies: [
        { id: "resolved", label: "That fixed it 🎉" },
        { id: "still-stuck", label: "Still stuck" },
      ],
    };
  }

  if (/^resolved$/i.test(trimmed)) {
    return {
      reply: "Glad that worked! Anything else I can help with?",
      quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
    };
  }

  if (/^still-stuck$/i.test(trimmed)) {
    return {
      reply:
        "Sorry that didn't do it. I don't have a live chat team behind me, but you can email the details and we'll dig in personally.",
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
  if (/install|setup|technician|on.?site|schedule|book/.test(lower)) return TOPICS[4];
  return undefined;
}

// Exposes the "did they ask for a human?" check on its own so other
// front-ends for this same policy (e.g. an AI-backed assistant) can
// reuse it without duplicating the regex.
export function checkEscalationRequest(input: string): BotTurn | null {
  return LIVE_AGENT_PATTERN.test(input.trim()) ? noLiveAgentTurn() : null;
}

function noLiveAgentTurn(): BotTurn {
  return {
    reply:
      "I don't have a live chat team to connect you to — it's just me! I can usually walk you through most issues, or if you'd rather have someone physically set up your inventory, there's a paid in-store setup option under Account.",
    quickReplies: TOPICS.map((t) => ({ id: t.id, label: t.label })),
  };
}

export { TOPICS };
