/**
 * Centralized Image and Asset Paths
 * All brand logos, app icons, splash graphics, and backgrounds
 */

export const IMAGE_PATHS = {
  // Brand & Logos
  app_logo: require("../../assets/images/iconsac.png"),
  splash_logo: require("../../assets/images/splash-icon.png"),
  icon_primary: require("../../assets/images/icon.png"),
  icon_sac: require("../../assets/images/iconsac.png"),
  icon_old: require("../../assets/images/iconold.png"),
  logo_glow: require("../../assets/images/logo-glow.png"),
  favicon: require("../../assets/images/favicon.png"),
  expo_badge: require("../../assets/images/expo-badge.png"),
  expo_logo: require("../../assets/images/expo-logo.png"),
  react_logo: require("../../assets/images/react-logo.png"),

  // Backgrounds & Wallpaper
  chat_bg: require("../../assets/images/chatwallper.jpg"),
  chat_bg_alt: require("../../assets/images/chatwallper1.png"),

  // Android Adaptive Assets
  android_icon_foreground: require("../../assets/images/sac-icon-foreground.png"),
  android_icon_background: require("../../assets/images/android-icon-background.png"),
  android_icon_monochrome: require("../../assets/images/sac-icon-monochrome.png"),
} as const;

export default IMAGE_PATHS;