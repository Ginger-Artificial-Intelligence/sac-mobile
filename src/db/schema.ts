import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phoneNumber: text('phone_number'),
  channel: text('channel'),
  lastMessage: text('last_message'),
  unreadCount: integer('unread_count').default(0).notNull(),
  avatar: text('avatar'),
  pinned: integer('pinned', { mode: 'boolean' }).default(false).notNull(),
  isStarred: integer('is_starred', { mode: 'boolean' }).default(false).notNull(),
  isOpen: integer('is_open', { mode: 'boolean' }).default(false).notNull(),
  assignedToName: text('assigned_to_name'),
  leadStage: text('lead_stage'),
  socialAccountId: text('social_account_id'),
  updatedAt: text('updated_at').notNull(),
  accountId: text('accountId'),
  username: text('username'),
  isBlocked: integer('is_blocked', { mode: 'boolean' }).default(false).notNull(),
  isCampaignChat: integer('is_campaign_chat', { mode: 'boolean' }).default(false).notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').references(() => chats.id, { onDelete: 'cascade' }).notNull(),
  // content: the actual message body (maps to MessageItem.content)
  text: text('text').notNull(),
  sender: text('sender'),
  isOutgoing: integer('is_outgoing', { mode: 'boolean' }).default(false).notNull(),
  type: text('type').default('text').notNull(),
  mediaUrl: text('media_url'),
  status: text('status').default('sent').notNull(),
  timestamp: text('timestamp').notNull(),
  readReceipt: text('read_receipt'),
  isImage: integer('is_image', { mode: 'boolean' }).default(false).notNull(),
  rawJson: text('raw_json'),
});

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username'),
  phone: text('phone'),
  channel: text('channel'),
  status: text('status'),
  subStatus: text('sub_status'),
  lastActivity: text('last_activity'),
});
