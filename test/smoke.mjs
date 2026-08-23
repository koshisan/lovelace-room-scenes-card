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
globalThis.customElements = {
  define(n, c) { if (n === "room-scenes-card") Ctor = c; },
  get: () => undefined,
};
globalThis.HTMLElement = class {
  attachShadow() { this.shadowRoot = mkEl("shadow-root"); return this.shadowRoot; }
};

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
      state: "Sync",
      attributes: { options: ["Aus", "Szene", "Sync", "VR"] },
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
  scene_option: "Szene",
  favorites: ["Rest", "uuid-relax", "Gibtsnicht"],
  modes: { Sync: { icon: "mdi:television" } },
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
check("Sync-Chip ist aktiv", chips[2].classList.contains("active"));
check("Szene-Chip ist NICHT aktiv", !chips[1].classList.contains("active"));
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
    calls[0]?.data?.modus === "Szene" &&
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
  state: "Szene",
  attributes: { options: ["Aus", "Szene", "Sync", "VR"] },
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

console.log("\n  BESTANDEN (" + ok.length + ")");
ok.forEach((n) => console.log("   ok  " + n));
if (fail.length) {
  console.log("\n  FEHLGESCHLAGEN (" + fail.length + ")");
  fail.forEach((n) => console.log("   XX  " + n));
  process.exit(1);
}
console.log("\n  alle " + ok.length + " Checks bestanden\n");
