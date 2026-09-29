/**
 * room-scenes-card
 *
 * Eine Lovelace-Karte, die einen input_select als Bubble-Chips darstellt und
 * darunter ein Raster aus Szenen-Presets zeigt (Hypfer/hass-scene_presets).
 *
 * https://github.com/koshisan/lovelace-room-scenes-card
 * MIT
 */

const CARD_VERSION = "1.5.1";

const PRESET_DATA_URL = "/assets/scene_presets/scene_presets.json";
const PRESET_IMG_BASE = "/assets/scene_presets/";

/* -------------------------------------------------------------------------
 * Preset-Bibliothek
 *
 * scene_presets registriert diese View mit requires_auth = False, ein
 * schlichtes fetch() genuegt also. Das Ergebnis wird prozessweit geteilt,
 * damit nicht jede Karte auf jedem Dashboard erneut laedt.
 * ---------------------------------------------------------------------- */

let _libraryPromise = null;

function loadLibrary() {
  if (!_libraryPromise) {
    _libraryPromise = fetch(PRESET_DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`${PRESET_DATA_URL} -> HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const presets = data.presets ?? [];
        const categories = data.categories ?? [];
        const byId = new Map();
        const byName = new Map();
        for (const p of presets) {
          byId.set(p.id, p);
          const key = normalise(p.name);
          // Namen sind in presets.json nicht garantiert eindeutig. Der erste
          // Treffer gewinnt, damit die Aufloesung wenigstens stabil ist.
          if (!byName.has(key)) byName.set(key, p);
        }
        return { presets, categories, byId, byName };
      })
      .catch((err) => {
        _libraryPromise = null; // beim naechsten Rendern neu versuchen
        throw err;
      });
  }
  return _libraryPromise;
}

/* Karten mit dialog_id, damit das Popup von aussen geoeffnet werden kann.
   Muss vor der Klasse stehen: customElements.define() upgradet bereits im
   Dokument vorhandene Elemente sofort, und connectedCallback greift darauf
   zu - eine Deklaration weiter unten waere dann noch in der Temporal Dead
   Zone. */
const DIALOG_REGISTRY = new Map();

const normalise = (s) => String(s ?? "").trim().toLowerCase();

// Layout-Namen (deutsch und englisch akzeptiert)
const LAYOUTS = { "": "standard", standard: "standard", default: "standard",
                  kompakt: "kompakt", compact: "kompakt", mini: "mini" };
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/* -------------------------------------------------------------------------
 * Styles
 *
 * Jede Bubble-Variable bekommt die gleiche Fallback-Kette wie im Original,
 * damit die Karte ohne Bubble Card nicht bricht, sondern auf die normalen
 * HA-Theme-Variablen zurueckfaellt.
 * ---------------------------------------------------------------------- */

const STYLES = `
  :host { --rsc-gap: 8px; }

  ha-card { overflow: hidden; }

  .wrap { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

  /* ---- Kopfzeile ---- */
  .head { display: flex; align-items: center; gap: var(--rsc-gap); }
  .title {
    flex: 1 1 auto; min-width: 0;
    font-size: 16px; font-weight: 500;
    color: var(--primary-text-color);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ---- Chips (Bubble sub-button Optik) ---- */
  .chips { display: flex; flex-wrap: wrap; gap: var(--rsc-gap); }

  .chip {
    display: flex; flex-direction: row; align-items: center;
    justify-content: center; gap: 4px;
    box-sizing: border-box;
    min-width: 36px;
    height: var(--bubble-sub-button-height, 36px);
    padding: 0 12px;
    font-size: 12px; font-family: inherit; white-space: nowrap;
    border: none; cursor: pointer;
    color: var(--primary-text-color);
    border-radius: var(--bubble-sub-button-border-radius,
                   var(--bubble-border-radius, 18px));
    background-color: var(--bubble-sub-button-background-color,
                      var(--bubble-icon-background-color,
                      var(--bubble-secondary-background-color,
                      var(--card-background-color,
                      var(--ha-card-background, var(--secondary-background-color))))));
    transition: background-color .3s ease-in-out, opacity .3s ease-in-out;
    -webkit-tap-highlight-color: transparent;
  }
  .chip:hover { opacity: .85; }
  .chip:active { transform: scale(.96); }
  .chip ha-icon { --mdc-icon-size: 16px; }

  .chip.active {
    background-color: var(--bubble-sub-button-light-background-color,
                      var(--bubble-accent-color,
                      var(--bubble-default-color, var(--accent-color))));
    color: var(--bubble-sub-button-dark-text-color, var(--text-accent-color, #000));
  }

  .chip.auto { margin-inline-start: auto; }

  /* ---- Helligkeit ----
     Solange die Automatik entscheidet, zeigt der Slider nur an (gedimmt).
     Anfassen ist trotzdem erlaubt - das ist genau der Override. */
  .bri {
    display: flex; align-items: center; gap: 10px;
    height: var(--bubble-sub-button-height, 36px);
    padding: 0 12px;
    border-radius: var(--bubble-sub-button-border-radius,
                   var(--bubble-border-radius, 18px));
    background-color: var(--bubble-sub-button-background-color,
                      var(--bubble-icon-background-color,
                      var(--bubble-secondary-background-color,
                      var(--card-background-color,
                      var(--ha-card-background, var(--secondary-background-color))))));
    transition: opacity .3s ease-in-out;
  }
  .bri ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: 0 0 auto; }
  .bri .val {
    flex: 0 0 auto; min-width: 38px; text-align: end;
    font-size: 12px; font-variant-numeric: tabular-nums;
    color: var(--primary-text-color);
  }
  .bri.auto input, .bri.auto .val { opacity: .55; }
  .bri.off .val { color: var(--secondary-text-color); }

  .bri input {
    flex: 1 1 auto; min-width: 0; margin: 0;
    height: 6px; border-radius: 3px; cursor: pointer;
    -webkit-appearance: none; appearance: none; background: none;
    --rsc-accent: var(--bubble-accent-color, var(--bubble-default-color, var(--accent-color)));
    --rsc-track: var(--divider-color, rgba(127,127,127,.3));
    background: linear-gradient(to right,
      var(--rsc-accent) 0 var(--rsc-fill, 0%),
      var(--rsc-track) var(--rsc-fill, 0%) 100%);
  }
  .bri input::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 18px; height: 18px; border-radius: 50%; border: none;
    background: var(--rsc-accent); box-shadow: 0 1px 3px rgba(0,0,0,.35);
  }
  .bri input::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%; border: none;
    background: var(--rsc-accent); box-shadow: 0 1px 3px rgba(0,0,0,.35);
  }

  /* ---- Preset-Raster ---- */
  .grid { display: grid; gap: var(--rsc-gap); }

  .tile {
    position: relative;
    display: flex; flex-direction: column;
    border: none; padding: 0; cursor: pointer;
    background: none; color: #fff;
    transition: transform .15s ease, opacity .3s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .tile:hover { transform: scale(1.03); }
  .tile:active { transform: scale(.97); }

  /* Slot 1 zeigt die zuletzt gewaehlte Szene auch dann, wenn gerade ein
     anderer Modus laeuft - dann aber gedimmt, damit "aktiv" eindeutig bleibt. */
  .tile.dimmed { opacity: .45; filter: saturate(.4); }

  .tile .swatch {
    position: relative; width: 100%; aspect-ratio: 1 / 1;
    overflow: hidden;
    background-color: var(--secondary-background-color);
    background-size: cover; background-position: center;
    border-radius: var(--bubble-border-radius, var(--ha-card-border-radius, 18px));
    transition: box-shadow .15s ease;
  }
  .tile.current .swatch {
    box-shadow: inset 0 0 0 3px var(--bubble-accent-color, var(--accent-color));
  }

  .tile .label {
    position: absolute; inset: auto 0 0 0;
    padding: 18px 6px 6px 6px;
    font-size: 11px; line-height: 1.2; text-align: center;
    background: linear-gradient(transparent, rgba(0,0,0,.78));
    text-shadow: 0 1px 3px rgba(0,0,0,.9);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* Im Popup geht es genau darum, die Farben zu sehen. Der dunkle Verlauf
     ueber dem unteren Drittel verdeckt bei kleinen Kacheln zu viel davon,
     also wandert die Beschriftung dort unter das Bild. */
  .tile.browse .label {
    position: static;
    padding: 5px 2px 0 2px;
    background: none; text-shadow: none;
    color: var(--primary-text-color);
    white-space: normal; overflow: visible;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    min-height: 2.4em;
  }

  .tile .badge {
    position: absolute; top: 6px; inset-inline-start: 6px;
    padding: 1px 7px; border-radius: 10px;
    font-size: 9px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase;
    background: var(--bubble-accent-color, var(--accent-color));
    color: var(--text-accent-color, #000);
  }

  .tile .fallback {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--secondary-text-color);
    --mdc-icon-size: 32px;
  }

  /* ---- Fusszeile ---- */
  .more {
    align-self: flex-end;
    background: none; border: none; cursor: pointer; font-family: inherit;
    font-size: 12px; padding: 4px 2px;
    color: var(--secondary-text-color);
  }
  .more:hover { color: var(--primary-text-color); }

  .msg {
    padding: 8px 4px; font-size: 13px;
    color: var(--error-color, #db4437);
  }

  /* =========================================================================
   * Layouts "kompakt" und "mini"
   * ====================================================================== */

  :host {
    --rsc-surface: var(--bubble-sub-button-background-color,
                   var(--bubble-icon-background-color,
                   var(--bubble-secondary-background-color,
                   var(--card-background-color,
                   var(--ha-card-background, var(--secondary-background-color))))));
    --rsc-accent-c: var(--bubble-accent-color, var(--bubble-default-color, var(--accent-color)));
    --rsc-on-accent: var(--bubble-sub-button-dark-text-color, var(--text-accent-color, #000));
  }

  .head .chip.auto { flex: 0 0 auto; }
  .chip.round { width: var(--bubble-sub-button-height, 36px); padding: 0; border-radius: 50%; }

  /* ---- kompakt: Segmentleiste ---- */
  .seg {
    display: flex; gap: 4px; padding: 4px;
    border-radius: var(--bubble-border-radius, 16px);
    background: var(--rsc-surface);
  }
  .seg button {
    flex: 1 1 0; min-width: 0; height: 34px; padding: 0 6px;
    border: none; border-radius: 12px; cursor: pointer;
    background: none; color: var(--primary-text-color);
    font-family: inherit; font-size: 13px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    transition: background-color .25s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .seg button:hover { background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); }
  .seg button.active { background: var(--rsc-accent-c); color: var(--rsc-on-accent); font-weight: 500; }

  /* ---- kompakt: Szenen als Listen-Chips ---- */
  .lgrid { display: grid; gap: var(--rsc-gap); }
  .lchip {
    display: flex; align-items: center; gap: 10px; min-width: 0;
    padding: 6px; border: none; cursor: pointer; text-align: start;
    border-radius: 14px; background: var(--rsc-surface);
    color: var(--primary-text-color); font-family: inherit; font-size: 14px; font-weight: 500;
    transition: opacity .3s ease, transform .15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .lchip:active { transform: scale(.97); }
  .lchip .thumb {
    position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px;
    background-color: var(--secondary-background-color);
    background-size: cover; background-position: center;
  }
  .lchip .thumb .fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: var(--secondary-text-color); --mdc-icon-size: 22px; }
  .lchip .lname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lchip.current {
    box-shadow: inset 0 0 0 2px var(--rsc-accent-c);
    background: color-mix(in srgb, var(--rsc-accent-c) 16%, var(--rsc-surface));
  }
  .lchip.dimmed { opacity: .45; }

  /* ---- mini: Modus als Dropdown ---- */
  .modesel { position: relative; flex: 0 0 auto; }
  .modesel select {
    appearance: none; -webkit-appearance: none; cursor: pointer;
    height: var(--bubble-sub-button-height, 36px); padding: 0 30px 0 14px;
    border: none; border-radius: var(--bubble-sub-button-border-radius, 18px);
    background: var(--rsc-surface); color: var(--primary-text-color);
    font-family: inherit; font-size: 14px;
  }
  .modesel ha-icon { position: absolute; inset-inline-end: 8px; top: 50%; transform: translateY(-50%);
    --mdc-icon-size: 18px; pointer-events: none; color: var(--secondary-text-color); }

  /* ---- mini: Szenen seitlich scrollend ---- */
  .strip {
    display: flex; gap: var(--rsc-gap); overflow-x: auto; overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory; scrollbar-width: none;
    margin: 0 -12px; padding: 0 12px;
  }
  .strip::-webkit-scrollbar { display: none; }
  .strip.dragging { scroll-snap-type: none; cursor: grabbing; user-select: none; }
  .strip.dragging .tile { pointer-events: none; }
  @media (hover: hover) and (pointer: fine) { .strip { cursor: grab; } }
  .strip .tile { flex: 0 0 104px; scroll-snap-align: start; }
  .strip .tile:hover { transform: none; }
  .strip .tile .badge { display: none; }          /* der Rahmen reicht - das Abzeichen verdeckt hier das Bild */
  .strip .tile .label { font-size: 13px; font-weight: 600; padding-bottom: 7px; }

  /* ---- mini: Helligkeit als flacher Balken (ganze Fläche ist der Slider) ---- */
  .bri.bar { position: relative; overflow: hidden; gap: 8px; }
  .bri.bar .fill {
    position: absolute; inset: 0 auto 0 0; width: 0; pointer-events: none;
    background: color-mix(in srgb, var(--rsc-accent-c) 38%, transparent);
  }
  .bri.bar ha-icon, .bri.bar .lbl, .bri.bar .val { position: relative; pointer-events: none; }
  .bri.bar .lbl { flex: 1 1 auto; font-size: 13px; color: var(--primary-text-color); }
  .bri.bar .val { font-weight: 600; }
  .bri.bar input {
    position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
    opacity: 0; cursor: ew-resize;
  }
  .bri.bar.auto .fill { opacity: .55; }
  .bri.bar.auto input { opacity: 0; }     /* der Standard-Stil dimmt das input - hier bleibt es unsichtbar */
`;

/* Der Dialog haengt an document.body, also ausserhalb des Shadow DOM der
   Karte. Er bekommt deshalb einen eigenen Shadow Root, in den STYLES und
   diese Regeln zusammen hineingereicht werden - sonst stehen die Kacheln
   dort voellig ungestylt da, und generische Klassennamen wie .tile wuerden
   im globalen Light DOM mit anderen Karten kollidieren. */
const DIALOG_STYLES = `
  .rsc-dialog { padding: 4px 4px 8px 4px; }

  .rsc-dialog-grid {
    display: grid; gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    margin: 0 0 22px 0;
  }

  .rsc-dialog h3 {
    margin: 4px 0 10px 0; font-size: 14px; font-weight: 500;
    color: var(--secondary-text-color);
    position: sticky; top: 0; z-index: 1;
    background: var(--card-background-color, var(--ha-card-background));
    padding: 6px 0;
  }
`;

/* -------------------------------------------------------------------------
 * Karte
 * ---------------------------------------------------------------------- */

class RoomScenesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lib = null;
    this._error = null;
    this._signature = null;
    this._dialog = null;
    this._dialogRoot = null;
  }

  /* ---- Konfiguration ---- */

  setConfig(config) {
    if (!config?.mode_entity) {
      throw new Error("room-scenes-card: 'mode_entity' fehlt");
    }
    if (config.favorites && !Array.isArray(config.favorites)) {
      throw new Error("room-scenes-card: 'favorites' muss eine Liste sein");
    }

    this._config = {
      columns: 3,
      scene_option: "scene",
      show_current: true,
      show_more: true,
      favorites: [],
      modes: {},
      presets: {},
      ...config,
    };

    this._signature = null;
    this._error = null;
    this._closeDialog();
    this._registerDialogId();

    if (!this._lib) {
      loadLibrary()
        .then((lib) => {
          this._lib = lib;
        })
        .catch((err) => {
          this._error = err.message;
        })
        .finally(() => {
          this._signature = null;
          if (this._hass) this._render();
        });
    }
  }

  static getConfigElement() {
    return document.createElement("room-scenes-card-editor");
  }

  static getStubConfig() {
    return {
      mode_entity: "input_select.wohnzimmer_modus",
      preset_entity: "input_text.wohnzimmer_szene",
      auto_entity: "input_boolean.wohnzimmer_auto",
      favorites: ["Rest", "Relax", "Read", "Nightlight", "Energize"],
    };
  }

  getCardSize() {
    const c = this._config ?? {};
    const tiles = (c.favorites?.length ?? 0) + 1;
    const bri = c.brightness_entity ? 1 : 0;
    const layout = LAYOUTS[normalise(c.layout)] ?? "standard";
    if (layout === "mini") return 2 + bri + 2;                           // Kopf, Streifen, Balken
    if (layout === "kompakt") return 2 + bri + Math.ceil(tiles / (c.columns ?? 3));
    return 2 + bri + Math.ceil(tiles / (c.columns ?? 3)) * 2;
  }

  /* ---- hass-Updates ----
   *
   * HA setzt hass bei jeder State-Aenderung im ganzen System. Ohne Filter
   * wuerde die Karte hunderte Male pro Minute neu rendern und dabei jedes
   * Mal den Hover-Zustand verlieren. Darum ein Fingerabdruck aus genau den
   * Entities, die wir anzeigen. */

  set hass(hass) {
    this._hass = hass;
    const sig = this._buildSignature();
    if (sig === this._signature) {
      // Die Helligkeit ist bewusst nicht Teil der Signatur: sie aendert sich,
      // waehrend man zieht, und ein Neuaufbau risse einem den Slider unter
      // dem Finger weg. Sie wird an Ort und Stelle nachgezogen.
      this._updateBrightness();
      return;
    }
    this._signature = sig;
    this._render();
    this._refreshDialogSelection();
  }

  _buildSignature() {
    const c = this._config;
    if (!c || !this._hass) return null;
    const ids = [c.mode_entity, c.preset_entity, c.auto_entity, c.history_entity];
    return ids
      .filter(Boolean)
      .map((id) => {
        const s = this._hass.states[id];
        if (!s) return `${id}:missing`;
        const recent = s.attributes?.recent;
        return `${id}:${s.state}:${recent ? recent.join(",") : ""}`;
      })
      .join("|");
  }

  /* ---- Aufloesung von Presets ---- */

  _resolve(key) {
    if (!key) return null;
    const override = this._config.presets?.[key] ?? {};
    const hit =
      this._lib?.byId.get(key) ?? this._lib?.byName.get(normalise(key)) ?? null;

    if (!hit) {
      // Unaufloesbar - trotzdem eine Kachel zeigen, damit der Fehler sichtbar
      // ist statt still zu verschwinden.
      return {
        id: key,
        name: override.name ?? key,
        image: override.image ?? null,
        missing: true,
      };
    }
    return {
      id: hit.id,
      name: override.name ?? hit.name,
      image: override.image ?? (hit.img ? PRESET_IMG_BASE + encodeURIComponent(hit.img) : null),
      missing: false,
    };
  }

  /* ---- Aktionen ----
   *
   * Alles laeuft ueber genau einen Schreibweg. Ist ein Script konfiguriert,
   * ist das der einzige Aufrufer der Helper - dann koennen Modus und Preset
   * nicht auseinanderdriften. Ohne Script schreibt die Karte selbst, dann
   * aber zwingend Preset zuerst und Modus zuletzt, damit die Automation die
   * UUID garantiert schon vorfindet. */

  async _setMode(mode, presetId = null) {
    const c = this._config;
    if (!this._hass) return;

    const scriptCfg = c.script;
    if (scriptCfg) {
      const entity = typeof scriptCfg === "string" ? scriptCfg : scriptCfg.entity;
      if (!entity?.startsWith("script.")) {
        this._error = "room-scenes-card: 'script.entity' muss mit 'script.' beginnen";
        this._render();
        return;
      }
      const modeField = scriptCfg.mode_field ?? "modus";
      const presetField = scriptCfg.preset_field ?? "preset_id";
      const data = { ...(scriptCfg.data ?? {}), [modeField]: mode };
      if (presetId) data[presetField] = presetId;

      await this._hass.callService("script", entity.split(".")[1], data);
      return;
    }

    if (presetId && c.preset_entity) {
      await this._hass.callService("input_text", "set_value", {
        entity_id: c.preset_entity,
        value: presetId,
      });
    }
    await this._hass.callService("input_select", "select_option", {
      entity_id: c.mode_entity,
      option: mode,
    });
  }

  _pickPreset(preset) {
    if (preset.missing) return;
    this._setMode(this._config.scene_option, preset.id);
    this._closeDialog();
  }

  _toggleAuto() {
    if (!this._config.auto_entity) return;
    this._hass.callService("input_boolean", "toggle", {
      entity_id: this._config.auto_entity,
    });
  }

  /* Die Karte schreibt nur den Wert. Dass die Automatik dabei ausgeht, ist
     Sache der Steuerung dahinter - sonst gaebe es wieder zwei Schreiber, die
     ueber den Auto-Zustand entscheiden. */
  _setBrightness(value) {
    const id = this._config.brightness_entity;
    if (!id || !this._hass) return;
    const domain = id.split(".")[0];
    this._hass.callService(domain, "set_value", { entity_id: id, value: Number(value) });
  }

  /* variant "bar": flacher Balken wie im Mini-Layout - die ganze Fläche ist der
     Slider, die Füllung zeigt den Wert. Sonst die normale Slider-Zeile. */
  _brightnessRow(variant = "slider") {
    const c = this._config;
    const row = document.createElement("div");
    row.className = variant === "bar" ? "bri bar" : "bri";

    let fill = null;
    if (variant === "bar") {
      fill = document.createElement("div");
      fill.className = "fill";
      row.appendChild(fill);
    }

    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", c.brightness_icon ?? "mdi:brightness-6");
    row.appendChild(icon);

    if (variant === "bar") {
      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = c.brightness_name ?? "Helligkeit";
      row.appendChild(lbl);
    }

    const input = document.createElement("input");
    input.type = "range";
    input.setAttribute("aria-label", c.brightness_name ?? "Helligkeit");
    row.appendChild(input);

    const val = document.createElement("span");
    val.className = "val";
    row.appendChild(val);

    // Waehrend des Ziehens kommen laufend hass-Updates. Die duerfen den Wert
    // nicht zuruecksetzen, bis losgelassen wurde.
    const release = () => { this._briDragging = false; };
    input.addEventListener("pointerdown", () => { this._briDragging = true; });
    input.addEventListener("pointerup", release);
    input.addEventListener("pointercancel", release);
    input.addEventListener("input", () => {
      this._briDragging = true;
      this._paintBrightness(Number(input.value));
    });
    input.addEventListener("change", () => {
      release();
      this._setBrightness(input.value);
    });

    this._bri = { row, input, val, fill };
    this._updateBrightness(true);
    return row;
  }

  _updateBrightness(force = false) {
    const c = this._config;
    const b = this._bri;
    if (!b || !this._hass || !c?.brightness_entity) return;
    if (this._briDragging && !force) return;

    const s = this._hass.states[c.brightness_entity];
    const a = s?.attributes ?? {};
    b.input.min = a.min ?? 0;
    b.input.max = a.max ?? 100;
    b.input.step = a.step ?? 1;
    const v = Number(s?.state);
    b.input.value = Number.isFinite(v) ? v : 0;
    b.input.disabled = !s || s.state === "unavailable";

    const auto = c.auto_entity ? this._hass.states[c.auto_entity]?.state === "on" : false;
    b.row.classList.toggle("auto", auto);
    b.row.title = auto
      ? "Automatik aktiv - anfassen setzt einen Override"
      : "Override - Automatik ist aus";
    this._paintBrightness(Number(b.input.value));
  }

  _paintBrightness(v) {
    const b = this._bri;
    if (!b) return;
    const min = Number(b.input.min) || 0;
    const max = Number(b.input.max) || 100;
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    b.input.style.setProperty("--rsc-fill", `${pct}%`);
    if (b.fill) b.fill.style.width = `${pct}%`;
    b.row.classList.toggle("off", v <= min);
    const unit = this._hass?.states[this._config.brightness_entity]?.attributes?.unit_of_measurement ?? "%";
    b.val.textContent = v <= min ? (this._config.brightness_off_name ?? "Aus") : `${Math.round(v)} ${unit}`;
  }

  /* ---- Rendern ---- */

  _render() {
    const c = this._config;
    const hass = this._hass;
    if (!c || !hass) return;

    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    root.appendChild(card);

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    card.appendChild(wrap);

    const modeState = hass.states[c.mode_entity];
    if (!modeState) {
      wrap.appendChild(this._message(`Entity ${c.mode_entity} nicht gefunden`));
      return;
    }

    const activeMode = modeState.state;
    const sceneActive = activeMode === c.scene_option;
    const activePresetId = c.preset_entity ? hass.states[c.preset_entity]?.state : null;
    const ctx = { modeState, activeMode, sceneActive, activePresetId };

    this._bri = null;
    const layout = LAYOUTS[normalise(c.layout)] ?? "standard";
    if (layout === "kompakt") return this._renderCompact(wrap, ctx);
    if (layout === "mini") return this._renderMini(wrap, ctx);

    /* Kopfzeile */
    if (c.title) {
      const head = document.createElement("div");
      head.className = "head";
      const t = document.createElement("div");
      t.className = "title";
      t.textContent = c.title;
      head.appendChild(t);
      wrap.appendChild(head);
    }

    /* Modus-Chips + Auto-Schalter */
    const chips = document.createElement("div");
    chips.className = "chips";
    wrap.appendChild(chips);

    for (const option of modeState.attributes?.options ?? []) {
      const meta = c.modes?.[option] ?? {};
      const chip = document.createElement("button");
      chip.className = "chip" + (option === activeMode ? " active" : "");
      chip.type = "button";
      if (meta.icon) {
        const icon = document.createElement("ha-icon");
        icon.setAttribute("icon", meta.icon);
        chip.appendChild(icon);
      }
      const span = document.createElement("span");
      span.textContent = meta.name ?? option;
      chip.appendChild(span);

      chip.addEventListener("click", () => {
        // Der Szenen-Chip schaltet zurueck in den Szenenmodus und laesst die
        // gespeicherte UUID unangetastet.
        this._setMode(option, option === c.scene_option ? activePresetId : null);
      });
      chips.appendChild(chip);
    }

    if (c.auto_entity) {
      const autoState = hass.states[c.auto_entity];
      const on = autoState?.state === "on";
      const chip = document.createElement("button");
      chip.className = "chip auto" + (on ? " active" : "");
      chip.type = "button";
      chip.title = c.auto_name ?? "Automatik";
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", c.auto_icon ?? "mdi:motion-sensor");
      chip.appendChild(icon);
      const span = document.createElement("span");
      span.textContent = c.auto_name ?? "Auto";
      chip.appendChild(span);
      chip.addEventListener("click", () => this._toggleAuto());
      chips.appendChild(chip);
    }

    if (c.brightness_entity) wrap.appendChild(this._brightnessRow());

    if (this._error) wrap.appendChild(this._message(this._error));
    if (!this._lib) return;

    /* Preset-Raster */
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${c.columns}, minmax(0, 1fr))`;
    wrap.appendChild(grid);

    if (c.show_current) {
      const current = this._resolve(activePresetId);
      grid.appendChild(
        current
          ? this._tile(current, { current: sceneActive, dimmed: !sceneActive, badge: sceneActive })
          : this._emptyTile()
      );
    }

    for (const fav of c.favorites) {
      const preset = this._resolve(typeof fav === "string" ? fav : fav.preset);
      if (!preset) continue;
      const isActive = sceneActive && preset.id === activePresetId;
      grid.appendChild(this._tile(preset, { current: isActive }));
    }

    if (c.show_more) {
      const more = document.createElement("button");
      more.className = "more";
      more.type = "button";
      more.textContent = c.more_name ?? "Alle anzeigen …";
      more.addEventListener("click", () => this._openDialog());
      wrap.appendChild(more);
    }
  }

  /* ---- Layouts "kompakt" und "mini" ----
   *
   * Beide teilen sich mit dem Standard-Layout Aktionen, Popup, Preset-Aufloesung
   * und den Helligkeits-Slider (inkl. In-place-Update). Sie unterscheiden sich nur
   * darin, wie Modus, Automatik und Szenen dargestellt werden. */

  _head(wrap, ...right) {
    const head = document.createElement("div");
    head.className = "head";
    const t = document.createElement("div");
    t.className = "title";
    t.textContent = this._config.title ?? "";
    head.appendChild(t);
    for (const el of right) if (el) head.appendChild(el);
    wrap.appendChild(head);
  }

  _autoButton(round = false) {
    const c = this._config;
    if (!c.auto_entity) return null;
    const on = this._hass.states[c.auto_entity]?.state === "on";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip auto" + (round ? " round" : "") + (on ? " active" : "");
    chip.title = c.auto_name ?? "Automatik";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", c.auto_icon ?? "mdi:motion-sensor");
    chip.appendChild(icon);
    if (!round) {
      const span = document.createElement("span");
      span.textContent = c.auto_name ?? "Auto";
      chip.appendChild(span);
    }
    chip.addEventListener("click", () => this._toggleAuto());
    return chip;
  }

  // Aktueller Slot + Favoriten, wie im Standard-Raster
  _presetEntries({ sceneActive, activePresetId }) {
    const c = this._config;
    const out = [];
    if (c.show_current) {
      const current = this._resolve(activePresetId);
      out.push(current ? { preset: current, current: sceneActive, dimmed: !sceneActive, badge: sceneActive } : { empty: true });
    }
    for (const fav of c.favorites) {
      const preset = this._resolve(typeof fav === "string" ? fav : fav.preset);
      if (preset) out.push({ preset, current: sceneActive && preset.id === activePresetId });
    }
    return out;
  }

  _moreLink(wrap) {
    if (!this._config.show_more) return;
    const more = document.createElement("button");
    more.className = "more";
    more.type = "button";
    more.textContent = this._config.more_name ?? "Alle anzeigen …";
    more.addEventListener("click", () => this._openDialog());
    wrap.appendChild(more);
  }

  _renderCompact(wrap, ctx) {
    const c = this._config;
    this._head(wrap, this._autoButton(false));

    const seg = document.createElement("div");
    seg.className = "seg";
    for (const option of ctx.modeState.attributes?.options ?? []) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = option === ctx.activeMode ? "active" : "";
      b.textContent = c.modes?.[option]?.name ?? option;
      b.title = b.textContent;
      b.addEventListener("click", () =>
        this._setMode(option, option === c.scene_option ? ctx.activePresetId : null));
      seg.appendChild(b);
    }
    wrap.appendChild(seg);

    if (c.brightness_entity) wrap.appendChild(this._brightnessRow());
    if (this._error) wrap.appendChild(this._message(this._error));
    if (!this._lib) return;

    const grid = document.createElement("div");
    grid.className = "lgrid";
    grid.style.gridTemplateColumns = `repeat(${c.columns}, minmax(0, 1fr))`;
    for (const e of this._presetEntries(ctx)) grid.appendChild(this._listChip(e));
    wrap.appendChild(grid);
    this._moreLink(wrap);
  }

  _listChip({ preset, current = false, dimmed = false, empty = false }) {
    const chip = document.createElement(empty ? "div" : "button");
    chip.className = "lchip" + (current ? " current" : "") + (dimmed || empty ? " dimmed" : "");
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (preset?.image) thumb.style.backgroundImage = `url("${preset.image}")`;
    else {
      const fb = document.createElement("div");
      fb.className = "fallback";
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", empty ? "mdi:palette-outline" : preset.missing ? "mdi:help-circle-outline" : "mdi:palette");
      fb.appendChild(icon);
      thumb.appendChild(fb);
    }
    chip.appendChild(thumb);
    const name = document.createElement("span");
    name.className = "lname";
    name.textContent = empty ? "Keine Szene" : preset.name;
    chip.appendChild(name);
    if (!empty) {
      chip.type = "button";
      chip.dataset.presetId = preset.id;
      chip.title = preset.missing ? `Preset "${preset.id}" nicht in der Bibliothek gefunden` : `${preset.name} (${preset.id})`;
      chip.addEventListener("click", () => this._pickPreset(preset));
    }
    return chip;
  }

  _renderMini(wrap, ctx) {
    const c = this._config;

    const sel = document.createElement("div");
    sel.className = "modesel";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Modus");
    for (const option of ctx.modeState.attributes?.options ?? []) {
      const o = document.createElement("option");
      o.value = option;
      o.textContent = c.modes?.[option]?.name ?? option;
      if (option === ctx.activeMode) o.selected = true;
      select.appendChild(o);
    }
    select.value = ctx.activeMode;
    select.addEventListener("change", () => {
      const option = select.value;
      this._setMode(option, option === c.scene_option ? ctx.activePresetId : null);
    });
    sel.appendChild(select);
    const caret = document.createElement("ha-icon");
    caret.setAttribute("icon", "mdi:menu-down");
    sel.appendChild(caret);

    // Bibliothek als eigener Knopf oben - am Ende des Streifens wäre er bei mehr als
    // drei, vier Favoriten nur per Scrollen erreichbar
    let more = null;
    if (c.show_more) {
      more = document.createElement("button");
      more.type = "button";
      more.className = "chip round more-btn";
      more.title = c.more_name ?? "Alle Szenen";
      const mi = document.createElement("ha-icon");
      mi.setAttribute("icon", c.more_icon ?? "mdi:view-grid-outline");
      more.appendChild(mi);
      more.addEventListener("click", () => this._openDialog());
    }
    this._head(wrap, sel, more, this._autoButton(true));

    if (this._error) wrap.appendChild(this._message(this._error));
    if (this._lib) {
      const strip = document.createElement("div");
      strip.className = "strip";
      for (const e of this._presetEntries(ctx)) strip.appendChild(e.empty ? this._emptyTile() : this._tile(e.preset, e));
      this._scrollable(strip);
      wrap.appendChild(strip);
    }

    if (c.brightness_entity) wrap.appendChild(this._brightnessRow("bar"));
  }

  /* Seitlich scrollen auch ohne Touch: Mausrad (senkrecht -> seitlich) und Ziehen
     mit der Maus. Am Anfang/Ende gibt das Rad an die Seite ab, sonst hinge man fest.
     Nach einem Ziehen wird der folgende Klick geschluckt - sonst waehlte das Loslassen
     ueber einer Kachel versehentlich deren Szene. */
  _scrollable(strip) {
    strip.addEventListener("wheel", (ev) => {
      if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;       // echtes Seitwärts-Scrollen: Browser macht's
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0) return;
      const atStart = strip.scrollLeft <= 0 && ev.deltaY < 0;
      const atEnd = strip.scrollLeft >= max - 1 && ev.deltaY > 0;
      if (atStart || atEnd) return;
      strip.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }, { passive: false });

    let drag = null;
    strip.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType !== "mouse" || ev.button !== 0) return;     // Touch scrollt nativ
      drag = { x: ev.clientX, left: strip.scrollLeft, moved: false };
    });
    strip.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        strip.classList.add("dragging");
        try { strip.setPointerCapture(ev.pointerId); } catch (e) { /* Zeiger unbekannt - Ziehen geht trotzdem */ }
      }
      strip.scrollLeft = drag.left - dx;
    });
    const end = (ev) => {
      if (!drag) return;
      if (drag.moved) {
        strip.classList.remove("dragging");
        try { strip.releasePointerCapture(ev.pointerId); } catch (e) { /* war nicht gefangen */ }
        this._swallowClick = true;
        setTimeout(() => { this._swallowClick = false; }, 0);
      }
      drag = null;
    };
    strip.addEventListener("pointerup", end);
    strip.addEventListener("pointercancel", end);
    strip.addEventListener("click", (ev) => {
      if (!this._swallowClick) return;
      ev.stopPropagation();
      ev.preventDefault();
      this._swallowClick = false;
    }, true);
  }

  _message(text) {
    const m = document.createElement("div");
    m.className = "msg";
    m.textContent = text;
    return m;
  }

  _tile(preset, { current = false, dimmed = false, badge = false, browse = false } = {}) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className =
      "tile" +
      (current ? " current" : "") +
      (dimmed ? " dimmed" : "") +
      (browse ? " browse" : "");
    tile.dataset.presetId = preset.id;

    const swatch = document.createElement("div");
    swatch.className = "swatch";
    tile.appendChild(swatch);

    if (preset.image) {
      swatch.style.backgroundImage = `url("${preset.image}")`;
    } else {
      const fb = document.createElement("div");
      fb.className = "fallback";
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", preset.missing ? "mdi:help-circle-outline" : "mdi:palette");
      fb.appendChild(icon);
      swatch.appendChild(fb);
    }

    if (badge) {
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = "Aktiv";
      tile.appendChild(b);
    }

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = preset.name;
    tile.appendChild(label);

    tile.title = preset.missing
      ? `Preset "${preset.id}" nicht in der Bibliothek gefunden`
      : `${preset.name} (${preset.id})`;

    tile.addEventListener("click", () => this._pickPreset(preset));
    return tile;
  }

  _emptyTile() {
    const tile = document.createElement("div");
    tile.className = "tile dimmed";
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    tile.appendChild(swatch);
    const fb = document.createElement("div");
    fb.className = "fallback";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:palette-outline");
    fb.appendChild(icon);
    swatch.appendChild(fb);
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = "Keine Szene";
    tile.appendChild(label);
    return tile;
  }

  /* ---- Popup ----
   *
   * ha-dialog ist frontend-intern, aber seit Jahren stabil und bringt Fokus,
   * Escape und Mobile-Verhalten mit. Faellt es weg, bleibt die Karte nutzbar,
   * nur der Bibliotheks-Browser fehlt dann. */

  _openDialog() {
    if (this._dialog) return;
    if (!this._lib) {
      // Von aussen geoeffnet kann die Bibliothek noch unterwegs sein.
      loadLibrary()
        .then((lib) => {
          this._lib = lib;
          this._openDialog();
        })
        .catch((err) => {
          this._error = err.message;
          this._render();
        });
      return;
    }
    if (!customElements.get("ha-dialog")) {
      this._error = "ha-dialog nicht verfuegbar - Popup wird uebersprungen";
      this._render();
      return;
    }

    const c = this._config;
    const dialog = document.createElement("ha-dialog");
    dialog.setAttribute("open", "");
    dialog.setAttribute("hideactions", "");
    dialog.setAttribute("heading", c.title ? `${c.title} – Szenen` : "Szenen");
    dialog.style.setProperty("--mdc-dialog-max-width", "760px");
    dialog.style.setProperty("--mdc-dialog-min-width", "min(92vw, 420px)");

    // Eigener Shadow Root: nur so gelten STYLES auch hier, und nur so bleiben
    // die Regeln aus dem Dialog heraus.
    const host = document.createElement("div");
    const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    dialog.appendChild(host);

    const style = document.createElement("style");
    style.textContent = STYLES + DIALOG_STYLES;
    root.appendChild(style);

    const body = document.createElement("div");
    body.className = "rsc-dialog";
    root.appendChild(body);

    const recent = c.history_entity
      ? this._hass.states[c.history_entity]?.attributes?.recent
      : null;

    const sections = [];
    if (Array.isArray(recent) && recent.length) {
      sections.push({
        name: "Zuletzt benutzt",
        presets: recent.map((id) => this._resolve(id)).filter((p) => p && !p.missing),
      });
    }
    for (const cat of this._lib.categories) {
      const presets = this._lib.presets
        .filter((p) => p.categoryId === cat.id)
        .map((p) => this._resolve(p.id));
      if (presets.length) sections.push({ name: cat.name, presets });
    }

    for (const section of sections) {
      const h = document.createElement("h3");
      h.textContent = section.name;
      body.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "rsc-dialog-grid";
      for (const preset of section.presets) {
        grid.appendChild(this._tile(preset, { browse: true }));
      }
      body.appendChild(grid);
    }

    dialog.addEventListener("closed", () => this._closeDialog());
    document.body.appendChild(dialog);
    this._dialog = dialog;
    this._dialogRoot = root;
    this._refreshDialogSelection();
  }

  _closeDialog() {
    if (!this._dialog) return;
    const d = this._dialog;
    this._dialog = null;
    this._dialogRoot = null;
    d.remove();
  }

  /* Beim Popup nur die Markierung nachziehen statt neu zu bauen - sonst
     springt die Scrollposition bei jedem State-Update zurueck nach oben. */
  _refreshDialogSelection() {
    if (!this._dialogRoot || !this._hass) return;
    const c = this._config;
    const sceneActive = this._hass.states[c.mode_entity]?.state === c.scene_option;
    const activeId = c.preset_entity ? this._hass.states[c.preset_entity]?.state : null;
    for (const tile of this._dialogRoot.querySelectorAll(".tile")) {
      tile.classList.toggle(
        "current",
        sceneActive && tile.dataset.presetId === activeId
      );
    }
  }

  /* ---- Registrierung fuer das Oeffnen von aussen ---- */

  connectedCallback() {
    this._registerDialogId();
  }

  disconnectedCallback() {
    this._closeDialog();
    if (this._dialogKey && DIALOG_REGISTRY.get(this._dialogKey) === this) {
      DIALOG_REGISTRY.delete(this._dialogKey);
    }
    this._dialogKey = null;
  }

  _registerDialogId() {
    const id = this._config?.dialog_id;
    if (this._dialogKey && this._dialogKey !== id) {
      if (DIALOG_REGISTRY.get(this._dialogKey) === this) {
        DIALOG_REGISTRY.delete(this._dialogKey);
      }
      this._dialogKey = null;
    }
    if (id) {
      DIALOG_REGISTRY.set(id, this);
      this._dialogKey = id;
    }
  }
}

