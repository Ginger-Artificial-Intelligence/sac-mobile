import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractChats,
  extractMessages,
  extractContacts,
  getNextChatCursor,
  checkHasMoreChats,
  mapApiChat,
  mapApiMessage,
} from '../src/lib/chatMapping.ts';

describe('extractChats', () => {
  test('reads each known response shape', () => {
    assert.deepEqual(extractChats({ data: [{ a: 1 }] }), [{ a: 1 }]);
    assert.deepEqual(extractChats({ chats: [{ a: 2 }] }), [{ a: 2 }]);
    assert.deepEqual(extractChats({ data: { chats: [{ a: 3 }] } }), [{ a: 3 }]);
  });
  test('returns [] for anything else', () => {
    assert.deepEqual(extractChats(null), []);
    assert.deepEqual(extractChats({}), []);
    assert.deepEqual(extractChats({ data: 'nope' }), []);
  });
});

describe('extractMessages', () => {
  test('reads each known response shape', () => {
    assert.deepEqual(extractMessages({ data: { messages: [{ id: 1 }] } }), [{ id: 1 }]);
    assert.deepEqual(extractMessages({ data: [{ id: 2 }] }), [{ id: 2 }]);
    assert.deepEqual(extractMessages({ messages: [{ id: 3 }] }), [{ id: 3 }]);
    assert.deepEqual(extractMessages([{ id: 4 }]), [{ id: 4 }]);
  });
  test('flattens date groups and keeps loose messages', () => {
    const res = {
      messages: [
        { _id: '2026-11-01', messages: [{ id: 'a' }, { id: 'b' }] },
        { id: 'c' },
        null,
      ],
    };
    assert.deepEqual(extractMessages(res), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
  test('returns [] for unknown input', () => {
    assert.deepEqual(extractMessages(undefined), []);
    assert.deepEqual(extractMessages({ status: 'ok' }), []);
  });
});

describe('extractContacts', () => {
  test('reads each known response shape', () => {
    assert.deepEqual(extractContacts({ contacts: [1] }), [1]);
    assert.deepEqual(extractContacts({ data: { contacts: [2] } }), [2]);
    assert.deepEqual(extractContacts({ data: { data: [3] } }), [3]);
    assert.deepEqual(extractContacts({ data: [4] }), [4]);
    assert.deepEqual(extractContacts([5]), [5]);
    assert.deepEqual(extractContacts({}), []);
  });
});

describe('getNextChatCursor', () => {
  test('null when there is no response or the server says no more', () => {
    assert.equal(getNextChatCursor(null), null);
    assert.equal(getNextChatCursor({ hasMore: false, nextCursor: 'x' }), null);
    assert.equal(getNextChatCursor({ pageInfo: { hasNextPage: false, endCursor: 'x' } }), null);
    assert.equal(getNextChatCursor({ data: { pageInfo: { hasMore: false } } }), null);
  });
  test('uses pageInfo cursors when there is a next page (start before end)', () => {
    assert.equal(getNextChatCursor({ pageInfo: { hasNextPage: true, endCursor: 'end' } }), 'end');
    assert.equal(
      getNextChatCursor({ data: { pageInfo: { hasMore: true, startCursor: 's', endCursor: 'e' } } }),
      's'
    );
  });
  test('falls back to nextCursor fields', () => {
    assert.equal(getNextChatCursor({ nextCursor: 'n1' }), 'n1');
    assert.equal(getNextChatCursor({ meta: { nextCursor: 'n2' } }), 'n2');
    assert.equal(getNextChatCursor({ data: { nextCursor: 'n3' } }), 'n3');
    assert.equal(getNextChatCursor({}), null);
  });
});

describe('checkHasMoreChats', () => {
  test('explicit false beats everything', () => {
    assert.equal(checkHasMoreChats({ hasMore: false, nextCursor: 'x' }, 30, 30), false);
    assert.equal(checkHasMoreChats({ pageInfo: { hasNextPage: false } }, 30, 30), false);
  });
  test('explicit true wins even for a short page', () => {
    assert.equal(checkHasMoreChats({ hasMore: true }, 5, 30), true);
    assert.equal(checkHasMoreChats({ data: { pageInfo: { hasNextPage: true } } }, 5, 30), true);
  });
  test('empty or short page means no more', () => {
    assert.equal(checkHasMoreChats({ nextCursor: 'x' }, 0, 30), false);
    assert.equal(checkHasMoreChats({ nextCursor: 'x' }, 10, 30), false);
  });
  test('full page with a cursor means more; without a cursor it does not', () => {
    assert.equal(checkHasMoreChats({ nextCursor: 'x' }, 30, 30), true);
    assert.equal(checkHasMoreChats({}, 30, 30), false);
    assert.equal(checkHasMoreChats(null), false);
  });
});

describe('mapApiChat', () => {
  test('maps the basic fields', () => {
    const chat = mapApiChat({
      _id: 'c1',
      name: 'Ann',
      phoneNumber: '+911',
      channel: 'whatsapp',
      lastMessage: 'hi',
      unreadCount: '3',
      isPinned: true,
      isStarred: 1,
      assignedTo: { name: 'Bob' },
      leadInfo: { status: 'hot' },
      updatedAt: '2026-11-01T10:00:00.000Z',
    });
    assert.equal(chat.id, 'c1');
    assert.equal(chat.name, 'Ann');
    assert.equal(chat.phoneNumber, '+911');
    assert.equal(chat.unreadCount, 3);
    assert.equal(chat.pinned, true);
    assert.equal(chat.isStarred, true);
    assert.equal(chat.isBlocked, false);
    assert.equal(chat.assignedToName, 'Bob');
    assert.equal(chat.leadStage, 'hot');
    assert.equal(chat.avatar, 'A'); // initial when there is no picture
    assert.equal(chat.updatedAt, '2026-11-01T10:00:00.000Z');
  });
  test('name falls back to the phone number, then a default', () => {
    assert.equal(mapApiChat({ _id: '1', phoneNumber: '+91999' }).name, '+91999');
    assert.equal(mapApiChat({ _id: '2' }).name, 'CRM User');
  });
  test('prefers a real social profile picture over the initial', () => {
    const chat = mapApiChat({ _id: '1', name: 'Ann', socialProfile: { profilePic: 'http://p/x.jpg', username: 'ann_ig' } });
    assert.equal(chat.avatar, 'http://p/x.jpg');
    assert.equal(chat.username, 'ann_ig');
  });
  test('turns a numeric timestamp into an ISO string', () => {
    const chat = mapApiChat({ _id: '1', lastMessageTime: 1700000000000 });
    assert.equal(chat.updatedAt, '2023-11-14T22:13:20.000Z');
  });
  test('resolves the account id from the first usable source and ignores junk strings', () => {
    const chat = mapApiChat({
      _id: '1',
      socialAccountId: 'undefined',
      account_id: '  ',
      socialAccount: { phone_number_id: '12345' },
    });
    assert.equal(chat.socialAccountId, '12345');
    assert.equal(chat.accountId, '12345');
    assert.equal(mapApiChat({ _id: '2' }).socialAccountId, null);
  });
  test('reads department, quick-assist keyword and campaign', () => {
    const chat = mapApiChat({
      _id: '1',
      departments: [{ _id: 'd1' }, { _id: 'd2' }],
      latestQuickAssistKeyword: 'refund',
      campaignId: { _id: 'camp1' },
    });
    assert.equal(chat.departmentId, 'd1');
    assert.equal(chat.quickAssistKeyword, 'refund');
    assert.equal(chat.campaignId, 'camp1');
    const plain = mapApiChat({ _id: '2', campaignId: 'camp2', department: 'd9' });
    assert.equal(plain.campaignId, 'camp2');
    assert.equal(plain.departmentId, 'd9');
  });
  test('reads the 24-hour-window time and group fields (also from a nested chat)', () => {
    const chat = mapApiChat({ _id: '1', last_msg_received_at: '1700000000', isGroup: true, waGroupId: 'g-1' });
    assert.equal(chat.lastMsgReceivedAt, '1700000000');
    assert.equal(chat.isGroup, true);
    assert.equal(chat.waGroupId, 'g-1');
    const nested = mapApiChat({ _id: '2', chat: { last_msg_received_at: '1700000001', isGroup: true } });
    assert.equal(nested.lastMsgReceivedAt, '1700000001');
    assert.equal(nested.isGroup, true);
    const plain = mapApiChat({ _id: '3' });
    assert.equal(plain.lastMsgReceivedAt, null);
    assert.equal(plain.isGroup, false);
    assert.equal(plain.waGroupId, null);
  });
  test('keeps the raw payload as JSON', () => {
    const raw = { _id: '1', name: 'Ann', extra: { a: 1 } };
    assert.deepEqual(JSON.parse(mapApiChat(raw).rawJson as string), raw);
  });
});

describe('mapApiMessage', () => {
  test('maps an incoming text message', () => {
    const msg = mapApiMessage(
      { _id: 'm1', content: 'hello', message_type: 'text', status: 2, createdAt: '2026-11-01T10:00:00.000Z', senderId: 'u9' },
      'chat1'
    );
    assert.equal(msg.id, 'm1');
    assert.equal(msg.chatId, 'chat1');
    assert.equal(msg.text, 'hello');
    assert.equal(msg.type, 'text');
    assert.equal(msg.isOutgoing, false);
    assert.equal(msg.sender, 'u9');
    assert.equal(msg.timestamp, '2026-11-01T10:00:00.000Z');
    assert.equal(msg.isImage, false);
  });
  test('detects outgoing messages from the different flags', () => {
    assert.equal(mapApiMessage({ _id: '1', isOutgoing: true }, 'c').isOutgoing, true);
    assert.equal(mapApiMessage({ _id: '2', fromCrm: true }, 'c').isOutgoing, true);
    assert.equal(mapApiMessage({ _id: '3', flag: 'Outgoing' }, 'c').isOutgoing, true);
    assert.equal(mapApiMessage({ _id: '4', flag: 'send' }, 'c').isOutgoing, true);
    assert.equal(mapApiMessage({ _id: '5', message: { flag: 'send' } }, 'c').isOutgoing, true);
    assert.equal(mapApiMessage({ _id: '6', flag: 'incoming' }, 'c').isOutgoing, false);
    assert.equal(mapApiMessage({ _id: '7', flag: 'send' }, 'c').sender, 'You');
    assert.equal(mapApiMessage({ _id: '8' }, 'c').sender, 'Contact');
  });
  test('text falls back to nested message fields', () => {
    assert.equal(mapApiMessage({ _id: '1', message: { text: 'nested' } }, 'c').text, 'nested');
    assert.equal(mapApiMessage({ _id: '2', message: { caption: 'cap' } }, 'c').text, 'cap');
    assert.equal(mapApiMessage({ _id: '3' }, 'c').text, '');
  });
  test('finds the media url and flags images', () => {
    const img = mapApiMessage({ _id: '1', message_type: 'image', message: { image: { url: 'http://m/1.jpg' } } }, 'c');
    assert.equal(img.mediaUrl, 'http://m/1.jpg');
    assert.equal(img.isImage, true);
    assert.equal(mapApiMessage({ _id: '2', media_url: 'http://m/2.mp4', type: 'video' }, 'c').mediaUrl, 'http://m/2.mp4');
    assert.equal(mapApiMessage({ _id: '3' }, 'c').mediaUrl, null);
  });
  test('id falls back through messageId and nested ids', () => {
    assert.equal(mapApiMessage({ messageId: 'mid' }, 'c').id, 'mid');
    assert.equal(mapApiMessage({ message: { id: 'wamid.X' } }, 'c').id, 'wamid.X');
  });
  test('numeric timestamps become ISO strings', () => {
    assert.equal(mapApiMessage({ _id: '1', timestamp: 1700000000000 }, 'c').timestamp, '2023-11-14T22:13:20.000Z');
  });
});

import { getContactsPayload } from '../src/lib/messageUtils.ts';

test('a shared contact card is read from the message, not the sender profile at the top level', () => {
  const stored = {
    contacts: { name: 'ali-d-coded', wa_user_id: '919072283042' },
    message: { type: 'contacts', contacts: [{ name: { formatted_name: 'Abdul Salam' }, phones: [{ phone: '+91 98959 59576', type: 'MOBILE' }] }] },
  };
  const cards = getContactsPayload(stored);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].name.formatted_name, 'Abdul Salam');
  assert.deepEqual(getContactsPayload({ contacts: { name: 'x', wa_user_id: '1' }, message: {} }), []);
});
