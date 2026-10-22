import { createAudioPlayer } from 'expo-audio';

let player: any = null;
let lastPlayTime = 0;
const THROTTLE_MS = 1200; // Prevent audio overlap on message bursts

export function playNotificationSound() {
  try {
    const now = Date.now();
    if (now - lastPlayTime < THROTTLE_MS) return;
    lastPlayTime = now;

    if (!player) {
      // Lazy load sound asset on first receive
      player = createAudioPlayer(require('../../assets/sounds/whatsapp_notification.mp3'));
    }

    if (player) {
      player.seekTo(0);
      player.play();
    }
  } catch (err) {
    console.warn('[audioNotification] Failed to play notification sound:', err);
  }
}
