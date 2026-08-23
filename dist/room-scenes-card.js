/**
 * room-scenes-card
 *
 * Eine Lovelace-Karte, die einen input_select als Bubble-Chips darstellt und
 * darunter ein Raster aus Szenen-Presets zeigt (Hypfer/hass-scene_presets).
 *
 * https://github.com/koshisan/lovelace-room-scenes-card
 * MIT
 */

const CARD_VERSION = "1.0.0";

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

const normalise = (s) => String(s ?? "").trim().toLowerCase();
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

  /* ---- Preset-Raster ---- */
  .grid { display: grid; gap: var(--rsc-gap); }

  .tile {
    position: relative; aspect-ratio: 1 / 1;
    border: none; padding: 0; cursor: pointer; overflow: hidden;
    color: #fff;
    background-color: var(--secondary-background-color);
    background-size: cover; background-position: center;
    border-radius: var(--bubble-border-radius, var(--ha-card-border-radius, 18px));
    transition: transform .15s ease, box-shadow .15s ease, opacity .3s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .tile:hover { transform: scale(1.03); }
  .tile:active { transform: scale(.97); }

  /* Slot 1 zeigt die zuletzt gewaehlte Szene auch dann, wenn gerade ein
     anderer Modus laeuft - dann aber gedimmt, damit "aktiv" eindeutig bleibt. */
  .tile.dimmed { opacity: .45; filter: saturate(.4); }

  .tile.current {
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
`;

const DIALOG_STYLES = `
  .rsc-dialog-grid {
    display: grid; gap: 8px;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    margin: 0 0 20px 0;
  }
  .rsc-dialog h3 {
    margin: 4px 0 10px 0; font-size: 14px; font-weight: 500;
    color: var(--secondary-text-color);
  }
  .rsc-dialog { padding: 4px; }
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
      scene_option: "Szene",
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

  static getStubConfig() {
    return {
      mode_entity: "input_select.wohnzimmer_modus",
      preset_entity: "input_text.wohnzimmer_szene",
      auto_entity: "input_boolean.wohnzimmer_auto",
      favorites: ["Rest", "Relax", "Read", "Nightlight", "Energize"],
    };
  }

  getCardSize() {
    const tiles = (this._config?.favorites?.length ?? 0) + 1;
    return 2 + Math.ceil(tiles / (this._config?.columns ?? 3)) * 2;
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
    if (sig === this._signature) return;
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

  _message(text) {
    const m = document.createElement("div");
    m.className = "msg";
    m.textContent = text;
    return m;
  }

  _tile(preset, { current = false, dimmed = false, badge = false } = {}) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className =
      "tile" + (current ? " current" : "") + (dimmed ? " dimmed" : "");
    tile.dataset.presetId = preset.id;

    if (preset.image) {
      tile.style.backgroundImage = `url("${preset.image}")`;
    } else {
      const fb = document.createElement("div");
      fb.className = "fallback";
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", preset.missing ? "mdi:help-circle-outline" : "mdi:palette");
      fb.appendChild(icon);
      tile.appendChild(fb);
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
    const fb = document.createElement("div");
    fb.className = "fallback";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:palette-outline");
    fb.appendChild(icon);
    tile.appendChild(fb);
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
    if (!this._lib || this._dialog) return;
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

    const style = document.createElement("style");
    style.textContent = DIALOG_STYLES;
    dialog.appendChild(style);

    const body = document.createElement("div");
    body.className = "rsc-dialog";
    dialog.appendChild(body);

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
        grid.appendChild(this._tile(preset));
      }
      body.appendChild(grid);
    }

    dialog.addEventListener("closed", () => this._closeDialog());
    document.body.appendChild(dialog);
    this._dialog = dialog;
    this._refreshDialogSelection();
  }

  _closeDialog() {
    if (!this._dialog) return;
    const d = this._dialog;
    this._dialog = null;
    d.remove();
  }

  /* Beim Popup nur die Markierung nachziehen statt neu zu bauen - sonst
     springt die Scrollposition bei jedem State-Update zurueck nach oben. */
  _refreshDialogSelection() {
    if (!this._dialog || !this._hass) return;
    const c = this._config;
    const sceneActive = this._hass.states[c.mode_entity]?.state === c.scene_option;
    const activeId = c.preset_entity ? this._hass.states[c.preset_entity]?.state : null;
    for (const tile of this._dialog.querySelectorAll(".tile")) {
      tile.classList.toggle(
        "current",
        sceneActive && tile.dataset.presetId === activeId
      );
    }
  }

  disconnectedCallback() {
    this._closeDialog();
  }
}

customElements.define("room-scenes-card", RoomScenesCard);

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
