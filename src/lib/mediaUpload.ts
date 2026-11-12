import API from '../config/axios';
import type { MediaKind } from './chatWindow';

export interface PickedMedia {
  kind: MediaKind;
  /** local file:// uri (copied to cache by the picker / recorder) */
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
  /** pixel size of an image, when known (used by the crop presets) */
  width?: number;
  height?: number;
  /** a recorded voice note: the backend transcodes it to ogg/opus and sends it as a voice message */
  isVoice?: boolean;
}

export function mediaPreviewLabel(media: PickedMedia): string {
  if (media.isVoice) return '🎤 Voice message';
  switch (media.kind) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'audio': return '🎵 Audio';
    default: return `📄 ${media.name || 'Document'}`;
  }
}

/**
 * POST /utils/upload-to-meta (multipart, field name = the kind) and return the asset id to send.
 * WhatsApp needs the phone number id; Messenger/Instagram are page based and do not.
 */
export async function uploadMediaToMeta(media: PickedMedia, chat: { channel: string | null; accountId: string | null }): Promise<string> {
  const channel = chat.channel || 'whatsapp';
  const pageBased = channel === 'messenger' || channel === 'instagram';
  const accountId = chat.accountId || '';
  if (!pageBased && !accountId) throw new Error('This chat has no WhatsApp account to upload with.');

  const form = new FormData();
  form.append(media.kind, { uri: media.uri, name: media.name, type: media.mimeType } as any);

  const res = await API.post('/utils/upload-to-meta', form, {
    params: {
      channel,
      ...(accountId ? { accountId } : {}),
      ...(!pageBased && accountId ? { phone_number_id: accountId } : {}),
      ...(media.isVoice ? { isVoice: 'true' } : {}),
    },
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 5 * 60 * 1000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const d = res.data?.data;
  const id = d?.uploadAssetId || d?.attachment_id || d?.url || d?.filepath || '';
  if (res.data?.status !== 'success' || !id) throw new Error(res.data?.message || 'The server did not accept the file.');
  return String(id);
}
