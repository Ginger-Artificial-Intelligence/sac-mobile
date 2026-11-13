# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Two groups, equally important (confirmed):

- **Support and sales agents** answering customer chats from their phone, away from the desk and often between other tasks.
- **Business owners and managers** who watch the inbox and the workspace numbers themselves and reply when needed.

## Product Purpose

SAC CRM is the mobile agent app of EazyCRM, a multi-tenant WhatsApp and social-messaging CRM. It lets a team answer customer conversations (WhatsApp, Messenger, Instagram) from a phone with the same data as the web CRM. Success is a customer getting a correct reply quickly, without the agent needing a laptop.

## Positioning

A shared team inbox on the business's own WhatsApp Business / Meta accounts: chats are assigned, tracked and reported in the CRM, and the phone app works on stored chats when the connection is poor.

## Operating Context

- Inbox with filters (unread, open, closed, starred, assigned, account, department), pinned and starred chats, escalation and lead-stage badges.
- Chat: text, images, video, documents, audio, voice notes, templates, location and address requests; the WhatsApp 24-hour reply window decides what can be sent.
- Contacts: list, filters, add, import from CSV, contact details and reminders.
- Dashboard: unread/open counts from the phone, workspace statistics from the server.
- Profile: account details, light/dark/system appearance, log out.
- Used one-handed, in short bursts, sometimes on weak mobile data.

## Capabilities and Constraints

- Expo SDK 57 / React Native, NativeWind, Material Icons, light and dark themes driven by `src/store/themeStore`.
- Local SQLite store with background sync; realtime over one socket.
- Adding or importing a contact always requires choosing the WhatsApp account first.
- Not available in the CRM backend (do not design for them): starring a message, sending emoji reactions, translating, deleting a message for everyone.
- Open decision: saving media to the phone (needs extra native modules).

## Brand Commitments

Confirmed as binding:

- The product name shown as **SAC CRM**.
- The dark navy brand colour (`#00326b`).
- A WhatsApp-like look inside conversations (green outgoing bubbles, familiar chat behaviour).
- Standing visual preference: the category-standard look, played straight. The app should sit alongside WhatsApp Business, Telegram, Intercom/Zoho-style team inboxes and Google Messages (Material 3), and match their level of finish.

## Evidence on Hand

- Real data only: chats, contacts and statistics come from the tenant's CRM. No demo numbers, testimonials or sample customers exist, and none may be invented.
- Assets: app icon and chat wallpaper under `assets/` and `src/constants/imagePaths`.

## Product Principles

1. The reply comes first: anything that slows reading or answering a chat is wrong.
2. Familiar beats clever in the conversation: it should behave like the messaging apps agents already use.
3. Show only real state: unknown values read as unknown, never as plausible numbers.
4. Work on a bad connection: stored chats open at once and sends report failure clearly.
5. Never guess the account: contacts and messages go to the account the user chose.