customElements.define("room-scenes-card", RoomScenesCard);

/* -------------------------------------------------------------------------
 * Popup von aussen oeffnen
 *
 * Home Assistant kennt die Aktion "fire-dom-event": sie feuert ein
 * ll-custom-Event mit der Aktions-Konfiguration als detail, und weil HAs
 * fireEvent bubbles und composed setzt, kommt es bis ans window. Damit kann
 * jede beliebige Karte - Bubble Card, tile, button - den Szenen-Browser
 * oeffnen:
 *
 *   hold_action:
 *     action: fire-dom-event
 *     room_scenes_card:
 *       id: wohnzimmer
 *
 * Zwei Wege, an die noetige Konfiguration zu kommen:
 *
 *   id     verweist auf eine Karte mit passender dialog_id. Setzt voraus,
 *          dass die Karte auf der gerade angezeigten Ansicht liegt - nur
 *          dann existiert eine Instanz, die sich registriert hat. Dafuer
 *          bleibt die Markierung der aktiven Szene live.
 *
 *   inline die gleichen Felder wie in der Karten-YAML. Funktioniert
 *          ueberall, auch ohne sichtbare Karte.
 * ---------------------------------------------------------------------- */

/* Das <home-assistant>-Element traegt das hass-Objekt. Frontend-intern, aber
   der ueblich gegangene Weg, wenn man keine Karteninstanz hat. */
