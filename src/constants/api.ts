// Set these in .env.local (see .env.example). EXPO_PUBLIC_* values are inlined at bundle time,
// so fully reload the app after changing them. Keep access static (`process.env.EXPO_PUBLIC_X`):
// bracket access and destructuring are not inlined. Defaults point at production.
const trimSlash = (url: string) => url.replace(/\/+$/, '');

export const GATEWAY_URL = trimSlash(
  process.env.EXPO_PUBLIC_API_GATEWAY_URL || 'https://premiumapigateway.scribbleandconnect.com'
);

export const BASE_URL = `${GATEWAY_URL}/api/v1/backend`;

// Origin header sent on the socket handshake (the gateway checks it against its CORS allow-list).
export const SOCKET_ORIGIN =
  process.env.EXPO_PUBLIC_SOCKET_ORIGIN || 'https://premiumcrm.scribbleandconnect.com';
