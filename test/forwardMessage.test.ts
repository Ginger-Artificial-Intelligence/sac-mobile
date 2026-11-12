import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForwardPayload, canForwardMessage } from "../src/lib/forwardMessage.ts";

const target = { _id: "c1", phoneNumber: "+91 98765-43210" };

test("a text message forwards its text to every target with a +number", () => {
  const body = buildForwardPayload({ type: "text", content: "hi", message: { text: { body: "hi" } } }, [target], "pn1");
  assert.equal(body.msgType, "text");
  assert.deepEqual(body.messageObj, { text: { body: "hi" } });
  assert.deepEqual(body.targetContacts, [{ phone: "+919876543210", chatId: "c1" }]);
  assert.equal(body.phone_number_id, "pn1");
});

test("media needs an id, documents carry a format, unsupported types are refused", () => {
  assert.throws(() => buildForwardPayload({ type: "image", message: { image: {} } }, [target], ""), /media identifier/);
  const doc = buildForwardPayload({ type: "document", message: { document: { id: "m9", filename: "a.pdf" } } }, [target], "");
  assert.deepEqual(doc.messageObj, { mediaId: "m9", caption: "", filename: "a.pdf", format: "pdf" });
  assert.equal(canForwardMessage({ type: "order" }), false);
  assert.throws(() => buildForwardPayload({ type: "order" }, [target], ""), /cannot be forwarded/);
});

test("one to five targets only", () => {
  assert.throws(() => buildForwardPayload({ type: "text", content: "x" }, [], ""), /between one and five/);
  assert.throws(() => buildForwardPayload({ type: "text", content: "x" }, Array(6).fill(target), ""), /between one and five/);
});
