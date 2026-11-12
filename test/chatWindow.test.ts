import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeMs, lastCustomerMessageMs, isWindowClosed, mediaSizeError, DAY_MS } from '../src/lib/chatWindow.ts';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');

describe('parseTimeMs', () => {
  test('reads ISO strings (what the webhook worker stores)', () => {
    assert.equal(parseTimeMs('2026-11-12T10:00:00.000Z'), Date.parse('2026-11-12T10:00:00.000Z'));
  });
  test('reads unix seconds and milliseconds, as numbers or numeric strings', () => {
    assert.equal(parseTimeMs('1700000000'), 1700000000 * 1000);
    assert.equal(parseTimeMs(1700000000), 1700000000 * 1000);
    assert.equal(parseTimeMs(1700000000000), 1700000000000);
  });
  test('returns null for empty or garbage', () => {
    assert.equal(parseTimeMs(null), null);
    assert.equal(parseTimeMs(''), null);
    assert.equal(parseTimeMs('not a date'), null);
    assert.equal(parseTimeMs(0), null);
  });
});

describe('lastCustomerMessageMs', () => {
  test('takes the later of the chat field and the newest incoming message', () => {
    const old = '2026-11-01T00:00:00.000Z';
    const recent = '2026-11-12T11:00:00.000Z';
    assert.equal(lastCustomerMessageMs(old, recent), Date.parse(recent));
    assert.equal(lastCustomerMessageMs(recent, old), Date.parse(recent));
  });
  test('falls back to whichever exists', () => {
    assert.equal(lastCustomerMessageMs(null, '2026-11-12T11:00:00.000Z'), Date.parse('2026-11-12T11:00:00.000Z'));
    assert.equal(lastCustomerMessageMs('2026-11-12T11:00:00.000Z', undefined), Date.parse('2026-11-12T11:00:00.000Z'));
    assert.equal(lastCustomerMessageMs(null, null), null);
  });
});

describe('isWindowClosed', () => {
  test('open within 24 hours, closed after', () => {
    assert.equal(isWindowClosed(NOW - DAY_MS + 60_000, true, NOW), false);
    assert.equal(isWindowClosed(NOW - DAY_MS, true, NOW), true);
    assert.equal(isWindowClosed(NOW - 3 * DAY_MS, true, NOW), true);
  });
  test('with no customer message: closed only if the chat has history', () => {
    assert.equal(isWindowClosed(null, true, NOW), true);
    assert.equal(isWindowClosed(null, false, NOW), false);
  });
});

describe('mediaSizeError', () => {
  const mb = (n: number) => n * 1024 * 1024;
  test('WhatsApp limits', () => {
    assert.equal(mediaSizeError('whatsapp', 'image', mb(5)), null);
    assert.match(mediaSizeError('whatsapp', 'image', mb(5.1))!, /5 MB/);
    assert.match(mediaSizeError('whatsapp', 'video', mb(16))!, /15 MB/);
    assert.match(mediaSizeError('whatsapp', 'audio', mb(17))!, /16 MB/);
    assert.equal(mediaSizeError('whatsapp', 'document', mb(100)), null);
    assert.match(mediaSizeError('whatsapp', 'document', mb(101))!, /File is larger than the 100 MB/);
  });
  test('Messenger / Instagram limits', () => {
    assert.equal(mediaSizeError('instagram', 'image', mb(8)), null);
    assert.match(mediaSizeError('messenger', 'image', mb(9))!, /8 MB/);
    assert.match(mediaSizeError('messenger', 'video', mb(26))!, /25 MB/);
  });
  test('unknown size is not rejected', () => {
    assert.equal(mediaSizeError('whatsapp', 'video', null), null);
    assert.equal(mediaSizeError('whatsapp', 'video', 0), null);
  });
});
