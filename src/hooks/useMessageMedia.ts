import { useState, useEffect } from 'react';
import API from '../config/axios';
import { globalMediaQueue } from '../lib/mediaQueue';
import { expoDb, getMediaCache, setMediaCache, getMediaParams } from '../db/client';

export interface UseMessageMediaOptions {
  mediaId?: string;
  messageType?: string;
  chatId?: string;
  phoneNumberId?: string;
  directUrl?: string | null;
  shouldLoad?: boolean;
  retryTrigger?: number;
}

export interface UseMessageMediaResult {
  url: string;
  loading: boolean;
  error: boolean;
}

const mediaUrlCache = new Map<string, string>();
const mediaInFlight = new Map<string, Promise<string>>();
const mediaFailureCounts = new Map<string, number>();

const getMediaCacheKey = (mediaId: string, phoneId: string) => {
  return [mediaId, phoneId || ""].join(":");
};

export function useMessageMedia(options: UseMessageMediaOptions): UseMessageMediaResult {

  const {
    mediaId = "",
    messageType = "text",
    chatId = "",
    phoneNumberId = "",
    directUrl = "",
    shouldLoad = true,
    retryTrigger = 0,
  } = options;

  // Resolve params synchronously to check cache key
  const params = getMediaParams({ mediaId }, chatId, phoneNumberId);
  const resolvedPhoneId = params.phone_number_id || "";
  const cacheKey = mediaId ? getMediaCacheKey(mediaId, resolvedPhoneId) : "";
  const cachedUrl = cacheKey ? mediaUrlCache.get(cacheKey) || "" : "";
  const isLocalUrl = Boolean(directUrl && (directUrl.startsWith("file:") || directUrl.startsWith("content:") || directUrl.startsWith("data:")));
  const preferApiFetch = Boolean(mediaId && !isLocalUrl);

  const [state, setState] = useState<UseMessageMediaResult>({
    url: preferApiFetch ? cachedUrl : directUrl || cachedUrl,
    loading: Boolean(!cachedUrl && preferApiFetch && shouldLoad),
    error: false,
  });

  useEffect(() => {
    let cancelled = false;

    const checkCacheAndLoad = async () => {
      // 1. Check in-memory
      if (cachedUrl) {
        if (!cancelled) setState({ url: cachedUrl, loading: false, error: false });
        return;
      }

      // 2. Check SQLite
      if (cacheKey) {
        try {
          const stored = await getMediaCache(cacheKey);
          if (stored) {
            mediaUrlCache.set(cacheKey, stored);
            if (!cancelled) setState({ url: stored, loading: false, error: false });
            return;
          }
        } catch (_) { }
      }

      // 3. If shouldLoad is false, we don't proceed with API call
      if (!shouldLoad) return;

      // 4. If we shouldn't prefer API fetch, use directUrl
      if (!preferApiFetch) {
        if (directUrl) {
          if (!cancelled) setState({ url: directUrl, loading: false, error: false });
        } else {
          if (!cancelled) setState({ url: "", loading: false, error: false });
        }
        return;
      }

      if ((mediaFailureCounts.get(cacheKey) || 0) >= 3) {
        if (!cancelled) setState({ url: directUrl || "", loading: false, error: !directUrl });
        return;
      }

      // console.log(`📥 [useMessageMedia] Fetching mediaId: ${mediaId}, params:`, params);
      if (!params.phone_number_id) {
        console.warn("⚠️ [useMessageMedia] Aborting fetch - phone_number_id is missing");
        if (!cancelled) setState({ url: directUrl || "", loading: false, error: !directUrl });
        return;
      }

      if (!cancelled) setState({ url: directUrl || "", loading: true, error: false });
      const existing = mediaInFlight.get(cacheKey);

      const request = existing || globalMediaQueue.enqueue<string>(async () => {
        try {
          const res = await API.get(`/chats/media/${mediaId}`, { responseType: "blob", params });
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Blob read fail"));
            reader.onloadend = () => {
              let dataUrl = reader.result as string;
              if (dataUrl && dataUrl.startsWith("data:application/octet-stream;")) {
                if (messageType === "image") {
                  dataUrl = dataUrl.replace("data:application/octet-stream;", "data:image/jpeg;");
                } else if (messageType === "video") {
                  dataUrl = dataUrl.replace("data:application/octet-stream;", "data:video/mp4;");
                } else if (messageType === "audio") {
                  dataUrl = dataUrl.replace("data:application/octet-stream;", "data:audio/mpeg;");
                }
              }
              resolve(dataUrl || "");
            };
            reader.readAsDataURL(res.data);
          });
        } catch (fetchErr) {
          mediaFailureCounts.set(cacheKey, 3);
          throw fetchErr;
        }
      }).then(async (dataUrl) => {
        if (dataUrl) {
          mediaUrlCache.set(cacheKey, dataUrl);
          try {
            await setMediaCache(cacheKey, dataUrl);
          } catch (_) { }
          mediaFailureCounts.delete(cacheKey);
        }
        return dataUrl || "";
      }).catch(() => {
        mediaFailureCounts.set(cacheKey, 3);
        return "";
      });

      if (!existing) {
        mediaInFlight.set(cacheKey, request);
        request.finally(() => mediaInFlight.delete(cacheKey));
      }

      request
        .then((url: string) => {
          if (!cancelled) {
            if (url) {
              setState({ url, loading: false, error: false });
            } else {
              setState({ url: directUrl || "", loading: false, error: !directUrl });
            }
          }
        })
        .catch(() => {
          mediaFailureCounts.set(cacheKey, 3);
          if (!cancelled) setState({ url: directUrl || "", loading: false, error: !directUrl });
        });
    };

    checkCacheAndLoad();
    return () => {
      cancelled = true;
    };
  }, [directUrl, mediaId, cacheKey, shouldLoad, preferApiFetch, retryTrigger]);

  return state;
}
