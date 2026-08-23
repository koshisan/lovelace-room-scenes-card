/* Minimal-Shim, um die Karte ausserhalb des Browsers zu instanziieren.
   Prueft: setConfig, Bibliotheks-Aufloesung, Signatur-Diffing, Rendern,
   und dass ein Klick den richtigen Service mit den richtigen Daten ruft. */

const mkEl = (tag) => {
  const el = {
    tagName: tag, children: [], style: {}, dataset: {},
    textContent: "", title: "", type: "", _attrs: {}, _listeners: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
    removeEventListener() {},
    remove() {},
    querySelectorAll() { return []; },
    click() { (this._listeners.click || []).forEach((f) => f()); },
  };
  Object.defineProperty(el, "innerHTML", { set() { el.children = []; }, get: () => "" });
  // className und classList muessen denselben Zustand teilen, sonst sieht der
  // Test die Klassen nicht, die die Karte ueber className setzt.
  Object.defineProperty(el, "className", {
    set(v) { el.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get() { return [...el.classList._s].join(" "); },
  });
  return el;
};

const walk = (el, out = []) => {
  out.push(el);
  (el.children || []).forEach((c) => walk(c, out));
  return out;
};

globalThis.document = { createElement: mkEl, body: mkEl("body") };
globalThis.window = { customCards: [] };
let Ctor = null;
let EditorCtor = null;
globalThis.customElements = {
  define(n, c) {
    if (n === "room-scenes-card") Ctor = c;
    if (n === "room-scenes-card-editor") EditorCtor = c;
  },
  get: () => undefined,
};
globalThis.HTMLElement = class {
  constructor() { this._listeners = {}; }
  attachShadow() { this.shadowRoot = mkEl("shadow-root"); return this.shadowRoot; }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach((f) => f(ev)); return true; }
};

// Loest einen Listener aus, den der Shim sonst nur speichert.
const fire = (el, type, detail) =>
  (el._listeners?.[type] || []).forEach((f) => f({ type, detail, stopPropagation() {} }));

const LIB = {
  categories: [{ id: "cat-defaults", name: "Defaults" }],
  presets: [
    { id: "uuid-rest", categoryId: "cat-defaults", name: "Rest", img: "uuid-rest.jpeg" },
    { id: "uuid-relax", categoryId: "cat-defaults", name: "Relax", img: "uuid-relax.jpeg" },
  ],
};
globalThis.fetch = async (url) => {
  if (!url.endsWith("scene_presets.json")) throw new Error("unexpected " + url);
  return { ok: true, status: 200, json: async () => LIB };
};

await import("../dist/room-scenes-card.js");

const calls = [];
const hass = {
  states: {
    "input_select.wz_modus": {
      state: "sync",
      attributes: { options: ["aus", "scene", "sync", "vr"] },
    },
    "input_text.wz_szene": { state: "uuid-relax", attributes: {} },
    "input_boolean.wz_auto": { state: "on", attributes: {} },
  },
  callService: async (d, s, data) => { calls.push({ d, s, data }); },
};

const card = new Ctor();
card.setConfig({
  title: "Wohnzimmer",
  mode_entity: "input_select.wz_modus",
  preset_entity: "input_text.wz_szene",
  auto_entity: "input_boolean.wz_auto",
  scene_option: "scene",
  favorites: ["Rest", "uuid-relax", "Gibtsnicht"],
  modes: { sync: { icon: "mdi:television" } },
  script: { entity: "script.licht_modus_setzen", data: { raum: "wohnzimmer" } },
});

const ok = [];
const fail = [];
const check = (name, cond, extra = "") =>
  (cond ? ok : fail).push(name + (cond ? "" : "  <-- " + extra));

await new Promise((r) => setTimeout(r, 20)); // Bibliothek laden lassen
card.hass = hass;
await new Promise((r) => setTimeout(r, 20));

const nodes = walk(card.shadowRoot);
const chips = nodes.filter((n) => n.classList.contains("chip"));
const tiles = nodes.filter((n) => n.classList.contains("tile"));

