export type RenderMessageType =
  | 'text'
  | 'template'
  | 'document'
  | 'image'
  | 'video'
  | 'audio'
  | 'button'
  | 'interactive'
  | 'order'
  | 'contacts'
  | 'location'
  | 'sticker'
  | 'unsupported'

export type NormalizedChatMessage = Record<string, any> & {
  _id: string
  chatId: string
  accountId: string,
  type: RenderMessageType
  content: string
  isOutgoing: boolean
  senderName?: string
  createdAt?: string | number | Date
  mediaId?: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaFileName?: string
  mediaFileSize?: number | string
}

const TYPE_ALIASES: Record<string, RenderMessageType> = {
  text: 'text', text_message: 'text', textmessage: 'text',
  template: 'template', template_message: 'template', templatemessage: 'template',
  document: 'document', document_message: 'document', documentmessage: 'document',
  image: 'image', image_message: 'image', imagemessage: 'image',
  video: 'video', video_message: 'video', videomessage: 'video',
  audio: 'audio', voice: 'audio', audio_message: 'audio', audiomessage: 'audio',
  button: 'button', button_message: 'button', buttonmessage: 'button',
  interactive: 'interactive', interactive_message: 'interactive', interactivemessage: 'interactive',
  button_reply: 'interactive', list_reply: 'interactive', nfm_reply: 'interactive',
  address_message: 'interactive', location_request_message: 'interactive',
  cta_url: 'interactive', flow: 'interactive', catalog_message: 'interactive',
  order: 'order', order_message: 'order', ordermessage: 'order',
  contacts: 'contacts', contact: 'contacts', contact_message: 'contacts', contacts_message: 'contacts',
  location: 'location', location_message: 'location', locationmessage: 'location',
  sticker: 'sticker', sticker_message: 'sticker', stickermessage: 'sticker',
  unsupported: 'unsupported', unknown: 'unsupported',
}

export const parseMaybeJson = <T = any>(value: unknown): T | unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value
  try { return JSON.parse(trimmed) as T } catch { return value }
}

export const asArray = <T = any>(value: unknown): T[] => Array.isArray(value) ? value as T[] : value == null ? [] : [value as T]

export const getNested = (source: unknown, path: string): any => {
  if (!source || typeof source !== 'object') return undefined
  return path.split('.').reduce<any>((current, key) => current && typeof current === 'object' ? current[key] : undefined, source)
}

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

const firstNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

