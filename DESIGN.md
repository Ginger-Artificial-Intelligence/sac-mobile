---
name: SAC Mobile
description: A white, navy-tinted team messaging inbox in the category standard (WhatsApp Business, Telegram, Google Messages), with green reserved for unread and success.
colors:
  primary: "#00326b"
  primary-container: "#10488f"
  primary-tint: "#e4ecfa"
  on-primary: "#ffffff"
  unread-green: "#0e8344"
  on-unread: "#ffffff"
  success-text: "#0b7a3e"
  success-container: "#d8f5e4"
  surface: "#ffffff"
  surface-well: "#f3f6fb"
  surface-container: "#ebf0f7"
  surface-container-high: "#e2e9f3"
  surface-container-highest: "#d8e1ee"
  on-surface: "#0f1a2a"
  on-surface-variant: "#414b5a"
  outline: "#667085"
  outline-variant: "#cfd6e1"
  divider: "rgba(15,26,42,0.08)"
  error: "#ba1a1a"
  error-container: "#ffdad6"
  warning: "#b45309"
  chat-bg: "#efeae2"
typography:
  headline-xl:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.3px"
  headline-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "16.5px"
    fontWeight: 500
    lineHeight: "22px"
  body:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "21px"
  secondary:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Plus Jakarta Sans"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  xxl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  search-pill:
    backgroundColor: "{colors.surface-well}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xxl}"
    height: "48px"
    padding: "0 6px 0 16px"
  filter-chip:
    backgroundColor: "{colors.surface-well}"
    textColor: "{colors.on-surface-variant}"
    rounded: "18px"
    height: "36px"
    padding: "0 14px"
  filter-chip-selected:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary}"
  chat-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    height: "72px"
    padding: "10px 16px 10px 16px"
  chat-row-selected:
    backgroundColor: "{colors.primary-tint}"
  avatar:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: "52px"
  unread-badge:
    backgroundColor: "{colors.unread-green}"
    textColor: "{colors.on-unread}"
    rounded: "11px"
    height: "22px"
  fab:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "18px"
    size: "56px"
  tab-bar:
    backgroundColor: "{colors.surface}"
    height: "68px"
  tab-indicator:
    backgroundColor: "{colors.primary-tint}"
    rounded: "16px"
    width: "60px"
    height: "32px"
  card:
    backgroundColor: "{colors.surface-well}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: SAC Mobile

## Overview

**Creative North Star: "The Category Standard, Played Straight"**

SAC Mobile is a white messaging inbox finished to the level of the apps its users already know: WhatsApp Business, Telegram, a Zoho or Intercom team inbox, Google Messages. Agents and owners use it one-handed, in short bursts, often in daylight, so the system chooses familiarity and legibility over novelty. The ground is white; neutrals are tinted toward navy; navy carries brand, titles and primary actions; green appears only for unread and success.

The system rejects the earlier pale-blue card-on-card dashboard look and decorative borders. Structure comes from spacing, tonal wells and a single inset hairline. Plus Jakarta Sans is the only typeface, on one type scale.

The conversation screen (`src/app/chat/[id].tsx` and `src/components/whatsapp/*`) is outside this system. It was not part of the redesign and keeps its WhatsApp-like look (`chat-bg` beige wallpaper, its own bubbles). Do not apply or extend these rules there unasked.

**Key Characteristics:**
- White ground, navy-tinted wells (`surface-well`) instead of cards and borders.
- Navy for brand and action, green only for unread and success.
- Round avatars, pill search, pill filter chips, Material 3 bottom bar with a tinted pill indicator.
- Rows over cards: lists are hairline-divided rows, not boxed tiles.
- Light and dark themes share one token set (dark values in the sidecar).

## Colors

A restrained palette: one navy, one green, tinted neutrals. Tokens live in `src/constants/theme.ts` (`LIGHT_COLORS`, `DARK_COLORS`) and are read through `useThemeStore().colors`.

### Primary
- **Deep Brand Navy** (`primary`): large screen titles, selected tab icon, selected chip text, avatar initials, the FAB fill, section titles on the dashboard.
- **Navy Container** (`primary-container`): defined for deeper navy surfaces; use sparingly.
- **Pale Navy Tint** (`primary-tint`): selected chip, tab indicator pill, avatar ground, selected chat row, open filter button, pressed ripple base. Not a card background.

