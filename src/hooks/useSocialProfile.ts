import { useEffect, useState } from 'react';
import API from '../config/axios';

export interface SocialProfile {
  name: string;
  username: string;
  profilePic: string;
  followerCount?: number;
  isUserFollowBusiness?: boolean;
  isVerifiedUser?: boolean;
}

// Live Messenger / Instagram customer profile. profile_pic URLs expire after a few
// days, so this is intentionally not persisted to the local DB.
export function useSocialProfile(chatId: string | undefined, channel: string): SocialProfile | null {
  const [profile, setProfile] = useState<SocialProfile | null>(null);

  useEffect(() => {
    setProfile(null);
    if (!chatId || (channel !== 'messenger' && channel !== 'instagram')) return;

    let cancelled = false;
    API.get(`/chats/${chatId}/social-profile`)
      .then((res) => {
        if (!cancelled) setProfile(res.data?.profile ?? null);
      })
      .catch(() => {
        // consent / blocked / expired token: keep stored name and initial avatar
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, channel]);

  return profile;
}