function findHass() {
  return document.querySelector("home-assistant")?.hass ?? null;
}

function openSceneBrowser(payload) {
  const cfg = typeof payload === "string" ? { id: payload } : { ...payload };
  const id = cfg.id;
  delete cfg.id;

  const registered = id ? DIALOG_REGISTRY.get(id) : null;
  if (registered) {
    registered._openDialog();
    return;
  }

  if (!cfg.mode_entity) {
    console.warn(
      `room-scenes-card: keine Karte mit dialog_id "${id}" auf dieser Ansicht ` +
        "und keine mode_entity im Event. Entweder die Karte auf diese Ansicht " +
        "legen oder die Konfiguration direkt ins fire-dom-event schreiben."
    );
    return;
  }

  const hass = findHass();
  if (!hass) {
    console.warn("room-scenes-card: hass nicht gefunden, Popup nicht moeglich");
    return;
  }

  // Eine Instanz ohne Platz im Dokument. Sie rendert in ihren eigenen,
  // nirgends eingehaengten Shadow Root; sichtbar wird nur der Dialog, den
  // _openDialog an document.body haengt.
  const card = new RoomScenesCard();
  try {
    card.setConfig(cfg);
  } catch (err) {
    console.error("room-scenes-card:", err.message);
    return;
  }
  card.hass = hass;
  card._openDialog();
}

