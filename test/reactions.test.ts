import { test } from "node:test";
import assert from "node:assert/strict";
import { indexReactions } from "../src/lib/reactions.ts";

const react = (emoji: string, target: string, isOutgoing = false, who = "u1") => ({
  isOutgoing,
  contacts: { wa_user_id: who },
  message: { reaction: { message_id: target, emoji } },
});

test("a later reaction replaces the earlier one and an empty emoji removes it", () => {
  const { hidden, byTarget } = indexReactions([react("👍", "m1"), react("❤️", "m1"), react("🎉", "m2"), react("", "m2")]);
  assert.deepEqual([...hidden], [0, 1, 2, 3]);
  assert.deepEqual(byTarget.get("m1"), [{ emoji: "❤️", fromMe: false }]);
  assert.equal(byTarget.has("m2"), false);
});

test("our own reaction is marked fromMe and ordinary messages are left alone", () => {
  const { hidden, byTarget } = indexReactions([{ message: { text: "hi" } }, react("👍", "m1", true)]);
  assert.deepEqual([...hidden], [1]);
  assert.deepEqual(byTarget.get("m1"), [{ emoji: "👍", fromMe: true }]);
});
