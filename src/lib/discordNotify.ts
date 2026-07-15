// Best-effort Discord webhook notifier - this is how the owner finds out
// a paying customer wants a live agent. Every call is fire-and-forget
// with its own try/catch: a Discord outage, a missing/invalid
// DISCORD_WEBHOOK_URL, or a network blip must never break the actual
// chat flow (the message is already safely saved in Redis regardless).

export async function notifyDiscord(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Discord webhook messages are capped at 2000 chars; leave headroom.
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
  } catch (e) {
    console.error("[discordNotify] failed to notify Discord", e);
  }
}