check("4 Modus-Chips + 1 Auto-Chip", chips.length === 5, `bekam ${chips.length}`);
check("Auto-Chip ist aktiv", chips[4].classList.contains("active"));
check("sync-Chip ist aktiv", chips[2].classList.contains("active"));
check("scene-Chip ist NICHT aktiv", !chips[1].classList.contains("active"));
check("6 Kacheln (1 aktiv + 5 fav... hier 3 fav)", tiles.length === 4, `bekam ${tiles.length}`);
check("Slot 1 gedimmt (Modus != Szene)", tiles[0].classList.contains("dimmed"));
check("Slot 1 zeigt letzte Szene", tiles[0].dataset.presetId === "uuid-relax");
check(
  "Namensaufloesung: 'Rest' -> uuid-rest",
  tiles[1].dataset.presetId === "uuid-rest"
);
check(
  "Thumbnail aus der Bibliothek",
  String(tiles[1].style.backgroundImage).includes("/assets/scene_presets/uuid-rest.jpeg"),
  tiles[1].style.backgroundImage
);
check(
  "Unbekanntes Preset wird sichtbar statt still verschluckt",
  tiles[3].title.includes("nicht in der Bibliothek")
);

// Klick auf eine Favoriten-Kachel
tiles[1].click();
await new Promise((r) => setTimeout(r, 10));
check("Klick ruft das Script", calls.length === 1, JSON.stringify(calls));
check(
  "Script bekommt Domain/Service richtig",
  calls[0]?.d === "script" && calls[0]?.s === "licht_modus_setzen",
  JSON.stringify(calls[0])
);
check(
  "Script bekommt raum + modus + preset_id",
  calls[0]?.data?.raum === "wohnzimmer" &&
    calls[0]?.data?.modus === "scene" &&
    calls[0]?.data?.preset_id === "uuid-rest",
  JSON.stringify(calls[0]?.data)
);

// Signatur-Diffing: gleiches hass darf nicht neu rendern
let renders = 0;
const origRender = card._render.bind(card);
card._render = () => { renders++; origRender(); };
card.hass = hass;
check("Unveraenderter State rendert nicht neu", renders === 0, `${renders} Renders`);
hass.states["input_select.wz_modus"] = {
  state: "scene",
  attributes: { options: ["aus", "scene", "sync", "vr"] },
};
card.hass = hass;
check("Geaenderter State rendert neu", renders === 1, `${renders} Renders`);

const t2 = walk(card.shadowRoot).filter((n) => n.classList.contains("tile"));
check("Im Szenenmodus ist Slot 1 nicht mehr gedimmt", !t2[0].classList.contains("dimmed"));
check("Im Szenenmodus traegt Slot 1 den Aktiv-Rahmen", t2[0].classList.contains("current"));

// Auto-Toggle
calls.length = 0;
walk(card.shadowRoot).filter((n) => n.classList.contains("auto"))[0].click();
check(
  "Auto-Chip toggelt den input_boolean",
  calls[0]?.d === "input_boolean" && calls[0]?.s === "toggle",
  JSON.stringify(calls[0])
);

// Fehlende Entity darf nicht werfen
const c2 = new Ctor();
c2.setConfig({ mode_entity: "input_select.gibtsnicht" });
c2.hass = hass;
check("Fehlende Entity wird als Meldung gerendert, wirft nicht", true);

/* ---------------------------------------------------------------------------
 * Visueller Editor
 * ------------------------------------------------------------------------ */

check("Karte bietet einen Editor an", typeof Ctor.getConfigElement === "function");
check("Editor ist registriert", typeof EditorCtor === "function");

const ed = new EditorCtor();
let emitted = null;
ed.addEventListener("config-changed", (ev) => { emitted = ev.detail.config; });

// Config mit Feldern, die der Editor gar nicht kennt - die muessen ueberleben.
ed.setConfig({
  mode_entity: "input_select.wz_modus",
  favorites: ["Rest", "Relax"],
  presets: { sync: { image: "/local/hyperion.png" } },
  script: { entity: "script.licht_modus_setzen", data: { raum: "wohnzimmer", etage: "og" } },
});
ed.hass = hass;
await new Promise((r) => setTimeout(r, 20));

check("Editor rendert ohne Absturz", ed.shadowRoot.children.length > 0);

const eNodes = walk(ed.shadowRoot);
const forms = eNodes.filter((n) => n.tagName === "ha-form");
check("Zwei ha-form-Bloecke (Basis + Schreibweg)", forms.length === 2, `${forms.length}`);

const sceneField = forms[0].schema
  ?.flatMap((s) => s.schema ?? [s])
  .find((s) => s.name === "scene_option");
