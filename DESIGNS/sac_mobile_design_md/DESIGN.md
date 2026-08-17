---
name: Proton CRM
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434751'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737782'
  outline-variant: '#c3c6d2'
  surface-tint: '#2f5ea6'
  primary: '#00326b'
  on-primary: '#ffffff'
  primary-container: '#10488f'
  on-primary-container: '#95b9ff'
  inverse-primary: '#abc7ff'
  secondary: '#006d2f'
  on-secondary: '#ffffff'
  secondary-container: '#5dfd8a'
  on-secondary-container: '#007232'
  tertiary: '#2b343d'
  on-tertiary: '#ffffff'
  tertiary-container: '#414b54'
  on-tertiary-container: '#b1bbc6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#abc7ff'
  on-primary-fixed: '#001b3f'
  on-primary-fixed-variant: '#0a458c'
  secondary-fixed: '#66ff8e'
  secondary-fixed-dim: '#3de273'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005322'
  tertiary-fixed: '#d9e4ef'
  tertiary-fixed-dim: '#bdc8d3'
  on-tertiary-fixed: '#131d25'
  on-tertiary-fixed-variant: '#3e4851'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 12px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  sidebar-width: 240px
  thread-list-width: 320px
  info-panel-width: 300px
  container-padding: 12px
---

## Brand & Style

This design system is engineered for productivity, clarity, and enterprise reliability. It targets professional sales and support teams who require a high-density, low-friction interface for managing complex communication workflows. 

The visual style is **Corporate / Modern**, characterized by a systematic approach to hierarchy and state management. It prioritizes functional efficiency through a clean, multi-pane layout, subtle depth markers, and a rigorous adherence to a professional color palette. The emotional response is one of organized control, trust, and operational speed.

## Colors

The palette is anchored by a deep **Primary Blue (#10488F)**, used for high-importance actions, active navigation states, and brand presence. This is balanced by **WhatsApp Green (#25D366)**, reserved strictly for status indicators, messaging-specific iconography, and "Open" states to maintain platform familiarity.

Neutral surfaces utilize a cool-gray scale to differentiate functional zones. The background uses a very light off-white, while secondary containers and sidebar headers use subtle grays to create a "paneled" look. Success, warning, and error states follow standard utility conventions but are tempered to remain cohesive with the professional aesthetic.

## Typography

The typography system uses **Plus Jakarta Sans** across all roles to provide a friendly yet highly legible Sans-Serif experience. The scale is intentionally tight to support a data-dense environment. 

Weights are used strategically: **600-700** for structural headers and navigation, **500** for interactive elements like buttons and tabs, and **400** for message content and descriptive text. Metadata (timestamps, status text) is set in smaller sizes with increased tracking for legibility.

## Layout & Spacing

The design system employs a **Fixed Multi-Pane Grid** model. The interface is divided into functional columns with dedicated responsibilities: Global Navigation (slim sidebar), Contextual List (thread selection), Primary Workspace (chat/details), and Information Panel (metadata).

A strict 4px base unit governs all spacing. Vertical rhythm is tight, using 12px or 16px margins to maximize information density. Content containers utilize "Safe Margins" of 16px to prevent visual crowding against pane borders. Components within lists (like chat items) use 8px of internal padding to maintain a compact but touch-friendly target.

## Elevation & Depth

Hierarchy is achieved primarily through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows. 

1.  **Level 0 (Base):** The main background uses the lightest neutral tint.
2.  **Level 1 (Panes):** Secondary sidebars and the header use a slightly darker neutral or white with a 1px border (#E2E8F0) to separate functional areas.
3.  **Level 2 (Active Cards):** Active items (like the selected chat thread) use a light blue tint (#E8F2FE) and a primary-colored vertical accent bar.
4.  **Level 3 (Overlays):** Modals and dropdowns use a soft, diffused ambient shadow (10% opacity) to signify temporary focus over the workspace.

## Shapes

The design system utilizes a **Rounded** aesthetic with an 8px (0.5rem) base corner radius. This softens the high-density layout, making the software feel more approachable. 

- **Standard (8px):** Used for buttons, input fields, cards, and list item hover states.
- **Large (16px):** Used for primary workspace containers and chat bubbles to create a distinct "nesting" effect.
- **Pill:** Reserved exclusively for status badges and notification counters to differentiate them from interactive buttons.

## Components

### Buttons & Inputs
- **Primary Action:** Solid Primary Blue background with white text, 8px rounding.
- **Secondary Action:** White background, 1px border (#E2E8F0), Primary Blue text.
- **Inputs:** 1px border (#E2E8F0) that transitions to Primary Blue on focus. Labels are positioned above the input using `label-lg` typography.

### Messaging Elements
- **Chat Bubbles:** Left-aligned (incoming) are light gray; right-aligned (outgoing) are white with a subtle border. Both use 12px-16px rounding.
- **Status Indicators:** Small 8px circles or pill-shaped badges using the secondary green or primary blue for unread counts.

### Navigation
- **Sidebar Items:** Icons are centered with labels underneath or to the side. Active states use a solid Primary Blue background or a high-contrast text color shift.
- **Tabs:** Underline style with a 2px Primary Blue bar for the active state, utilizing `label-lg` typography for the text.

### Cards
- Profile information and "Useful Actions" are grouped in cards with a white background and a 1px neutral border. No shadow is applied to standard cards to keep the UI flat and clean.