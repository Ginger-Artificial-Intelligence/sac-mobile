// Self-contained (no app imports) so the Node test runner can load it.
// Same payload the web app sends to POST /messages/forward.

export const FORWARD_MAX_TARGETS = 5;

const FORWARDABLE = ["text", "location", "image", "video", "audio", "document"];

/** Only these message types can be forwarded (same list as the web app) */
export const canForwardMessage = (message: { type?: string }) => FORWARDABLE.includes(String(message?.type));

const inner = (message: any): any => {
  const value = message?.message;
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
};

export interface ForwardTarget {
  _id: string;
  phone_number?: string | null;
  phoneNumber?: string | null;
}

export function buildForwardPayload(message: any, targets: ForwardTarget[], phoneNumberId: string) {
  if (!canForwardMessage(message)) throw new Error("This message type cannot be forwarded.");
  if (!targets.length || targets.length > FORWARD_MAX_TARGETS) throw new Error("Select between one and five contacts.");
  const payload = inner(message);
  let messageObj: Record<string, unknown>;
  if (message.type === "text") messageObj = { text: payload.text || { body: message.content } };
  else if (message.type === "location") messageObj = { location: payload.location || message.location };
  else {
    const media = payload[message.type] || {};
    const mediaId = media.id || media.uploaded_id || message.mediaId;
    if (!mediaId) throw new Error("The media identifier is unavailable.");
    messageObj = {
      mediaId,
      caption: media.caption || "",
      filename: media.filename || message.mediaFileName || "",
      ...(message.type === "document" ? { format: media.format || "pdf" } : {}),
    };
  }
  const targetContacts = targets.map((target) => {
    const phone = String(target.phone_number || target.phoneNumber || "").replace(/\D/g, "");
    if (!phone) throw new Error("A selected contact has no phone number.");
    return { phone: `+${phone}`, chatId: target._id };
  });
  return {
    msgType: message.type,
    targetContacts,
    messageObj,
    ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
    ...(message.type === "location" ? { location: JSON.stringify(messageObj.location) } : {}),
  };
}