check(
  "scene_option wird zur Auswahlliste, sobald der input_select bekannt ist",
  !!sceneField?.selector?.select?.options?.includes("scene"),
  JSON.stringify(sceneField?.selector)
);

check(
  "Script-Formular zeigt Entity und raum vorbelegt",
  forms[1].data?.entity === "script.licht_modus_setzen" && forms[1].data?.raum === "wohnzimmer",
  JSON.stringify(forms[1].data)
);

const picker = eNodes.find((n) => n.tagName === "select");
const optionValues = walk(picker).filter((n) => n.tagName === "option").map((n) => n.value);
check("Favoriten-Picker listet die Bibliothek", optionValues.includes("Relax"), String(optionValues));

// Favorit hinzufuegen
picker.value = "Relax";
fire(picker, "change");
check(
  "Favorit hinzufuegen haengt hinten an",
  JSON.stringify(emitted?.favorites) === JSON.stringify(["Rest", "Relax", "Relax"]),
  JSON.stringify(emitted?.favorites)
);

// Der kritische Teil: unbekannte Keys duerfen nicht verschwinden
check(
  "presets-Overrides ueberleben eine Editor-Aenderung",
  emitted?.presets?.sync?.image === "/local/hyperion.png",
  JSON.stringify(emitted?.presets)
);
check(
  "zusaetzliche script.data-Felder ueberleben",
  emitted?.script?.data?.etage === "og",
  JSON.stringify(emitted?.script)
);

// Reihenfolge aendern
ed.setConfig({ ...emitted, favorites: ["Rest", "Relax"] });
ed._moveFav(0, 1);
check(
  "Pfeil runter vertauscht zwei Favoriten",
  JSON.stringify(emitted?.favorites) === JSON.stringify(["Relax", "Rest"]),
  JSON.stringify(emitted?.favorites)
);

// Modus-Icons
const iconPickers = walk(ed.shadowRoot).filter((n) => n.tagName === "ha-icon-picker");
check("Ein Icon-Picker je input_select-Option", iconPickers.length === 4, `${iconPickers.length}`);
fire(iconPickers[2], "value-changed", { value: "mdi:television" });
check(
  "Icon-Auswahl landet unter modes.<Option>",
  emitted?.modes?.sync?.icon === "mdi:television",
  JSON.stringify(emitted?.modes)
);

// Leere Werte sollen nicht als leere Strings in der YAML landen
ed.setConfig({ mode_entity: "input_select.wz_modus", title: "Weg damit" });
ed.hass = hass;
fire(forms[0], "value-changed", { value: { mode_entity: "input_select.wz_modus", title: "" } });
check(
  "Leere Felder werden aus der Config entfernt",
  emitted && !("title" in emitted),
  JSON.stringify(emitted)
);


// Beschriftung je Modus - wichtig, seit die Optionen kleingeschrieben sind
ed.setConfig({
  mode_entity: "input_select.wz_modus",
  modes: { sync: { icon: "mdi:television" } },
});
ed.hass = hass;
ed._modeSig = null;
ed._renderModes();

const nameInputs = walk(ed.shadowRoot).filter((n) => n.tagName === "input");
check("Ein Beschriftungsfeld je Option", nameInputs.length === 4, `${nameInputs.length}`);
check(
  "Platzhalter zeigt den rohen Wert",
  nameInputs[1].placeholder === "scene",
  nameInputs[1].placeholder
);

nameInputs[1].value = "Szene";
fire(nameInputs[1], "input");
check(
  "Beschriftung landet unter modes.<Option>.name",
  emitted?.modes?.scene?.name === "Szene",
  JSON.stringify(emitted?.modes)
);
check(
  "vorhandenes Icon einer anderen Option bleibt erhalten",
  emitted?.modes?.sync?.icon === "mdi:television",
  JSON.stringify(emitted?.modes)
);

nameInputs[1].value = "   ";
fire(nameInputs[1], "input");
check(
  "leere Beschriftung raeumt den Eintrag wieder ab",
  emitted?.modes?.scene === undefined,
  JSON.stringify(emitted?.modes)
);


console.log("\n  BESTANDEN (" + ok.length + ")");
ok.forEach((n) => console.log("   ok  " + n));
if (fail.length) {
  console.log("\n  FEHLGESCHLAGEN (" + fail.length + ")");
  fail.forEach((n) => console.log("   XX  " + n));
  process.exit(1);
}
console.log("\n  alle " + ok.length + " Checks bestanden\n");