export const getObjectPayload = (value: unknown): any => {
  const parsed = parseMaybeJson(value)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

export const getMessagePayload = (msg: any): any => getObjectPayload(msg?.message)
export const getMessageInputPayload = (msg: any): any => getObjectPayload(msg?.message_input)
export const getContentPayload = (msg: any): any => getObjectPayload(msg?.content)

export const getMessageText = (msg: any): string => {
  const message = getMessagePayload(msg)
  const parsedContent = parseMaybeJson(msg?.content)
  const content = getContentPayload(msg)
  const messageInput = getMessageInputPayload(msg)
  return firstString(
    msg?.text, msg?.body, msg?.caption,
    typeof msg?.message === 'string' || typeof msg?.message === 'number' ? msg.message : undefined,
    typeof msg?.message_input === 'string' && !['{', '['].includes(msg.message_input.trim()[0]) ? msg.message_input : undefined,
    typeof parsedContent === 'string' ? parsedContent : undefined,
    content?.text?.body, content?.body?.text, content?.body, content?.message?.text, content?.message?.text?.body, content?.message?.body,
    msg?.messageText, msg?.textMessage,
    message?.text, message?.text?.body, message?.body, message?.caption,
    message?.image?.caption, message?.video?.caption, message?.document?.caption,
    message?.interactive?.body?.text, message?.interactive?.nfm_reply?.body, message?.interactive?.nfm_reply?.name,
    message?.interactive?.button_reply?.title, message?.interactive?.list_reply?.title,
    message?.nfm_reply?.body, message?.nfm_reply?.name, message?.button_reply?.title, message?.list_reply?.title,
    msg?.interactive?.body?.text, msg?.interactive?.nfm_reply?.body, msg?.interactive?.nfm_reply?.name,
    msg?.interactive?.button_reply?.title, msg?.interactive?.list_reply?.title,
    messageInput?.text, messageInput?.text?.body, messageInput?.body, messageInput?.caption,
    messageInput?.interactive?.body?.text, messageInput?.interactive?.nfm_reply?.body, messageInput?.interactive?.nfm_reply?.name,
    messageInput?.interactive?.button_reply?.title, messageInput?.interactive?.list_reply?.title,
    messageInput?.image?.caption, messageInput?.video?.caption, messageInput?.document?.caption,
    message?.button?.text, msg?.button?.text, msg?.button?.payload,
    message?.template?.components?.find?.((component: any) => String(component?.type).toLowerCase() === 'body')?.text,
    msg?.template?.components?.find?.((component: any) => String(component?.type).toLowerCase() === 'body')?.text
  )
}

export const normalizeMessageType = (msg: any): RenderMessageType => {
  const message = getMessagePayload(msg)
  const content = getContentPayload(msg)
  const messageInput = getMessageInputPayload(msg)
  const rawType = firstString(msg?.type, msg?.messageType, msg?.message_type, msg?.msgType, message?.type, content?.type, messageInput?.type).toLowerCase().replace(/\s+/g, '_')
  const direct = TYPE_ALIASES[rawType]
  if (direct) return direct
  if (message?.template || msg?.template || content?.template || messageInput?.template) return 'template'
  if (message?.interactive || msg?.interactive || messageInput?.interactive || content?.interactive || content?.message?.interactive || content?.message_input?.interactive || content?.payload?.interactive || message?.button_reply || message?.list_reply || message?.nfm_reply) return 'interactive'
  if (message?.location || msg?.location || content?.location || messageInput?.location) return 'location'
  if (message?.contacts || msg?.contacts || content?.contacts || messageInput?.contacts) return 'contacts'
  if (message?.order || msg?.order || content?.order || messageInput?.order) return 'order'
  if (message?.document || msg?.document || content?.document || messageInput?.document) return 'document'
  if (message?.image || msg?.image || content?.image || messageInput?.image) return 'image'
  if (message?.video || msg?.video || content?.video || messageInput?.video) return 'video'
  if (message?.audio || message?.voice || msg?.audio || msg?.voice || content?.audio || content?.voice || messageInput?.audio || messageInput?.voice) return 'audio'
  if (message?.sticker || msg?.sticker || content?.sticker || messageInput?.sticker) return 'sticker'
  if (message?.button || msg?.button || content?.button || messageInput?.button) return 'button'
  return getMessageText(msg) ? 'text' : 'unsupported'
}

export const isOutgoingMessage = (msg: any): boolean => {
  const flag = firstString(msg?.flag, msg?.direction, msg?.messageDirection).toLowerCase()
  if (flag) {
    return ['outgoing', 'sent', 'sender', 'crm', 'from_crm'].includes(flag)
  }
  if (typeof msg?.fromCrm === 'boolean') return msg.fromCrm
  if (typeof msg?.isOutgoing === 'boolean') return msg.isOutgoing
  return false
}

export const getMediaPayload = (msg: any): any => {
  const type = normalizeMessageType(msg)
  const message = getMessagePayload(msg)
  const content = getContentPayload(msg)
  const input = getMessageInputPayload(msg)
  return msg?.[type] || message?.[type] || (type === 'audio' ? message?.voice || msg?.voice : undefined) || content?.[type] || (type === 'audio' ? content?.voice : undefined) || input?.[type] || input?.payload?.[type] || (type === 'audio' ? input?.voice || input?.payload?.voice : undefined) || msg?.media || message?.media || content || {}
}

export const getMediaUrl = (msg: any): string => {
  const media = getMediaPayload(msg)
  const message = getMessagePayload(msg)
  return firstString(msg?.mediaUrl, msg?.media_url, msg?.url, msg?.link, msg?.fileUrl, msg?.file_url, media?.url, media?.path, media?.link, media?.mediaUrl, media?.media_url, media?.fileUrl, media?.file_url, media?.cdnUrl, media?.cdn_url, message?.image?.link, message?.video?.link, message?.document?.link, message?.audio?.link, message?.voice?.link, message?.sticker?.link, message?.template?.mediaUrl)
}

export const getMediaId = (msg: any): string => {
  const media = getMediaPayload(msg)
  const message = getMessagePayload(msg)
  return firstString(msg?.mediaId, msg?.media_id, msg?.uploaded_id, typeof media === 'string' ? media : undefined, media?.uploaded_id, media?.mediaId, media?.media_id, media?.id, typeof message?.image === 'string' ? message.image : undefined, message?.image?.uploaded_id, message?.image?.id, typeof message?.video === 'string' ? message.video : undefined, message?.video?.uploaded_id, message?.video?.id, typeof message?.document === 'string' ? message.document : undefined, message?.document?.uploaded_id, message?.document?.id, typeof message?.audio === 'string' ? message.audio : undefined, message?.audio?.uploaded_id, message?.audio?.id, typeof message?.voice === 'string' ? message.voice : undefined, message?.voice?.uploaded_id, message?.voice?.id, typeof message?.sticker === 'string' ? message.sticker : undefined, message?.sticker?.uploaded_id, message?.sticker?.id)
}

export const getTemplatePayload = (msg: any): any => {
  const message = getMessagePayload(msg)
  const content = getContentPayload(msg)
  const input = getMessageInputPayload(msg)
  const template = msg?.template || message?.template || content?.template || input?.template || {}
  const savedContent = parseMaybeJson(template?.content)
  return { ...template, savedContent: savedContent && typeof savedContent === 'object' ? savedContent : undefined }
}

export const getInteractivePayload = (msg: any): any => {
  const message = getMessagePayload(msg)
  const content = getContentPayload(msg)
  const input = getMessageInputPayload(msg)
  const directMessageInteractive = message?.interactive || (message?.button_reply || message?.list_reply || message?.nfm_reply || message?.type ? message : undefined)
  return msg?.interactive || directMessageInteractive || input?.interactive || content?.interactive || content?.message?.interactive || content?.message_input?.interactive || content?.payload?.interactive || (typeof content?.content === 'object' ? content.content?.interactive : undefined) || content || {}
}

export const getContactsPayload = (msg: any): any[] => {
  const message = getMessagePayload(msg)
  const content = getContentPayload(msg)
  const input = getMessageInputPayload(msg)
  const media = getMediaPayload(msg)
  const candidates = [
    msg?.contacts,
    msg?.contact,
    message?.contacts,
    message?.contact,
    content?.contacts,
    content?.contact,
    content?.message?.contacts,
    content?.message?.contact,
    content?.payload?.contacts,
    content?.payload?.contact,
    input?.contacts,
    input?.contact,
    input?.payload?.contacts,
    input?.payload?.contact,
    media?.contacts,
    media?.contact,
  ]

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate)
    if (Array.isArray(parsed) && parsed.length) return parsed
    if (parsed && typeof parsed === 'object') return [parsed]
  }

  if (Array.isArray(media)) return media
  return []
}