### Secondary
- **Unread Green** (`unread-green`): unread badge fill only (white 12px text on it needs 4.5:1).
- **Success Green Text** (`success-text`): unread timestamp and the dashboard figure when unread chats exist. `success-container` is the matching soft fill.

### Neutral
- **Ink Navy** (`on-surface`): primary text, names, titles.
- **Slate** (`on-surface-variant`): secondary text, unselected chip labels, menu icon.
- **Outline Grey** (`outline`): timestamps, last message when read, unselected tab, placeholders, quiet metadata.
- **Hairline** (`divider`, 8% ink): row dividers, tab bar top edge, dashboard row separators.
- **Wells** (`surface-well`, `surface-container` through `surface-container-highest`): search pill, unselected chips, cards. Stepped navy-tinted greys.
- **Error / Warning** (`error`, `error-container`, `warning`): escalated chats, SLA pending, failed loads.

### Named Rules
**The Green Is a Signal Rule.** Green means unread or success and nothing else. A chat that does not need a reply never shows green.

**The Navy Acts Rule.** Navy marks identity and the thing you can do next (titles, FAB, selected state). Decoration never uses it.

**The Theme Token Rule.** Colour comes from `colors.*` so dark mode follows. A literal hex in a screen is drift (see the open items below).

## Typography

**Font:** Plus Jakarta Sans (system fallback only while loading), loaded in `src/app/_layout.tsx` as four files: 400 Regular, 500 Medium, 600 SemiBold, 700 Bold.

**Character:** A friendly, slightly geometric sans that stays legible at 12px and still has presence at 26px.

The shared `Text` component (`src/components/ui/Text.tsx`) maps the requested `fontWeight` to the matching file (>=700 Bold, 600 SemiBold, 500 Medium, otherwise Regular) and sets `fontFamily` itself. Weight 800 therefore renders as Bold. Always use `Text`, never the raw RN text, so the app face holds against phone system-font settings.

### Hierarchy
- **Large title** (700, 26/32, -0.3 tracking, navy): the main screen title in `TopAppBar` with `largeTitle`.
- **Screen title** (700, 22/28, -0.3, ink): standard top bar title.
- **Row title** (500, 16.5/22; 700 when unread): chat name, dashboard row labels.
- **Body** (400, 15/21, up to 16 in inputs): general text, key-value rows.
- **Secondary** (400, 14/20; 500 when unread): last message, chip labels (14, 500, 700 selected).
- **Label** (500, 12/16): timestamps, status line, tab labels (700 when selected), dashboard section titles use 13/18 700 navy.
- **Badge** (700, 11 to 12): unread count, lead and escalated pills.

The named scale constants are `FONT_SIZES`, `LINE_HEIGHTS`, `TYPOGRAPHY` in `src/constants/typography.ts`; many screens still inline equivalent values.

### Named Rules
**The Weight Carries State Rule.** Unread is shown by weight and colour together (name 500 to 700, time to green 700, last message to 500 ink). Do not add size changes.

## Layout

Single-column, phone-first. Screen gutter is 16px. Spacing scale is `SPACING` (4, 8, 12, 16, 24, 32). First viewport of the inbox: top bar with large navy title, a 48px pill search, one horizontally scrolling row of 36px filter chips, then 72px chat rows, with a navy FAB above a docked four-tab bar (Chats, Contacts, Dashboard, Profile). List content leaves about 112px plus the safe-area inset at the bottom so the FAB and bar never cover the last row. Dashboard and profile follow the same rhythm: section title, then 48 to 64px rows separated by hairlines, no boxed groups.

Chat row anatomy: 16px left inset, 52px avatar, 12px gap, then a content block that carries the hairline divider so the line starts after the avatar. Line one is name and time; line two is last message; a quiet status line (lead stage, Open/Closed, assignee, keyword, SLA) sits below at 12px. Unread badge sits trailing.

Platform: Android gets a foreground ripple, iPhone gets a 60% opacity press state. Respect safe-area insets on top bar and tab bar.

## Elevation & Depth

Flat by default. Depth comes from tonal wells (`surface-well` on white) and one hairline, not from shadows. The only shadows are on floating controls: the navy FAB (offset 0/4, opacity 0.4, radius 12, elevation 8) and the small speed-dial buttons (offset 0/2, opacity 0.15, radius 4, elevation 4). Neither is soft-ambient decoration; they exist to separate a floating control from scrolling rows.