window.addEventListener("ll-custom", (ev) => {
  // ll-custom feuert fuer jede fire-dom-event-Aktion im ganzen Frontend.
  // Ohne unseren Schluessel ist das Event nicht fuer uns bestimmt.
  const payload = ev.detail?.room_scenes_card;
  if (payload) openSceneBrowser(payload);
});


/* -------------------------------------------------------------------------
 * Visueller Editor
 *
 * Die skalaren Felder laufen ueber ha-form, damit Entity-Picker, Zahlen- und
 * Boolean-Selektoren exakt so aussehen wie in den mitgelieferten Karten.
 * Favoriten und Modus-Icons bekommen eigene Abschnitte, weil ha-form dafuer
 * keinen passenden Selektor hat.
 *
 * Wichtig: der Editor schreibt immer { ...altesConfig, ...aenderung } zurueck.
 * Alles, was er nicht kennt - presets-Overrides, zusaetzliche script.data-
 * Felder - ueberlebt damit eine Runde durch die Oberflaeche unbeschadet.
 * ---------------------------------------------------------------------- */

const fireEvent = (node, type, detail) =>
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

const LABELS = {
  title: "Titel",
  layout: "Layout",
  mode_entity: "Modus (input_select)",
  preset_entity: "Aktive Szene (input_text)",
  auto_entity: "Automatik (input_boolean)",
  history_entity: "Szenen-Verlauf (Sensor, optional)",
  brightness_entity: "Helligkeit / Override (input_number, optional)",
  scene_option: "Welche Option bedeutet Szenenmodus",
  columns: "Spalten",
  show_current: "Aktive Szene an erster Stelle",
  show_more: "„Alle anzeigen“-Link",
  auto_name: "Beschriftung Automatik",
  auto_icon: "Icon Automatik",
  more_name: "Beschriftung des Links",
  "script.entity": "Script",
  "script.raum": "Raum (wird als Feld „raum“ uebergeben)",
};

