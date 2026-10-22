import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../config/axios';
import { globalMediaQueue } from '../lib/mediaQueue';
import { getMediaCache, setMediaCache, getMediaParams } from '../db/client';

export interface UseMessageMediaOptions {
  mediaId?: string;
  messageType?: string;
  chatId?: string;
  phoneNumberId?: string;
  directUrl?: string | null;
  autoLoad?: boolean; // Default false: only loads from cache, otherwise requires manual user tap
  retryTrigger?: number;
}

export interface UseMessageMediaResult {
  url: string;
  loading: boolean;
  error: boolean;
  isLoaded: boolean;
  loadMedia: () => void;
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
    autoLoad = false,
    retryTrigger = 0,
  } = options;

  // Resolve params synchronously to check cache key
  const params = getMediaParams({ mediaId }, chatId, phoneNumberId);
  const resolvedPhoneId = params.phone_number_id || "";
  const cacheKey = mediaId ? getMediaCacheKey(mediaId, resolvedPhoneId) : "";
  const cachedUrl = cacheKey ? mediaUrlCache.get(cacheKey) || "" : "";
  const isLocalUrl = Boolean(
    directUrl &&
      (directUrl.startsWith("file:") ||
        directUrl.startsWith("content:") ||
        directUrl.startsWith("data:"))
  );

  const initialUrl = isLocalUrl ? directUrl! : cachedUrl;
  const [url, setUrl] = useState<string>(initialUrl);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(Boolean(initialUrl));

  const [fetchRequested, setFetchRequested] = useState<boolean>(autoLoad);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 1. Check local caches (in-memory and SQLite) on mount or key change
  useEffect(() => {
    if (isLocalUrl && directUrl) {
      setUrl(directUrl);
      setIsLoaded(true);
      setLoading(false);
      setError(false);
      return;
    }

    if (cachedUrl) {
      setUrl(cachedUrl);
      setIsLoaded(true);
      setLoading(false);
      setError(false);
      return;
    }

    if (!cacheKey) {
      if (directUrl && directUrl.startsWith("http")) {
        // If direct http URL exists, we can use it as remote preview
        setUrl(directUrl);
        setIsLoaded(true);
      } else {
        setUrl("");
        setIsLoaded(false);
      }
      setLoading(false);
      setError(false);
      return;
    }

    let isSubscribed = true;
    getMediaCache(cacheKey)
      .then((stored) => {
        if (!isSubscribed || !mountedRef.current) return;
        if (stored) {
          mediaUrlCache.set(cacheKey, stored);
          setUrl(stored);
          setIsLoaded(true);
          setLoading(false);
          setError(false);
        } else {
          // Not in cache
          if (directUrl && (directUrl.startsWith("file:") || directUrl.startsWith("data:"))) {
            setUrl(directUrl);
            setIsLoaded(true);
          } else {
            setUrl("");
            setIsLoaded(false);
          }
        }
      })
      .catch(() => {
        if (isSubscribed && mountedRef.current) {
          setUrl("");
          setIsLoaded(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [cacheKey, cachedUrl, directUrl, isLocalUrl, retryTrigger]);

  // 2. Perform API download only if explicitly requested (manual tap or autoLoad)
  useEffect(() => {
    if (!fetchRequested || isLoaded || !mediaId) return;

    if (!params.phone_number_id) {
      console.warn("⚠️ [useMessageMedia] Aborting fetch - phone_number_id is missing");
      setError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

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
        mediaFailureCounts.set(cacheKey, (mediaFailureCounts.get(cacheKey) || 0) + 1);
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
      mediaFailureCounts.set(cacheKey, (mediaFailureCounts.get(cacheKey) || 0) + 1);
      return "";
    });

    if (!existing) {
      mediaInFlight.set(cacheKey, request);
      request.finally(() => mediaInFlight.delete(cacheKey));
    }

    request
      .then((downloadedUrl: string) => {
        if (!mountedRef.current) return;
        if (downloadedUrl) {
          setUrl(downloadedUrl);
          setIsLoaded(true);
          setLoading(false);
          setError(false);
        } else {
          setLoading(false);
          setError(true);
        }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoading(false);
        setError(true);
      });
  }, [fetchRequested, isLoaded, mediaId, cacheKey, params, messageType]);

  const loadMedia = useCallback(() => {
    setError(false);
    setFetchRequested(true);
  }, []);

  return {
    url,
    loading,
    error,
    isLoaded,
    loadMedia,
  };
}