### Named Rules
**The Flat Rows Rule.** Rows, search, chips and the tab bar carry no shadow. Only controls that float above the list may.

## Shapes

Pills and circles dominate: avatars are circles, search is a 24px-radius pill, chips and filter buttons are 18px pills (36px tall), the unread badge is an 11px-radius pill, the tab indicator is a 32px-tall pill. The FAB is a rounded square (56px, 18px radius), the one square-ish form, which marks it as the primary action. Cards use 16px radius. Dividers are 1px hairlines inset from the avatar. There are no decorative borders; the only strokes are the hairline, the selection checkbox ring, and the tab bar top edge.

## Components

### Search Pill
48px tall, `surface-well` fill, 24px radius, search icon at left, filter (tune) button at right that tints to `primary-tint` when open or when any dropdown filter is active (shows the count). Entered text is 16px Plus Jakarta Sans regular.

### Chips (filter)
36px tall, 18px radius, 14px horizontal padding. Unselected: `surface-well` fill, slate 500 label. Selected: `primary-tint` fill, navy 700 label. The Unread chip appends the unread count. Dropdown filter triggers share the same pill and tint logic.

### Chat Row
72px minimum, white (`primary-tint` when selected). Avatar 52px circle on `primary-tint` with navy 19px/700 initial, a groups glyph for groups, or the photo. Name and time on line one, last message line two, status line three. Unread state: 700 name, green 700 time, ink 500 last message, green badge (22px high, min 22 wide). Star and pin icons sit above the badge. Lead-stage and Escalated render as small 18px-high pills; everything else on the status line is quiet text. Long press selects; a selection ring appears at left. A 22px channel mark (WhatsApp, Messenger or Instagram, in that brand's own colour, white glyph, 2px ring in the row ground) sits on the avatar's lower right corner; it is the only place brand colours appear.

### Avatar
Circle on tint, fallback initial in navy 700. The shared `Avatar` component falls back to `surface-container` with a medium initial; the inbox draws its own 52px avatar inline.

### Top App Bar
56px plus top inset, white. Optional menu button at left, title (large navy 26/700 for primary screens), right action slot. No bottom border.

### Bottom Tab Bar
Material 3 style: 68px bar, white, 1px `divider` top edge, 60 by 32 `primary-tint` pill indicator behind a 22px icon, label 12px below (700 ink when selected, 500 outline when not). The indicator follows swipe position and springs on tap (reduced motion respected). Selection haptic on tap.

### FAB
56px navy rounded square, white plus icon, bottom right at 16px from the edge, above the tab bar. Tapping opens a speed dial of 42px `primary-tint` circular mini buttons with dark tooltip labels (Sync Filters, Add Contact, New Chat); the icon turns to close.

### Card
`surface-well` fill, 16px radius, 16px padding, no border, no shadow. Used sparingly; the dashboard and profile prefer hairline rows.

### Header Actions
Screen-level actions live in the top app bar's right slot as 44px icon buttons, not in a toolbar under the search: Contacts carries Import (outline grey) and Add contact (navy). Counts go in the search placeholder ("Search 2,555 contacts"), not on a line of their own.

### Dashboard Rows
"Needs you now" rows are tappable: each opens Chats with the matching quick filter (Unread, Open, Starred, All) and carries a trailing chevron.

### Selection Bar
Multi-select of chats is shown in the top app bar (count, star, pin, mute) while the FAB hides.

## Do's and Don'ts

### Do:
- **Do** read colours from `useThemeStore().colors` and render text through `src/components/ui/Text.tsx`.
- **Do** reserve green for unread and success, and navy for brand and primary action.
- **Do** build lists as hairline-divided rows with the divider inset from the avatar.
- **Do** keep touch targets at least 36px tall (chips, filter button) and rows 64px or more.
- **Do** give dark mode the same structure with `DARK_COLORS`; verify both themes on a device.
- **Do** leave the chat conversation screen alone; it keeps its WhatsApp-like look.

### Don't:
- **Don't** return to pale-blue card-on-card dashboards or boxed groups for lists.
- **Don't** add decorative borders or shadows to rows, chips, search or the tab bar.
- **Don't** use green for anything that is not unread or success.
- **Don't** introduce a second typeface or a weight outside 400, 500, 600, 700 (800 collapses to 700).
- **Don't** hard-code hex values in screens; add a token instead.
