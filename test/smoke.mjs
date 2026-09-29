/* Minimal-Shim, um die Karte ausserhalb des Browsers zu instanziieren.
   Prueft: setConfig, Bibliotheks-Aufloesung, Signatur-Diffing, Rendern,
   und dass ein Klick den richtigen Service mit den richtigen Daten ruft. */

const mkEl = (tag) => {
  const el = {
    tagName: tag, children: [], dataset: {},
    style: { _props: {}, setProperty(k, v) { this._props[k] = v; },
             getPropertyValue(k) { return this._props[k]; } },
    textContent: "", title: "", type: "", _attrs: {}, _listeners: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
    removeEventListener() {},
    remove() {},
    attachShadow() { el.shadowRoot = mkEl("shadow-root"); return el.shadowRoot; },
    querySelectorAll(sel) {
      const cls = sel.replace(".", "");
      return walk(el).filter((n) => n !== el && n.classList.contains(cls));
    },
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
const winListeners = {};
globalThis.window = {
  customCards: [],
  addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
  removeEventListener() {},
  dispatchEvent(ev) { (winListeners[ev.type] || []).forEach((f) => f(ev)); return true; },
};
let Ctor = null;
let EditorCtor = null;
globalThis.customElements = {
  define(n, c) {
    if (n === "room-scenes-card") Ctor = c;
    if (n === "room-scenes-card-editor") EditorCtor = c;
  },
  get: (n) => (n === "ha-dialog" ? class {} : undefined),
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
const favSwatch = walk(tiles[1]).find((n) => n.classList.contains("swatch"));
check(
  "Thumbnail aus der Bibliothek",
  String(favSwatch?.style.backgroundImage).includes("/assets/scene_presets/uuid-rest.jpeg"),
  String(favSwatch?.style.backgroundImage)
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
 * Helligkeit / Override
 * ------------------------------------------------------------------------ */

hass.states["input_number.wz_hell"] = {
  state: "62.0", attributes: { min: 0, max: 100, step: 1, unit_of_measurement: "%" },
};
hass.states["input_boolean.wz_auto"] = { state: "on", attributes: {} };
const bc = new Ctor();
bc.setConfig({
  mode_entity: "input_select.wz_modus",
  auto_entity: "input_boolean.wz_auto",
  brightness_entity: "input_number.wz_hell",
});
await new Promise((r) => setTimeout(r, 20));
bc.hass = hass;

const briRow = () => walk(bc.shadowRoot).find((n) => n.classList.contains("bri"));
const briInput = () => walk(briRow()).find((n) => n.tagName === "input");
const briVal = () => walk(briRow()).find((n) => n.classList.contains("val"));

check("Helligkeits-Zeile wird gerendert", !!briRow());
check("Slider steht auf dem Helper-Wert", Number(briInput()?.value) === 62, briInput()?.value);
check("Anzeige zeigt 62 %", briVal()?.textContent === "62 %", briVal()?.textContent);
check("Auto an -> Slider gedimmt", briRow().classList.contains("auto"));
check("Fuellstand als CSS-Variable", briInput().style.getPropertyValue("--rsc-fill") === "62%");

// Helligkeit aendert sich (Spiegel) -> kein Neuaufbau, Wert in place
let bRenders = 0;
const bOrig = bc._render.bind(bc);
bc._render = () => { bRenders++; bOrig(); };
const rowBefore = briRow();
hass.states["input_number.wz_hell"] = { ...hass.states["input_number.wz_hell"], state: "40.0" };
bc.hass = hass;
check("Helligkeits-Aenderung baut die Karte nicht neu", bRenders === 0, `${bRenders} Renders`);
check("… sondern zieht den Slider in place nach", briRow() === rowBefore && Number(briInput().value) === 40);

// Beim Ziehen darf ein hass-Update den Wert nicht zuruecksetzen
briInput().value = 25;
fire(briInput(), "input");
hass.states["input_number.wz_hell"] = { ...hass.states["input_number.wz_hell"], state: "41.0" };
bc.hass = hass;
check("Waehrend des Ziehens bleibt der Slider, wo der Finger ist", Number(briInput().value) === 25, briInput().value);
check("Anzeige folgt dem Finger", briVal().textContent === "25 %", briVal().textContent);

// Loslassen schreibt genau einmal den Wert - und fasst Auto NICHT an
calls.length = 0;
fire(briInput(), "change");
check(
  "Loslassen setzt den input_number",
  calls.length === 1 && calls[0].d === "input_number" && calls[0].s === "set_value" &&
    calls[0].data.value === 25 && calls[0].data.entity_id === "input_number.wz_hell",
  JSON.stringify(calls)
);
check("Karte schaltet Auto nicht selbst ab", !calls.some((c) => c.d === "input_boolean"));

// Auto aus + 0 -> "Aus", nicht mehr gedimmt
hass.states["input_boolean.wz_auto"] = { state: "off", attributes: {} };
hass.states["input_number.wz_hell"] = { ...hass.states["input_number.wz_hell"], state: "0.0" };
bc.hass = hass;
check("Auto aus -> Slider nicht mehr gedimmt", !briRow().classList.contains("auto"));
check("0 wird als „Aus“ angezeigt", briVal().textContent === "Aus", briVal().textContent);
check("0 markiert die Zeile als aus", briRow().classList.contains("off"));

// Ohne brightness_entity bleibt alles wie vorher
check("Ohne brightness_entity keine Helligkeits-Zeile",
  !walk(card.shadowRoot).some((n) => n.classList.contains("bri")));
hass.states["input_boolean.wz_auto"] = { state: "on", attributes: {} };


/* ---------------------------------------------------------------------------
 * Layouts "kompakt" und "mini"
 * ------------------------------------------------------------------------ */

const layoutCfg = (layout) => ({
  title: "Küche", layout,
  mode_entity: "input_select.wz_modus", preset_entity: "input_text.wz_szene",
  auto_entity: "input_boolean.wz_auto", brightness_entity: "input_number.wz_hell",
  scene_option: "scene", favorites: ["Rest", "uuid-relax"],
  modes: { aus: { name: "Aus" } },
});
hass.states["input_select.wz_modus"] = { state: "scene", attributes: { options: ["aus", "scene", "sync", "vr"] } };
hass.states["input_text.wz_szene"] = { state: "uuid-relax", attributes: {} };
hass.states["input_number.wz_hell"] = { state: "40.0", attributes: { min: 0, max: 100, step: 1, unit_of_measurement: "%" } };

// kompakt
const kc = new Ctor();
kc.setConfig(layoutCfg("kompakt"));
await new Promise((r) => setTimeout(r, 20));
kc.hass = hass;
const kn = walk(kc.shadowRoot);
const segBtns = walk(kn.find((n) => n.classList.contains("seg")) ?? mkEl("x")).filter((n) => n.tagName === "button");
check("kompakt: Segmentleiste mit einem Knopf je Modus", segBtns.length === 4, `${segBtns.length}`);
check("kompakt: aktiver Modus markiert", segBtns[1]?.classList.contains("active") && !segBtns[0].classList.contains("active"));
check("kompakt: Modus-Beschriftung aus modes.name", segBtns[0]?.textContent === "Aus", segBtns[0]?.textContent);
const khead = kn.find((n) => n.classList.contains("head"));
check("kompakt: Auto-Pill in der Kopfzeile", walk(khead).some((n) => n.classList.contains("auto")));
const lchips = kn.filter((n) => n.classList.contains("lchip"));
check("kompakt: Listen-Chips = aktiver Slot + 2 Favoriten", lchips.length === 3, `${lchips.length}`);
check("kompakt: aktive Szene hat den Rahmen", lchips[0].classList.contains("current") && lchips[2].classList.contains("current"));
check("kompakt: Chip zeigt Namen", walk(lchips[1]).some((n) => n.classList.contains("lname") && n.textContent === "Rest"));
check("kompakt: Helligkeits-Slider ist da", kn.some((n) => n.classList.contains("bri") && !n.classList.contains("bar")));
check("kompakt: keine Standard-Chips/-Kacheln", !kn.some((n) => n.classList.contains("chips") || n.classList.contains("grid")));
calls.length = 0;
segBtns[2].click();
await new Promise((r) => setTimeout(r, 10));
check("kompakt: Segment-Klick setzt den Modus", calls.some((x) => x.d === "input_select" && x.data.option === "sync"), JSON.stringify(calls));
calls.length = 0;
lchips[1].click();
await new Promise((r) => setTimeout(r, 10));
check("kompakt: Chip-Klick wählt die Szene (erst Preset, dann Modus)",
  calls[0]?.d === "input_text" && calls[0]?.data.value === "uuid-rest" && calls[1]?.data.option === "scene", JSON.stringify(calls));

// mini
const mc = new Ctor();
mc.setConfig(layoutCfg("mini"));
await new Promise((r) => setTimeout(r, 20));
mc.hass = hass;
const mn = walk(mc.shadowRoot);
const sel = mn.find((n) => n.tagName === "select");
check("mini: Modus als Dropdown", !!sel && walk(sel).filter((n) => n.tagName === "option").length === 4);
check("mini: Dropdown steht auf dem aktiven Modus", sel?.value === "scene", sel?.value);
check("mini: runder Auto-Knopf", mn.some((n) => n.classList.contains("auto") && n.classList.contains("round")));
const stripTiles = walk(mn.find((n) => n.classList.contains("strip")) ?? mkEl("x")).filter((n) => n.classList.contains("tile"));
check("mini: Szenen-Streifen = aktiver Slot + 2 Favoriten", stripTiles.length === 3, `${stripTiles.length}`);
const moreBtnMini = walk(mn.find((n) => n.classList.contains("head"))).find((n) => n.classList.contains("more-btn"));
check("mini: Bibliothek als Knopf in der Kopfzeile (immer erreichbar)", !!moreBtnMini);

// Scrollen ohne Touch: Mausrad und Ziehen
const strip = mn.find((n) => n.classList.contains("strip"));
const emit = (el, type, props = {}) => {
  let prevented = false;
  (el._listeners?.[type] || []).forEach((f) => f({ type, ...props, preventDefault() { prevented = true; }, stopPropagation() {} }));
  return prevented;
};
Object.assign(strip, { scrollLeft: 0, scrollWidth: 600, clientWidth: 300 });
let prevented = emit(strip, "wheel", { deltaY: 100, deltaX: 0 });
check("mini: Mausrad scrollt den Streifen seitlich", strip.scrollLeft === 100 && prevented, `${strip.scrollLeft} ${prevented}`);
strip.scrollLeft = 300;
prevented = emit(strip, "wheel", { deltaY: 100, deltaX: 0 });
check("mini: am Ende gibt das Mausrad an die Seite ab", strip.scrollLeft === 300 && !prevented, `${strip.scrollLeft} ${prevented}`);
strip.scrollLeft = 100;
emit(strip, "pointerdown", { pointerType: "mouse", button: 0, clientX: 200, pointerId: 1 });
emit(strip, "pointermove", { clientX: 140, pointerId: 1 });
check("mini: Ziehen mit der Maus scrollt", strip.scrollLeft === 160, `${strip.scrollLeft}`);
emit(strip, "pointerup", { pointerId: 1 });
check("mini: nach dem Ziehen wird der Klick geschluckt", mc._swallowClick === true);
let stopped = false;
(strip._listeners.click || []).forEach((f) => f({ stopPropagation() { stopped = true; }, preventDefault() {} }));
check("… und zwar genau einmal", stopped && mc._swallowClick === false);
strip.scrollLeft = 100;
emit(strip, "pointerdown", { pointerType: "touch", button: 0, clientX: 200, pointerId: 2 });
emit(strip, "pointermove", { clientX: 100, pointerId: 2 });
check("mini: Touch bleibt dem Browser überlassen", strip.scrollLeft === 100, `${strip.scrollLeft}`);
const bar = mn.find((n) => n.classList.contains("bri") && n.classList.contains("bar"));
check("mini: Helligkeit als Balken", !!bar);
const barFill = walk(bar).find((n) => n.classList.contains("fill"));
check("mini: Balken-Füllung zeigt den Wert", barFill?.style.width === "40%", barFill?.style.width);
calls.length = 0;
sel.value = "sync";
fire(sel, "change");
await new Promise((r) => setTimeout(r, 10));
check("mini: Dropdown-Wechsel setzt den Modus", calls.some((x) => x.d === "input_select" && x.data.option === "sync"), JSON.stringify(calls));
// Helligkeit ändert sich -> Balken in place, kein Neuaufbau
let mr = 0; const mo = mc._render.bind(mc); mc._render = () => { mr++; mo(); };
hass.states["input_number.wz_hell"] = { ...hass.states["input_number.wz_hell"], state: "75.0" };
mc.hass = hass;
check("mini: Helligkeit zieht den Balken in place nach", mr === 0 && barFill.style.width === "75%", `${mr} Renders, ${barFill.style.width}`);

// unbekanntes Layout -> Standard
const sc = new Ctor();
sc.setConfig({ ...layoutCfg("quatsch") });
await new Promise((r) => setTimeout(r, 20));
sc.hass = hass;
check("unbekanntes Layout fällt auf Standard zurück", walk(sc.shadowRoot).some((n) => n.classList.contains("chips")));
hass.states["input_select.wz_modus"] = { state: "scene", attributes: { options: ["aus", "scene", "sync", "vr"] } };


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

const briField = forms[0].schema
  ?.flatMap((s) => s.schema ?? [s])
  .find((s) => s.name === "brightness_entity");
check(
  "Editor bietet brightness_entity mit input_number-Filter an",
  JSON.stringify(briField?.selector?.entity?.filter ?? []).includes("input_number"),
  JSON.stringify(briField)
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


/* ---------------------------------------------------------------------------
 * Popup
 *
 * Der Dialog haengt an document.body, nicht im Shadow DOM der Karte. Genau
 * daran sind die Kacheln vorher gescheitert: STYLES kam dort nie an.
 * ------------------------------------------------------------------------ */

const moreBtn = walk(card.shadowRoot).find((n) => n.classList.contains("more"));
check("Karte hat einen „Alle anzeigen“-Knopf", !!moreBtn);
moreBtn.click();

check("Dialog wurde geoeffnet", !!card._dialog);
check("Dialog hat einen eigenen Shadow Root", !!card._dialogRoot);

const dlgStyle = walk(card._dialogRoot).find((n) => n.tagName === "style");
check(
  "Kachel-Styles landen im Dialog (das war der Bug)",
  dlgStyle?.textContent?.includes(".tile .swatch"),
  "STYLES fehlt im Dialog"
);
check(
  "Dialog-Raster-Styles sind auch da",
  dlgStyle?.textContent?.includes(".rsc-dialog-grid")
);
check(
  "nichts davon liegt im globalen Light DOM",
  !walk(card._dialog).some((n) => n.tagName === "style"),
  "style-Tag direkt im Dialog gefunden"
);

const dlgTiles = walk(card._dialogRoot).filter((n) => n.classList.contains("tile"));
check("Dialog zeigt Kacheln", dlgTiles.length === 2, `${dlgTiles.length}`);
check(
  "Dialog-Kacheln nutzen die Browse-Variante",
  dlgTiles.every((t) => t.classList.contains("browse"))
);

const dlgSwatch = walk(dlgTiles[0]).find((n) => n.classList.contains("swatch"));
check(
  "Vorschaubild sitzt am Swatch, nicht am Knopf",
  String(dlgSwatch?.style.backgroundImage).includes("/assets/scene_presets/"),
  String(dlgSwatch?.style.backgroundImage)
);
check(
  "der Knopf selbst traegt kein Hintergrundbild mehr",
  !dlgTiles[0].style.backgroundImage
);

// Markierung nachziehen, ohne das Popup neu zu bauen
card._refreshDialogSelection();
const marked = dlgTiles.filter((t) => t.classList.contains("current"));
check(
  "genau die aktive Szene ist im Popup markiert",
  // Der Mock-Service aendert keinen State, aktiv ist also weiterhin uuid-relax.
  marked.length === 1 && marked[0].dataset.presetId === "uuid-relax",
  JSON.stringify(marked.map((t) => t.dataset.presetId))
);

// Auswahl schliesst das Popup
dlgTiles[1].click();
check("Auswahl im Popup schliesst den Dialog", !card._dialog);
check("Shadow Root wird mit aufgeraeumt", !card._dialogRoot);


/* ---------------------------------------------------------------------------
 * Popup von aussen oeffnen (fire-dom-event -> ll-custom)
 * ------------------------------------------------------------------------ */

const llCustom = (detail) =>
  window.dispatchEvent({ type: "ll-custom", detail });

// Fremde fire-dom-event-Aktionen duerfen uns nicht stoeren
card._closeDialog();
llCustom({ browser_mod: { service: "browser_mod.popup" } });
check("fremdes ll-custom wird ignoriert", !card._dialog);

// Weg 1: ueber die dialog_id einer gerenderten Karte
card.setConfig({
  dialog_id: "wohnzimmer",
  mode_entity: "input_select.wz_modus",
  preset_entity: "input_text.wz_szene",
  scene_option: "scene",
  favorites: ["Rest"],
});
card.connectedCallback();
card.hass = hass;

llCustom({ room_scenes_card: { id: "wohnzimmer" } });
check("dialog_id oeffnet das Popup der registrierten Karte", !!card._dialog);
check("und zwar an genau dieser Instanz", !!card._dialogRoot);
card._closeDialog();

// Kurzform: nur der String
llCustom({ room_scenes_card: "wohnzimmer" });
check("Kurzform mit blossem String funktioniert auch", !!card._dialog);
card._closeDialog();

// Unbekannte id ohne Inline-Config: Warnung statt Absturz
const warnings = [];
const origWarn = console.warn;
console.warn = (...a) => warnings.push(a.join(" "));
llCustom({ room_scenes_card: { id: "gibtsnicht" } });
console.warn = origWarn;
check("unbekannte dialog_id warnt, statt zu werfen", warnings.length === 1, String(warnings));
check(
  "die Warnung nennt beide Auswege",
  /dialog_id|mode_entity/.test(warnings[0] ?? ""),
  warnings[0]
);

// Weg 2: Konfiguration direkt im Event, ohne gerenderte Karte
globalThis.document.querySelector = (sel) =>
  sel === "home-assistant" ? { hass } : null;

const before = walk(document.body).length;
llCustom({
  room_scenes_card: {
    mode_entity: "input_select.wz_modus",
    preset_entity: "input_text.wz_szene",
    scene_option: "scene",
  },
});
await new Promise((r) => setTimeout(r, 20));
const dialogs = document.body.children.filter((n) => n.tagName === "ha-dialog");
check(
  "Inline-Config oeffnet ein Popup ohne gerenderte Karte",
  dialogs.length >= 1,
  `${dialogs.length} Dialoge, vorher ${before} Knoten`
);

// walk folgt absichtlich keinem Shadow Root - sonst waere der Light-DOM-Check
// oben wertlos. Hier also gezielt in den Shadow Root des Dialogs steigen.
const ghostHost = dialogs[dialogs.length - 1].children.find((n) => n.shadowRoot);
const ghostTiles = ghostHost
  ? walk(ghostHost.shadowRoot).filter((n) => n.classList.contains("tile"))
  : [];
check(
  "auch das Popup ohne Karte ist korrekt gestylt",
  ghostTiles.length === 2 && ghostTiles.every((t) => t.classList.contains("browse")),
  `${ghostTiles.length} Kacheln`
);

// Fehlende Pflichtangabe darf nicht durchschlagen
const errors = [];
const origErr = console.error;
console.error = (...a) => errors.push(a.join(" "));
llCustom({ room_scenes_card: { preset_entity: "input_text.wz_szene" } });
console.error = origErr;
check(
  "Inline-Config ohne mode_entity wird abgefangen",
  warnings.length + errors.length >= 1
);


console.log("\n  BESTANDEN (" + ok.length + ")");
ok.forEach((n) => console.log("   ok  " + n));
if (fail.length) {
  console.log("\n  FEHLGESCHLAGEN (" + fail.length + ")");
  fail.forEach((n) => console.log("   XX  " + n));
  process.exit(1);
}
console.log("\n  alle " + ok.length + " Checks bestanden\n");
