import { useEffect, useState } from 'react';
import { useNavigation } from 'expo-router';

/**
 * True once this screen's push animation has finished. Heavy first-render work (SQLite reads, big
 * lists) started before that competes with the animation on the JS thread and makes it stutter.
 * Falls back to a timer in case the navigator never emits the event (no animation, deep link, ...).
 */
export function useAfterTransition(fallbackMs = 400): boolean {
  const navigation = useNavigation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const done = () => setReady(true);
    const unsubscribe = (navigation as any).addListener('transitionEnd', done);
    const timer = setTimeout(done, fallbackMs);
    return () => {
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [navigation, ready, fallbackMs]);

  return ready;
}
