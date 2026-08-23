# Room Scenes Card

Eine Lovelace-Karte für Home Assistant, die einen `input_select` als Bubble-Chips darstellt und darunter ein Raster aus Szenen-Presets zeigt.

Gedacht für Setups, in denen ein Raum mehrere Lichtmodi hat, die *keine* Szenen sind — Ambilight-Sync, VR-Beleuchtung, Circadian, Nachtlicht — und zusätzlich eine Szene aus der Bibliothek von [Hypfer/hass-scene_presets](https://github.com/Hypfer/hass-scene_presets).

```
┌─────────────────────────────────────────────┐
│  ( Aus ) ( Sync ) (•VR•) ( Circadian )       │
│  ( Night )                      [ ⚡ Auto ]  │
├─────────────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────┐              │
│  │ AKTIV │ │ Fav 1 │ │ Fav 2 │              │
│  └───────┘ └───────┘ └───────┘              │
│  ┌───────┐ ┌───────┐ ┌───────┐              │
│  │ Fav 3 │ │ Fav 4 │ │ Fav 5 │              │
│  └───────┘ └───────┘ └───────┘              │
│                            … alle anzeigen  │
└─────────────────────────────────────────────┘
```

## Was sie macht

- **Modus-Chips** aus den `options` deines `input_select`. Optik über die CSS-Variablen von [Bubble Card](https://github.com/Clooos/Bubble-Card), mit Rückfall auf die normalen HA-Theme-Variablen, wenn Bubble Card nicht installiert ist.
- **Automatik-Schalter** für einen `input_boolean` rechts in derselben Zeile.
- **Fünf feste Favoriten** plus einem Slot ganz vorn, der immer die aktuelle Szene zeigt. Läuft gerade ein anderer Modus, steht dort die zuletzt benutzte Szene, gedimmt — ein Tap genügt zum Zurückwechseln.
- **Popup** mit der kompletten Bibliothek, nach Kategorien sortiert, optional mit einem „Zuletzt benutzt"-Regal. Dort sitzt die Beschriftung unter dem Bild statt darauf — beim Stöbern will man die Farben sehen, nicht den Namen.
- **Thumbnails kommen von selbst.** Die Karte liest `/assets/scene_presets/scene_presets.json` (die Integration stellt die View ohne Auth bereit) und löst Presets über ihren Namen auf. Du schreibst `Rest`, nicht `e03267e7-9914-4f47-97fe-63c0bd317fe7`.

Die Favoriten stehen bewusst fest statt sich nach Häufigkeit umzusortieren. Wandernde Kacheln zerstören das Muskelgedächtnis, und genau davon lebt eine Karte, die man täglich am Tablet oder neben dem Bett antippt.

## Voraussetzungen

- Home Assistant 2024.6 oder neuer
- [hass-scene_presets](https://github.com/Hypfer/hass-scene_presets) via HACS
- [Bubble Card](https://github.com/Clooos/Bubble-Card) — optional, nur für die Optik

## Installation

**HACS** → Menü oben rechts → *Benutzerdefinierte Repositories* → `https://github.com/koshisan/lovelace-room-scenes-card`, Kategorie *Dashboard*. Danach installieren und Home Assistant neu laden.

**Manuell:** `dist/room-scenes-card.js` nach `/config/www/` kopieren und unter *Einstellungen → Dashboards → Ressourcen* als **JavaScript-Modul** eintragen:

```
/local/room-scenes-card.js
```

## Konfiguration

Die Karte bringt einen **visuellen Editor** mit — Entity-Picker für die Helper, eine Auswahlliste für den Szenenmodus (gefüllt aus den Optionen deines `input_select`), Icon und Beschriftung je Chip, und eine Favoritenliste mit Vorschaubildern und Sortierpfeilen.

Was der Editor nicht abbildet — `presets`-Overrides und zusätzliche Felder in `script.data` — bleibt beim Speichern trotzdem erhalten. Du kannst also zwischen YAML und Oberfläche hin- und herwechseln, ohne dass dir etwas verloren geht.

Die vollständige YAML:

```yaml
type: custom:room-scenes-card
title: Wohnzimmer

mode_entity: input_select.wohnzimmer_modus
preset_entity: input_text.wohnzimmer_szene
auto_entity: input_boolean.wohnzimmer_auto
history_entity: sensor.wohnzimmer_szenen_verlauf

scene_option: scene
columns: 3

script:
  entity: script.licht_modus_setzen
  data:
    raum: wohnzimmer

# Die Werte des input_select sind kleingeschrieben, die Chips sollen es
# nicht sein - dafuer ist name da. Ohne name zeigt der Chip den Wert selbst.
modes:
  aus:       { icon: mdi:power,                     name: Aus }
  scene:     { icon: mdi:palette,                   name: Szene }
  sync:      { icon: mdi:television-ambient-light,  name: Sync }
  vr:        { icon: mdi:virtual-reality,           name: VR }
  circadian: { icon: mdi:theme-light-dark,          name: Circadian }
  night:     { icon: mdi:weather-night,             name: Night }

favorites:
  - Rest
  - Relax
  - Read
  - Energize
  - Nightlight
```

### Optionen

| Option | Typ | Default | Bedeutung |
|---|---|---|---|
| `mode_entity` | string | — | **Pflicht.** Der `input_select` mit deinen Modi. |
| `preset_entity` | string | – | `input_text`, in dem die aktive Preset-UUID steht. Ohne ihn entfällt der Aktiv-Slot. |
| `auto_entity` | string | – | `input_boolean` für den Automatik-Chip. |
| `history_entity` | string | – | Sensor mit einem `recent`-Attribut für das „Zuletzt benutzt"-Regal im Popup. |
| `title` | string | – | Überschrift. Weglassen blendet die Kopfzeile aus. |
| `scene_option` | string | `scene` | Welche Option des `input_select` den Szenenmodus bedeutet. |
| `columns` | number | `3` | Spalten im Raster. |
| `favorites` | list | `[]` | Preset-Namen oder UUIDs. |
| `presets` | map | `{}` | Überschreibt `name` und `image` je Preset. |
| `modes` | map | `{}` | Überschreibt `name` und `icon` je Chip. |
| `show_current` | bool | `true` | Aktiv-Slot an erster Stelle. |
| `show_more` | bool | `true` | „Alle anzeigen"-Link. |
| `auto_name` / `auto_icon` | string | `Auto` / `mdi:motion-sensor` | Beschriftung des Automatik-Chips. |
| `script` | map | – | Siehe unten. |

### `script`

Ist `script` gesetzt, ruft die Karte **ausschließlich** dieses Script auf und fasst die Helper nie selbst an. Das ist der empfohlene Weg.

```yaml
script:
  entity: script.licht_modus_setzen
  mode_field: modus       # Default
  preset_field: preset_id # Default
  data:                   # wird bei jedem Aufruf mitgegeben
    raum: wohnzimmer
```

Ohne `script` schreibt die Karte `preset_entity` und `mode_entity` direkt — erst das Preset, dann den Modus.

## Helper, Script und Automationen

Ein vollständiges Package mit allem Nötigen liegt unter [`examples/wohnzimmer.yaml`](examples/wohnzimmer.yaml). Zwei Dinge daraus sind wichtig genug, um sie hier zu wiederholen.

### Ein einziger Schreiber

Modus und Preset sind zwei Entities, und zwei Entities driften auseinander, sobald mehrere Stellen sie schreiben: die Karte setzt das Preset und vergisst den Modus, der Sprachbefehl setzt den Modus und lässt ein veraltetes Preset stehen.

Die Lösung ist kein cleveres Datenmodell, sondern ein einziger Schreibweg. `script.licht_modus_setzen` ist der einzige Aufrufer der Helper — Karte, Fernbedienung, Automationen und Sprache gehen alle darüber. Dann *kann* nichts driften.

Innerhalb des Scripts ist die Reihenfolge nicht beliebig: erst die UUID in den `input_text`, dann den Modus in den `input_select`. Die Automation triggert auf den Modus und findet die UUID so garantiert schon vor. Umgekehrt hättest du eine Race Condition.

### Warum „setzen" und „anwenden" getrennt sind

Home Assistant unterdrückt Schreibvorgänge, die nichts ändern — `StateMachine.async_set` steigt bei gleichem State und gleichen Attributen sofort aus, ohne ein `state_changed` zu feuern.

Das hat eine unangenehme Folge: Wenn der Bewegungsmelder den bereits gesetzten Modus einfach nochmal schreibt, um das Licht wiederherzustellen, passiert schlicht nichts. Deshalb liegt die Lichtlogik in einem eigenen Script (`script.wohnzimmer_licht_anwenden`), das sowohl die Automation als auch der Melder direkt aufrufen. Kein Zustandswechsel nötig, keine duplizierte Logik.

Aus demselben Grund triggert die Automation auf **beide** Helper: wechselst du im Szenenmodus nur das Preset, bleibt der `input_select` unverändert und würde allein nie auslösen.

## Bekannte Einschränkungen

- **`ha-dialog`, `ha-form` und `ha-icon-picker` sind frontend-intern.** Popup und Editor nutzen Elemente, die kein öffentliches API von Home Assistant sind. Seit Jahren stabil, können sich aber theoretisch mit einem Update ändern. Fällt `ha-dialog` weg, bleibt die Karte nutzbar und nur der Bibliotheks-Browser fehlt; fällt `ha-form` weg, bleibt die YAML-Konfiguration.
- **Preset-Namen sind nicht garantiert eindeutig.** `presets.json` kann denselben Namen mehrfach vergeben. Die Karte nimmt den ersten Treffer. Wenn du sichergehen willst, trag die UUID ein.
- **Bei mehreren Räumen wiederholt sich die Karten-YAML.** Wenn dich das stört, hilft [`decluttering-card`](https://github.com/custom-cards/decluttering-card).

## Lizenz

MIT