const EDITOR_STYLES = `
  .editor { display: flex; flex-direction: column; gap: 20px; padding: 4px 0; }

  section { display: flex; flex-direction: column; gap: 10px; }

  h4 {
    margin: 0; font-size: 13px; font-weight: 600;
    letter-spacing: .03em; text-transform: uppercase;
    color: var(--secondary-text-color);
  }
  .hint {
    margin: -4px 0 0 0; font-size: 12px; line-height: 1.45;
    color: var(--secondary-text-color);
  }

  .row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 10px;
    background: var(--secondary-background-color);
  }
  .row .grow { flex: 1 1 auto; min-width: 0; }
  .row .name {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 14px; color: var(--primary-text-color);
  }
  .row .sub { font-size: 11px; color: var(--secondary-text-color); }
  .row.missing { outline: 1px solid var(--error-color, #db4437); }

  .thumb {
    width: 34px; height: 34px; flex: 0 0 auto;
    border-radius: 8px; background-size: cover; background-position: center;
    background-color: var(--card-background-color);
  }

  .iconbtn {
    background: none; border: none; cursor: pointer; padding: 4px;
    display: flex; border-radius: 50%;
    color: var(--secondary-text-color);
  }
  .iconbtn:hover { color: var(--primary-text-color); }
  .iconbtn[disabled] { opacity: .3; cursor: default; }
  .iconbtn ha-icon { --mdc-icon-size: 20px; }

  select, input[type="text"] {
    font-family: inherit; font-size: 14px;
    padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color);
    color: var(--primary-text-color);
    width: 100%; box-sizing: border-box;
  }

  .modegrid {
    display: grid;
    grid-template-columns: minmax(0,0.7fr) minmax(0,1fr) minmax(0,1fr);
    gap: 8px; align-items: center;
  }
  .modegrid .lbl {
    font-size: 13px; font-family: var(--code-font-family, monospace);
    color: var(--secondary-text-color);
    overflow: hidden; text-overflow: ellipsis;
  }
  .modegrid .colhead {
    font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--secondary-text-color); padding-bottom: 2px;
  }

  .empty {
    font-size: 13px; font-style: italic;
    color: var(--secondary-text-color); padding: 2px;
  }
`;

class RoomScenesCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lib = null;
    this._built = false;
    this._modeSig = null;
  }

  setConfig(config) {
    this._config = { ...config };
    if (!this._lib) {
      loadLibrary()
        .then((lib) => {
          this._lib = lib;
          this._renderFavorites();
        })
        .catch(() => {
          /* Ohne Bibliothek bleibt der Favoriten-Picker leer, der Rest
             funktioniert weiter. Die Karte selbst meldet den Fehler. */
          this._renderFavorites();
        });
    }
    this._build();
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    this._sync();
  }

  /* ---- Config schreiben ---- */

  _emit(patch) {
    const config = { ...this._config, ...patch };
    for (const [k, v] of Object.entries(config)) {
      if (v === undefined || v === null || v === "") delete config[k];
    }
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  /* ---- Aufbau ----
   *
   * Einmal bauen, danach nur noch Werte nachziehen. Wuerde der Editor bei
   * jedem Tastendruck neu rendern, verlaere das Textfeld den Fokus. */

  _build() {
    if (this._built) return;
    this._built = true;

    const style = document.createElement("style");
    style.textContent = EDITOR_STYLES;
    this.shadowRoot.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "editor";
    this.shadowRoot.appendChild(wrap);

    /* Grundeinstellungen ueber ha-form */
    this._form = document.createElement("ha-form");
    this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
    this._form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      this._emit(ev.detail.value);
    });
    wrap.appendChild(this._form);

    /* Favoriten */
    const favSection = document.createElement("section");
    const favHead = document.createElement("h4");
    favHead.textContent = "Favoriten";
    favSection.appendChild(favHead);
    const favHint = document.createElement("p");
    favHint.className = "hint";
    favHint.textContent =
      "Feste Kacheln, in dieser Reihenfolge. Fünf passen gut zu drei Spalten, " +
      "weil der Slot für die aktive Szene noch dazukommt.";
    favSection.appendChild(favHint);
    this._favList = document.createElement("div");
    this._favList.style.display = "flex";
    this._favList.style.flexDirection = "column";
    this._favList.style.gap = "6px";
    favSection.appendChild(this._favList);
    this._favPicker = document.createElement("select");
    this._favPicker.addEventListener("change", () => {
      const v = this._favPicker.value;
      this._favPicker.value = "";
      if (!v) return;
      this._emit({ favorites: [...(this._config.favorites ?? []), v] });
      this._renderFavorites();
    });
    favSection.appendChild(this._favPicker);
    wrap.appendChild(favSection);

    /* Modus-Icons */
    const modeSection = document.createElement("section");
    const modeHead = document.createElement("h4");
    modeHead.textContent = "Modus-Chips";
    modeSection.appendChild(modeHead);
    this._modeHint = document.createElement("p");
    this._modeHint.className = "hint";
    modeSection.appendChild(this._modeHint);
    this._modeGrid = document.createElement("div");
    this._modeGrid.className = "modegrid";
    modeSection.appendChild(this._modeGrid);
    wrap.appendChild(modeSection);

    /* Script */
    const scriptSection = document.createElement("section");
    const scriptHead = document.createElement("h4");
    scriptHead.textContent = "Schreibweg";
    scriptSection.appendChild(scriptHead);
    const scriptHint = document.createElement("p");
    scriptHint.className = "hint";
    scriptHint.textContent =
      "Empfohlen: ein Script als einziger Schreiber der Helper. Bleibt das Feld leer, " +
      "setzt die Karte input_text und input_select selbst – erst das Preset, dann den Modus.";
    scriptSection.appendChild(scriptHint);
    this._scriptForm = document.createElement("ha-form");
    this._scriptForm.computeLabel = (s) => LABELS["script." + s.name] ?? s.name;
    this._scriptForm.schema = [
      { name: "entity", selector: { entity: { filter: [{ domain: "script" }] } } },
      { name: "raum", selector: { text: {} } },
    ];
    this._scriptForm.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const { entity, raum } = ev.detail.value;
      if (!entity) {
        this._emit({ script: undefined });
        return;
      }
      // Unbekannte Felder des bestehenden script-Blocks bewahren.
      const prev = this._config.script ?? {};
      const data = { ...(prev.data ?? {}) };
      if (raum) data.raum = raum;
      else delete data.raum;
      const next = { ...prev, entity };
      if (Object.keys(data).length) next.data = data;
      else delete next.data;
      this._emit({ script: next });
    });
    scriptSection.appendChild(this._scriptForm);
    wrap.appendChild(scriptSection);
  }

  /* ---- Werte nachziehen ---- */

  _sync() {
    if (!this._built || !this._config) return;
    const c = this._config;

    if (this._hass) this._form.hass = this._hass;
    this._form.schema = this._schema();
    this._form.data = {
      layout: "standard",
      show_current: true,
      show_more: true,
      columns: 3,
      scene_option: "scene",
      ...c,
    };

    if (this._hass) this._scriptForm.hass = this._hass;
    const sc = typeof c.script === "string" ? { entity: c.script } : c.script ?? {};
    this._scriptForm.data = { entity: sc.entity ?? "", raum: sc.data?.raum ?? "" };

    this._renderFavorites();
    this._renderModes();
  }

  _schema() {
    const options = this._modeOptions();
    return [
      {
        name: "",
        type: "grid",
        schema: [
          { name: "title", selector: { text: {} } },
          {
            name: "layout",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "standard", label: "Standard – Chips + Kachelraster" },
                  { value: "kompakt", label: "Kompakt – Segmentleiste + Listen-Chips" },
                  { value: "mini", label: "Mini – Dropdown + Szenen seitlich" },
                ],
              },
            },
          },
        ],
      },
      {
        name: "mode_entity",
        required: true,
        selector: { entity: { filter: [{ domain: "input_select" }] } },
      },
      {
        name: "",
        type: "grid",
        schema: [
          {
            name: "preset_entity",
            selector: { entity: { filter: [{ domain: "input_text" }] } },
          },
          {
            name: "auto_entity",
            selector: { entity: { filter: [{ domain: "input_boolean" }] } },
          },
        ],
      },
      {
        name: "brightness_entity",
        selector: { entity: { filter: [{ domain: ["input_number", "number"] }] } },
      },
      {
        name: "history_entity",
        selector: { entity: { filter: [{ domain: "sensor" }] } },
      },
      {
        name: "",
        type: "grid",
        schema: [
          {
            name: "scene_option",
            // Sobald der input_select bekannt ist, wird daraus eine Auswahl
            // statt eines Textfelds - dann kann man sich nicht mehr vertippen.
            selector: options.length
              ? { select: { options, mode: "dropdown" } }
              : { text: {} },
          },
          { name: "columns", selector: { number: { min: 1, max: 8, mode: "box" } } },
        ],
      },
      {
        name: "",
        type: "grid",
        schema: [
          { name: "show_current", selector: { boolean: {} } },
          { name: "show_more", selector: { boolean: {} } },
        ],
      },
      {
        name: "",
        type: "grid",
        schema: [
          { name: "auto_name", selector: { text: {} } },
          { name: "auto_icon", selector: { icon: {} } },
        ],
      },
    ];
  }

  _modeOptions() {
    const id = this._config?.mode_entity;
    return this._hass?.states?.[id]?.attributes?.options ?? [];
  }

  /* ---- Favoriten ---- */

  _renderFavorites() {
    if (!this._built) return;
    const favs = this._config?.favorites ?? [];
    const list = this._favList;
    list.innerHTML = "";

    if (!favs.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Noch keine Favoriten – unten auswählen.";
      list.appendChild(empty);
    }

    favs.forEach((fav, i) => {
      const key = typeof fav === "string" ? fav : fav.preset;
      const hit =
        this._lib?.byId.get(key) ?? this._lib?.byName.get(normalise(key)) ?? null;

      const row = document.createElement("div");
      row.className = "row" + (this._lib && !hit ? " missing" : "");

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      if (hit?.img) {
        thumb.style.backgroundImage = `url("${PRESET_IMG_BASE}${encodeURIComponent(hit.img)}")`;
      }
      row.appendChild(thumb);

      const grow = document.createElement("div");
      grow.className = "grow";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = hit?.name ?? key;
      grow.appendChild(name);
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = this._lib
        ? hit
          ? hit.id
          : "nicht in der Bibliothek gefunden"
        : "…";
      grow.appendChild(sub);
      row.appendChild(grow);

      row.appendChild(
        this._iconButton("mdi:arrow-up", i === 0, () => this._moveFav(i, -1))
      );
      row.appendChild(
        this._iconButton("mdi:arrow-down", i === favs.length - 1, () =>
          this._moveFav(i, 1)
        )
      );
      row.appendChild(
        this._iconButton("mdi:close", false, () => {
          const next = [...favs];
          next.splice(i, 1);
          this._emit({ favorites: next });
          this._renderFavorites();
        })
      );

      list.appendChild(row);
    });

    /* Auswahlliste neu aufbauen */
    const picker = this._favPicker;
    picker.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = this._lib
      ? "+ Favorit hinzufügen …"
      : "Bibliothek wird geladen …";
    picker.appendChild(placeholder);
    if (!this._lib) return;

    for (const cat of this._lib.categories) {
      const group = document.createElement("optgroup");
      group.label = cat.name;
      let any = false;
      for (const p of this._lib.presets) {
        if (p.categoryId !== cat.id) continue;
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name;
        group.appendChild(opt);
        any = true;
      }
      if (any) picker.appendChild(group);
    }
    picker.value = "";
  }

  _moveFav(i, delta) {
    const favs = [...(this._config.favorites ?? [])];
    const j = i + delta;
    if (j < 0 || j >= favs.length) return;
    [favs[i], favs[j]] = [favs[j], favs[i]];
    this._emit({ favorites: favs });
    this._renderFavorites();
  }

  _iconButton(icon, disabled, onClick) {
    const btn = document.createElement("button");
    btn.className = "iconbtn";
    btn.type = "button";
    if (disabled) btn.setAttribute("disabled", "");
    else btn.addEventListener("click", onClick);
    const ic = document.createElement("ha-icon");
    ic.setAttribute("icon", icon);
    btn.appendChild(ic);
    return btn;
  }

  /* ---- Modus-Icons ----
   *
   * Nur neu bauen, wenn sich die Optionen des input_select tatsaechlich
   * aendern. Sonst wuerde der Icon-Picker bei jedem hass-Update zumachen. */

  _renderModes() {
    if (!this._built) return;
    const options = this._modeOptions();
    const sig = options.join("|");
    if (sig === this._modeSig) return;
    this._modeSig = sig;

    this._modeGrid.innerHTML = "";
    this._modeHint.textContent = options.length
      ? "Je Option ein Icon und optional eine Beschriftung. Ohne Beschriftung zeigt " +
        "der Chip den Wert selbst – bei kleingeschriebenen Werten wie „scene“ lohnt " +
        "sich hier ein lesbarer Name."
      : "Wähle oben einen input_select, dann erscheinen hier seine Optionen.";

    if (options.length) {
      for (const text of ["Wert", "Icon", "Beschriftung"]) {
        const head = document.createElement("div");
        head.className = "colhead";
        head.textContent = text;
        this._modeGrid.appendChild(head);
      }
    }

    for (const option of options) {
      const label = document.createElement("div");
      label.className = "lbl";
      label.textContent = option;
      label.title = option;
      this._modeGrid.appendChild(label);

      const picker = document.createElement("ha-icon-picker");
      picker.hass = this._hass;
      picker.value = this._config.modes?.[option]?.icon ?? "";
      picker.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const modes = { ...(this._config.modes ?? {}) };
        const entry = { ...(modes[option] ?? {}) };
        if (ev.detail.value) entry.icon = ev.detail.value;
        else delete entry.icon;
        if (Object.keys(entry).length) modes[option] = entry;
        else delete modes[option];
        this._emit({ modes: Object.keys(modes).length ? modes : undefined });
      });
      this._modeGrid.appendChild(picker);

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = option;
      nameInput.value = this._config.modes?.[option]?.name ?? "";
      nameInput.addEventListener("input", () => {
        const modes = { ...(this._config.modes ?? {}) };
        const entry = { ...(modes[option] ?? {}) };
        const v = nameInput.value.trim();
        if (v) entry.name = v;
        else delete entry.name;
        if (Object.keys(entry).length) modes[option] = entry;
        else delete modes[option];
        this._emit({ modes: Object.keys(modes).length ? modes : undefined });
      });
      this._modeGrid.appendChild(nameInput);
    }
  }
}

customElements.define("room-scenes-card-editor", RoomScenesCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "room-scenes-card",
  name: "Room Scenes Card",
  description:
    "input_select als Bubble-Chips plus ein Raster aus scene_presets-Favoriten",
  documentationURL: "https://github.com/koshisan/lovelace-room-scenes-card",
  preview: false,
});

console.info(
  `%c ROOM-SCENES-CARD %c ${CARD_VERSION} `,
  "color:#fff;background:#3f51b5;font-weight:700;border-radius:3px 0 0 3px",
  "color:#3f51b5;background:#eee;border-radius:0 3px 3px 0"
);
