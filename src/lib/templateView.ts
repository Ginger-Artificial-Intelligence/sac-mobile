// Self-contained (no app imports) so the Node test runner can load it.
// Port of the web app's templateView: turns the saved components of a sent template message, plus the
// template definition when it is known, into what the bubble shows (header, body, footer, buttons, cards).

const asArray = <T = any>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : value == null ? [] : [value as T]);
const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object";
export const typeOf = (component: any) => String(component?.type || "").toLowerCase();

export type TemplateMedia = { type: string; url?: string; id?: string; filename?: string; text?: string; [key: string]: any };
export type TemplateCardView = { key: string | number; media: TemplateMedia | null; body: string; buttons: Record<string, any>[] };
export type TemplateView = {
  header: TemplateMedia | null;
  body: string;
  footer: string;
  buttons: Record<string, any>[];
  cards: TemplateCardView[];
};

const paramValue = (param: any): string => String(param?.text ?? param?.value ?? (typeof param === "string" ? param : "") ?? "");

/** Fills {{1}} / {{name}} placeholders from a saved component's parameters */
export const fillVariables = (text: unknown, params: unknown): string => {
  let out = String(text ?? "");
  const list = asArray<any>(params);
  // Named variables ({{name}}) in the order they appear: a value sent without its name fills the
  // named variable at the same position
  const named: string[] = [];
  for (const m of out.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) if (!named.includes(m[1])) named.push(m[1]);
  list.forEach((param, index) => {
    const value = paramValue(param);
    out = out.split(`{{${index + 1}}}`).join(value);
    const name = param?.parameter_name || (typeof param?.name === "string" ? param.name : "") || named[index];
    if (name) out = out.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "g"), value);
  });
  return out;
};

const findByType = (components: any[], type: string) => components.find((component) => typeOf(component) === type);

const mediaFromParam = (component: any): TemplateMedia | null => {
  const param = asArray<any>(component?.parameters)[0] || component;
  const format = String(param?.type || component?.format || component?.type || "").toUpperCase();
  const image = param?.image || component?.image;
  const video = param?.video || component?.video;
  const document = param?.document || component?.document;
  const location = param?.location || component?.location;
  if (image) return { type: "IMAGE", url: image.link || image.url, id: image.id || image.uploaded_id };
  if (video) return { type: "VIDEO", url: video.link || video.url, id: video.id || video.uploaded_id };
  if (document) return { type: "DOCUMENT", url: document.link || document.url, id: document.id || document.uploaded_id, filename: document.filename };
  if (location) return { type: "LOCATION", ...location };
  const text = component?.text || param?.text;
  if (text) return { type: "TEXT", text: String(text) };
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return { type: format, url: component?.url };
  return null;
};

/** The saved header (sent values) wins; the definition supplies the format, header text and sample media */
const resolveHeader = (saved: any, definition: any): TemplateMedia | null => {
  const media = mediaFromParam(saved);
  const format = String(definition?.format || "").toUpperCase();
  const sample = asArray<string>(definition?.example?.header_handle)[0];
  if (format === "TEXT" && definition?.text) return { type: "TEXT", text: fillVariables(definition.text, saved?.parameters) };
  if (media && media.type !== "TEXT") return media.url || media.id || media.type === "LOCATION" || !sample ? media : { ...media, url: sample };
  if (media) return media;
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return { type: format, url: sample };
  return null;
};

const buttonsOf = (components: any[]) =>
  components
    .filter((component) => ["button", "buttons"].includes(typeOf(component)))
    .flatMap((component) => asArray<any>(component.buttons?.length ? component.buttons : [component]));

const resolveButtons = (savedComponents: any[], definitionComponents: any[]) => {
  const saved = buttonsOf(savedComponents);
  const defined = buttonsOf(definitionComponents);
  if (!defined.length) return saved;
  return defined.map((button, index) => {
    const sent = saved.find((item) => Number(item?.index) === index) || saved[index];
    if (button?.url && String(button.url).includes("{{")) return { ...button, url: fillVariables(button.url, sent?.parameters) };
    return button;
  });
};

const resolveCards = (savedCarousel: any, definitionCarousel: any): TemplateCardView[] => {
  const savedCards = asArray<any>(savedCarousel?.cards).filter(isObject);
  const definedCards = asArray<any>(definitionCarousel?.cards).filter(isObject);
  const count = Math.max(savedCards.length, definedCards.length);
  return Array.from({ length: count }, (_, index) => {
    const saved = savedCards.find((card) => Number(card.card_index) === index) || savedCards[index] || {};
    const defined = definedCards.find((card) => Number(card.card_index) === index) || definedCards[index] || {};
    const savedComponents = asArray<any>(saved.components).filter(isObject);
    const definedComponents = asArray<any>(defined.components).filter(isObject);
    const savedBody = findByType(savedComponents, "body");
    const definedBody = findByType(definedComponents, "body");
    const body = definedBody?.text
      ? fillVariables(definedBody.text, savedBody?.parameters)
      : savedBody?.text || asArray<any>(savedBody?.parameters).map(paramValue).filter(Boolean).join(" ");
    return {
      key: saved.card_index ?? defined.card_index ?? index,
      media: resolveHeader(findByType(savedComponents, "header"), findByType(definedComponents, "header")),
      body: String(body || ""),
      buttons: resolveButtons(savedComponents, definedComponents),
    };
  });
};

export const resolveTemplateView = (
  components: any[],
  definition: { components?: any[] } | null | undefined,
  extras: { directBody?: string; messageText?: string; name?: string; footer?: string } = {}
): TemplateView => {
  const defined = asArray<any>(definition?.components).filter(isObject);
  const savedBody = findByType(components, "body");
  const definedBody = findByType(defined, "body");
  const savedParamsText = asArray<any>(savedBody?.parameters).map(paramValue).filter(Boolean).join(" ");
  const messageText =
    extras.messageText && extras.messageText !== extras.name && extras.messageText.toLowerCase() !== "template" ? extras.messageText : "";
  const body =
    extras.directBody ||
    (definedBody?.text ? fillVariables(definedBody.text, savedBody?.parameters) : "") ||
    (savedBody?.text ? fillVariables(savedBody.text, savedBody?.parameters) : "") ||
    messageText ||
    savedParamsText ||
    "";
  return {
    header: resolveHeader(findByType(components, "header"), findByType(defined, "header")),
    body,
    footer: String(findByType(defined, "footer")?.text || findByType(components, "footer")?.text || extras.footer || ""),
    buttons: resolveButtons(components, defined),
    cards: resolveCards(findByType(components, "carousel"), findByType(defined, "carousel")),
  };
};
