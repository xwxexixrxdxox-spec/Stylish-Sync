// Live agents are only available Mon–Fri, 9am–5pm, in the business's local
// timezone. Configurable via env so this doesn't need a code change if the
// business's hours or timezone change.

const DEFAULT_TZ = "America/Chicago";
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 17;

export interface BusinessHoursConfig {
  timezone: string;
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
}

export function getBusinessHoursConfig(): BusinessHoursConfig {
  return {
    timezone: process.env.SUPPORT_TIMEZONE || DEFAULT_TZ,
    startHour: Number(process.env.SUPPORT_START_HOUR ?? DEFAULT_START_HOUR),
    endHour: Number(process.env.SUPPORT_END_HOUR ?? DEFAULT_END_HOUR),
    weekdaysOnly: true,
  };
}

export function isLiveAgentAvailable(config: BusinessHoursConfig = getBusinessHoursConfig()): boolean {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const isWithinHours = hour >= config.startHour && hour < config.endHour;

  return isWeekday && isWithinHours;
}

export function nextAvailableWindowLabel(config: BusinessHoursConfig = getBusinessHoursConfig()): string {
  return `Live agents are available Monday–Friday, ${formatHour(config.startHour)}–${formatHour(
    config.endHour
  )} (${config.timezone.replace("_", " ")}).`;
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${period}`;
}
