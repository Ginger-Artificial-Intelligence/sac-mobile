---
version: 1
slug: "src-screens-inbox-tsx"
primary_target: "src/screens/inbox.tsx"
related_targets: ["src/screens/index.tsx","src/screens/contacts.tsx","src/screens/profile.tsx","src/app/login.tsx","src/app/index.tsx"]
---

# Surface brief: app shell and main screens

Scope: inbox, dashboard, contacts, profile, login and the shared shell (header, tab bar, cards, badges). Chat keeps its WhatsApp-like look. Mode: Operate.

Audience and job: agents and owners answering customer chats one-handed, in short bursts, often in daylight. Task: see who needs a reply and open that chat.

Reference bar (user-chosen): WhatsApp Business, Telegram, Intercom/Zoho-style team inbox, Google Messages (Material 3).

## Direction contract

THESIS: The category standard, played straight: a white messaging inbox at the finish of the four reference apps. It refuses the old pale-blue card-on-card dashboard look and every decorative border.

OWN-WORLD: White ground, navy-tinted neutrals for wells and dividers, navy (#00326b) for brand, titles and primary actions, WhatsApp green only for unread and success. Round avatars, pill search, filter chips, Material 3 bottom bar with a tinted pill indicator. Plus Jakarta Sans, one type scale.

STORY: The user sees unread chats first (green badge, bold name, green time), knows who owns each chat, and opens it in one tap.

FIRST VIEWPORT: Large navy title with the user's name, pill search under it, one row of filter chips, then 74px chat rows: 50px avatar, name and time on line one, last message and green unread badge on line two, hairline divider inset from the avatar. Navy FAB bottom right above a four-tab bar.

FORM: Canon (standing exit), chosen by the user over the assigned roll. seed:e15f679d63176f74

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
