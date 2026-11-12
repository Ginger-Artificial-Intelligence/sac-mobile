// Pure helpers for the WhatsApp 24-hour customer window and attachment limits.
// No React Native imports so they can be unit tested with plain Node.

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns whatever the backend stored for "customer last wrote" into milliseconds.
 * The webhook worker stores an ISO date string; older data can be unix seconds (10 digits) or ms.
 */
export function parseTimeMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * When did the customer last write? Uses the later of the chat's own field and the newest incoming
 * message we hold, so a stale field can never lock a chat the customer just wrote in.
 */
export function lastCustomerMessageMs(
  chatField: unknown,
  newestIncomingTimestamp: unknown
): number | null {
  const times = [parseTimeMs(chatField), parseTimeMs(newestIncomingTimestamp)].filter((t): t is number => t !== null);
  return times.length ? Math.max(...times) : null;
}

/**
 * Is the 24-hour window closed? With no information at all it is closed only if the chat has history
 * (we wrote, the customer never did); a brand new empty chat is left open.
 */
export function isWindowClosed(lastCustomerMs: number | null, hasMessages: boolean, now = Date.now()): boolean {
  if (lastCustomerMs === null) return hasMessages;
  return lastCustomerMs + DAY_MS <= now;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

const MB = 1024 * 1024;

/** Per-channel upload limits, as enforced by the web app (Messenger/Instagram are more generous except images) */
export function mediaSizeError(channel: string, kind: MediaKind, sizeBytes: number | null | undefined): string | null {
  if (!sizeBytes || sizeBytes <= 0) return null; // size unknown: let the server decide
  const pageBased = channel === 'messenger' || channel === 'instagram';
  const limitMb = {
    image: pageBased ? 8 : 5,
    video: pageBased ? 25 : 15,
    audio: pageBased ? 25 : 16,
    document: pageBased ? 25 : 100,
  }[kind];
  if (sizeBytes / MB <= limitMb) return null;
  const label = kind === 'document' ? 'File' : kind[0].toUpperCase() + kind.slice(1);
  return `${label} is larger than the ${limitMb} MB limit.`;
}
