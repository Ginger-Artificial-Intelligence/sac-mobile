// Self-contained (no app imports) so the Node test runner can load it
const getMessagePayload = (msg: any): any => {
  let value = msg?.message;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value : {};
};

export type Reaction = { emoji: string; fromMe: boolean };

type Reacting = { isOutgoing?: boolean; message?: any; contacts?: any; from?: string } & Record<string, any>;

/** A WhatsApp reaction is its own message pointing at an earlier one: the target's id and the emoji ('' = taken back) */
export const reactionOf = (msg: Reacting | undefined): { targetId: string; targetDocId?: string; emoji: string } | null => {
  const reaction = getMessagePayload(msg)?.reaction;
  if (!reaction || typeof reaction !== "object" || !(reaction.message_id || reaction.target_id)) return null;
  return {
    targetId: String(reaction.message_id || reaction.target_id),
    ...(reaction.target_id ? { targetDocId: String(reaction.target_id) } : {}),
    emoji: String(reaction.emoji || ""),
  };
};

/**
 * Reactions belong under the message they react to, not in the conversation. `messages` must be oldest
 * first: a person's later reaction replaces their earlier one on the same message, an empty emoji removes it.
 */
export function indexReactions(messages: readonly Reacting[]): { hidden: Set<number>; byTarget: Map<string, Reaction[]> } {
  const hidden = new Set<number>();
  const latest = new Map<string, Map<string, string>>();
  messages.forEach((message, index) => {
    const found = reactionOf(message);
    if (!found) return;
    hidden.add(index);
    const who = message?.isOutgoing ? "me" : String(message?.contacts?.wa_user_id || message?.from || "them");
    const bucket = latest.get(found.targetId) ?? (found.targetDocId ? latest.get(found.targetDocId) : undefined) ?? new Map<string, string>();
    if (found.emoji) bucket.set(who, found.emoji);
    else bucket.delete(who);
    latest.set(found.targetId, bucket);
    if (found.targetDocId) latest.set(found.targetDocId, bucket);
  });
  const byTarget = new Map<string, Reaction[]>();
  for (const [target, people] of latest) {
    if (people.size) byTarget.set(target, Array.from(people, ([who, emoji]) => ({ emoji, fromMe: who === "me" })));
  }
  return { hidden, byTarget };
}

/** Every id a reaction might use for this message (WhatsApp's id sits in `message.id` when received, `mid` when sent) */
export const reactionTargetIds = (msg: Reacting | undefined): string[] => {
  const inner = getMessagePayload(msg);
  return [inner?.id, msg?.mid, inner?.mid, inner?.wamid, msg?.wamid, msg?.serverId, msg?._id].filter(Boolean).map(String);
};