export const getLocationPayload = (msg: any): any => {
  const message = getMessagePayload(msg)
  const media = getMediaPayload(msg)
  const raw = msg?.location || message?.location || media?.location || media || {}
  // Outgoing CRM messages nest as: message.location.location.{latitude,longitude}
  // Incoming messages nest as: message.location.{latitude,longitude}
  const inner = raw?.location || raw
  // Ensure we always return an object with lat/lng at the top level
  const lat = inner?.latitude ?? inner?.lat ?? raw?.latitude ?? raw?.lat
  const lng = inner?.longitude ?? inner?.lng ?? inner?.long ?? raw?.longitude ?? raw?.lng ?? raw?.long
  return {
    latitude: lat,
    longitude: lng,
    name: inner?.name ?? raw?.name ?? msg?.location?.name,
    address: inner?.address ?? raw?.address ?? msg?.location?.address,
  }
}

export const normalizeChatMessage = (msg: any): NormalizedChatMessage => {
  let target = msg;
  if (msg?.rawJson) {
    try {
      const parsed = JSON.parse(msg.rawJson);
      if (parsed && typeof parsed === 'object') {
        target = { ...msg, ...parsed };
      }
    } catch (_) {}
  }
  const message = getMessagePayload(target);
  const type = normalizeMessageType(target);
  const media = getMediaPayload(target);
  const fallbackId = `${String(target?.chatId || target?.chat_id || 'message')}-${String(target?.createdAt || target?.created_at || target?.timestamp || '')}-${type}`;
  const res = {
    ...target,
    message,
    _id: String(target?._id || target?.id || target?.messageId || target?.message_id || message?.id || fallbackId),
    chatId: String(target?.chatId || target?.chat_id || target?.chat?._id || target?.chat?.id || ''),
    isOutgoing: isOutgoingMessage(target),
    type,
    content: getMessageText(target),
    mediaId: getMediaId(target),
    mediaUrl: getMediaUrl(target),
    mediaMimeType: firstString(target?.mimeType, target?.mime_type, media?.mimeType, media?.mime_type, media?.type),
    mediaFileName: firstString(target?.fileName, target?.filename, target?.file_name, media?.filename, media?.fileName, media?.file_name, media?.name),
    mediaFileSize: firstNumber(target?.fileSize, target?.file_size, target?.size, media?.fileSize, media?.file_size, media?.size),
    senderName: firstString(target?.senderName, target?.sentByName, target?.user?.name, target?.sentBy?.name),
    createdAt: target?.createdAt || target?.created_at || target?.timestamp || target?.messageTimestamp,
  };
  return res;
};

export const formatMessageTime = (value: unknown): string => {
  const date = value ? new Date(value as any) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()
}

export const formatFileSize = (value: unknown): string => {
  const size = firstNumber(value)
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
