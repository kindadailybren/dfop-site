# DESIGN — Davao Football Open Play (DFOP) Crest & Matchday System

## Brand Anchor (`dfoplogo.png`)
The official **Davao Football Open Play (DFOP)** crest features a circular badge with a bold black outer ring, crisp white keyline, royal cobalt blue band inscribed with `"DAVAO FOOTBALL OPEN PLAY"` and a five-point star, surrounding a bold geometric `DF / OP` stacked monogram on a pure white field.

## Visual World & Surface Palette
- **Primary Mode:** Operate (High-contrast matchday utility built for Davao Football Open Play players pitch-side and admins managing team rotations).
- **Color Palette (Derived from the DFOP Crest):**
  - **Canvas Background (`--bg-canvas`):** `#070B14` (Deep Night Navy / Floodlit Obsidian)
  - **Elevated Surface (`--bg-surface`):** `#0E1628` (Clubhouse Slate Navy)
  - **Interactive Card / Pitch Panel (`--bg-panel`):** `#15203B` (Tactical Royal Slate)
  - **Primary Brand Accent (`--dfop-blue`):** `#1447E6` / `#0D3CE0` (DFOP Crest Royal Cobalt Blue)
  - **Active Highlight (`--dfop-sky`):** `#3B82F6` (Luminous Royal Blue for interactive focus & Team A identity)
  - **Primary Foreground (`--text-primary`):** `#F8FAFC` (Crest White)
  - **Secondary Foreground (`--text-secondary`):** `#94A3B8` (Cool Steel Blue-Slate, >= 4.5:1 contrast)
  - **Muted Foreground (`--text-muted`):** `#64748B`
  - **Tactical Pitch Turf (`--pitch-turf`):** `#0D2818` with crisp white chalk lines (`rgba(248, 250, 252, 0.22)`)
  - **MVP / Star Accent (`--mvp-gold`):** `#F59E0B` (Championship Amber)
  - **Live Match Pulse (`--live-emerald`):** `#10B981`
- **Typography:**
  - Display / Scoreboard / Monogram Headings: Bold athletic grotesque (`Archivo`) echoing the heavy block geometry of the `DFOP` crest lettering, with `tabular-nums` for all scores, timers, and rankings.
  - Body / UI Controls: Clean high-legibility sans (`Public Sans`).
  - Data / CSV / Badges: `IBM Plex Mono` for CSV rows and position codes (`GK`, `DEF`, `MID`, `FWD`).
- **Craft Rules:**
  - The circular DFOP logo is rendered with a clean circular mask (`rounded-full`) and crisp ring border so its circular badge geometry is preserved on dark surfaces.
  - Single elevation method per surface (`1px solid rgba(148, 163, 184, 0.14)`).
  - No decorative glass/blur, no gradient text, no thick left/right borders, no eyebrow kickers above headings.
  - Custom SVG geometric icons with uniform stroke weight (no emoji or unicode symbol substitutes).
