// Pure helpers for turning API responses into local rows and reading pagination info.
// Kept free of runtime imports (types only) so they can be unit tested with plain Node.
import type { Chat, Message } from '../store/syncStore';


/** Robustly extract array of chats from any API response shape */
export function extractChats(response: any): any[] {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.chats)) return response.chats;
  if (Array.isArray(response?.data?.chats)) return response.data.chats;
  return [];
}

/** Robustly extract and flatten messages array from any API response shape (including date groups) */
export function extractMessages(response: any): any[] {
  let list: any[] = [];
  if (Array.isArray(response?.data?.messages)) list = response.data.messages;
  else if (Array.isArray(response?.data)) list = response.data;
  else if (Array.isArray(response?.messages)) list = response.messages;
  else if (Array.isArray(response)) list = response;

  // Flatten if the array contains date groups { _id: "YYYY-MM-DD", messages: [...] }
  const flattened: any[] = [];
  for (const item of list) {
    if (item && Array.isArray(item.messages)) {
      flattened.push(...item.messages);
    } else if (item) {
      flattened.push(item);
    }
  }
  return flattened;
}

/** Robustly extract contacts array from any API response shape */
export function extractContacts(response: any): any[] {
  if (Array.isArray(response?.contacts)) return response.contacts;
  if (Array.isArray(response?.data?.contacts)) return response.data.contacts;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

/** Get cursor for the next page of chats */
export function getNextChatCursor(response: any): string | null {
  if (!response) return null;

  // Stop if explicitly hasMore is false or hasNextPage is false
  if (response.hasMore === false || response.data?.hasMore === false) return null;
  if (response.pageInfo?.hasMore === false || response.data?.pageInfo?.hasMore === false) return null;
  if (response.pageInfo?.hasNextPage === false || response.data?.pageInfo?.hasNextPage === false) return null;

  if (response.pageInfo?.hasNextPage || response.pageInfo?.hasMore) {
    return response.pageInfo.startCursor || response.pageInfo.endCursor || null;
  }
  if (response.data?.pageInfo?.hasNextPage || response.data?.pageInfo?.hasMore) {
    return response.data.pageInfo.startCursor || response.data.pageInfo.endCursor || null;
  }
  return response.nextCursor || response.meta?.nextCursor || response.data?.nextCursor || null;
}

/** Check if API response indicates there are more chats */
export function checkHasMoreChats(response: any, rawChatsCount?: number, limit?: number): boolean {
  if (!response) return false;

  // Check explicit hasMore / hasNextPage boolean flags
  if (response.hasMore === false || response.data?.hasMore === false) return false;
  if (response.pageInfo?.hasMore === false || response.data?.pageInfo?.hasMore === false) return false;
  if (response.pageInfo?.hasNextPage === false || response.data?.pageInfo?.hasNextPage === false) return false;

  if (response.hasMore === true || response.data?.hasMore === true) return true;
  if (response.pageInfo?.hasMore === true || response.data?.pageInfo?.hasMore === true) return true;
  if (response.pageInfo?.hasNextPage === true || response.data?.pageInfo?.hasNextPage === true) return true;

  if (rawChatsCount !== undefined && rawChatsCount === 0) return false;
  if (limit !== undefined && rawChatsCount !== undefined && rawChatsCount < limit) return false;

  const nextCursor = getNextChatCursor(response);
  return Boolean(nextCursor);
}

/** Map raw API chat object → local Chat */
export function mapApiChat(c: any): Chat {
  const id = String(c._id || c.id || Math.random().toString(36).substring(7));
  const rawName = c.name || c.phoneNumber || c.phone_number || 'CRM User';
  const initials = rawName ? rawName.charAt(0).toUpperCase() : '?';
  const ts = c.lastMessageTime || c.last_message_at || c.last_msg_received_at || c.updatedAt || new Date().toISOString();

  const clean = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === 'undefined' || str === 'null' || str === 'NaN') return null;
    return str;
  };

  const resolvedSocialAccountId =
    clean(c.socialAccountId) ||
    clean(c.social_account_id) ||
    clean(c.accountId) ||
    clean(c.account_id) ||
    clean(c.rawData?.socialAccountId) ||
    clean(c.rawData?.social_account_id) ||
    clean(c.rawData?.accountId) ||
    clean(c.rawData?.account_id) ||
    clean(c.socialAccount?.phone_number_id) ||
    clean(c.socialAccount?.phoneNumberId) ||
    clean(c.socialAccount?.accountId) ||
    clean(c.socialAccount?.account_id) ||
    clean(c.sourceAccount?.phone_number_id) ||
    clean(c.sourceAccount?.phoneNumberId) ||
    clean(c.sourceAccount?.accountId) ||
    clean(c.sourceAccount?.account_id) ||
    clean(c.metadata?.phone_number_id) ||
    clean(c.metadata?.accountId) ||
    clean(c.metadata?.phoneNumberId) ||
    null;

  // Extract Department ID
  const deps = c.departments || c.chat?.departments || c.department || [];
  const firstDep = Array.isArray(deps) ? deps[0] : deps;
  const resolvedDeptId = firstDep ? String(firstDep._id || firstDep.id || firstDep) : null;

  // Extract Quick Assist Keyword
  const qaKeyword = c.latestQuickAssistKeyword || c.chat?.latestQuickAssistKeyword || c.quickAssistKeyword || null;

  // Extract Campaign ID
  const camp = c.campaignId || c.chat?.campaignId || c.campaign || c.chat?.campaign || null;
  const resolvedCampId = camp ? (typeof camp === 'object' ? String(camp._id || camp.id || '') : String(camp)) : null;

  return {
    id,
    name: rawName,
    phoneNumber: c.phoneNumber || c.phone_number || null,
    channel: c.channel || null,
    lastMessage: c.lastMessage || c.last_message || null,
    unreadCount: Number(c.unreadCount ?? 0),
    // Real Messenger/Instagram profile picture saved on the chat by the backend; falls back to initials.
    avatar: c.socialProfile?.profilePic || c.chat?.socialProfile?.profilePic || c.avatar || initials,
    pinned: Boolean(c.isPinned),
    isStarred: Boolean(c.isStarred),
    isOpen: Boolean(c.isOpen),
    assignedToName: c.assignedTo?.name || null,
    leadStage: c.leadInfo?.status || c.leadStage || null,
    socialAccountId: resolvedSocialAccountId,
    departmentId: resolvedDeptId,
    quickAssistKeyword: qaKeyword ? String(qaKeyword) : null,
    campaignId: resolvedCampId,
    updatedAt: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
    isBlocked: Boolean(c.isBlocked),
    username: c.socialProfile?.username || c.chat?.socialProfile?.username || c.username || null,
    isCampaignChat: Boolean(c.isCampaignChat),
    lastMsgReceivedAt: clean(c.last_msg_received_at ?? c.chat?.last_msg_received_at),
    isGroup: Boolean(c.isGroup ?? c.chat?.isGroup),
    waGroupId: clean(c.waGroupId ?? c.chat?.waGroupId),
    replyTimeoutStatus: clean(c.replyTimeoutStatus ?? c.chat?.replyTimeoutStatus),
    slaType: clean(c.slaType ?? c.chat?.slaType),
    accountId: resolvedSocialAccountId,
    rawJson: c ? JSON.stringify(c) : null,
  };
}

/** Map raw API message object → local Message */
export function mapApiMessage(m: any, chatId: string): Message {
  const id = String(m._id || m.id || m.messageId || m.message_id || m.message?.id || Math.random().toString(36).substring(7));
  const ts = m.createdAt || m.created_at || m.timestamp || m.message?.timestamp || new Date().toISOString();
  const type = m.message_type || m.type || m.message?.type || 'text';
  const isOutgoing = m.isOutgoing === true ||
    m.fromCrm === true ||
    String(m.flag || '').toLowerCase() === 'outgoing' ||
    String(m.flag || '').toLowerCase() === 'send' ||
    String(m.message?.flag || '').toLowerCase() === 'send';
  return {
    id,
    chatId,
    text: m.content || m.text || m.body || m.message?.text || m.message?.caption || '',
    sender: isOutgoing ? 'You' : (m.senderId || 'Contact'),
    isOutgoing,
    type,
    mediaUrl: m.mediaUrl || m.media_url || m.message?.image?.url || m.message?.video?.url || m.message?.audio?.url || m.message?.document?.url || null,
    status: m.status || 'sent',
    timestamp: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
    readReceipt: m.status || null,
    isImage: type === 'image',
    rawJson: m ? JSON.stringify(m) : null,
  };
}
