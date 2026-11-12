/**
 * Copy text to the clipboard. `expo-clipboard` is a native module: loading it lazily means a dev build
 * that was made before the package was added still runs (copy just reports failure) instead of the
 * import crashing the whole screen. Rebuild the app to enable copying.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const Clipboard = require('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch (e) {
    console.warn('[clipboard] unavailable (rebuild the app to include expo-clipboard):', e);
    return false;
  }
}
