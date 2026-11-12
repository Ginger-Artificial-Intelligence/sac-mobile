import { test } from "node:test";
import assert from "node:assert/strict";
import { fillVariables, resolveTemplateView } from "../src/lib/templateView.ts";

test("variables are filled by position and by name", () => {
  assert.equal(fillVariables("Hi {{1}}, order {{2}}", [{ text: "Sam" }, { text: "A12" }]), "Hi Sam, order A12");
  assert.equal(fillVariables("Hi {{name}}", [{ parameter_name: "name", text: "Sam" }]), "Hi Sam");
});

test("the definition's body is filled with the values that were sent", () => {
  const view = resolveTemplateView(
    [{ type: "body", parameters: [{ type: "text", text: "Sam" }] }],
    { components: [{ type: "BODY", text: "Hello {{1}}!" }, { type: "FOOTER", text: "Reply STOP" }] }
  );
  assert.equal(view.body, "Hello Sam!");
  assert.equal(view.footer, "Reply STOP");
});

test("buttons come from the definition, and a dynamic url is filled", () => {
  const view = resolveTemplateView(
    [{ type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "abc" }] }],
    { components: [{ type: "BUTTONS", buttons: [{ type: "URL", text: "Track", url: "https://x.com/{{1}}" }, { type: "QUICK_REPLY", text: "Thanks" }] }] }
  );
  assert.equal(view.buttons.length, 2);
  assert.equal(view.buttons[0].url, "https://x.com/abc");
});

test("without a definition the saved header image and body text are used", () => {
  const view = resolveTemplateView(
    [{ type: "header", parameters: [{ type: "image", image: { link: "https://x.com/a.jpg" } }] }, { type: "body", text: "Plain body" }],
    null
  );
  assert.deepEqual(view.header, { type: "IMAGE", url: "https://x.com/a.jpg", id: undefined });
  assert.equal(view.body, "Plain body");
});
