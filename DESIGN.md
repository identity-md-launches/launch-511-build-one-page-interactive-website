# Token Weather design system

## Overview

Token Weather is a read-only tool for people who want a quick read on ERC-20 movement without opening a wallet or explorer tab. The page pairs a dark, high-contrast weather dashboard with explorer-style identifiers, transfer rows and links. One primary action sits above a report card; the report moves from the weather state to supporting numbers and then to the latest events.

The source of truth is `src/styles.css` for global tokens and layout, `src/main.tsx` for the page and interactive patterns, and `src/activity.ts` for the forecast data model and report rules.

## Colors

Global tokens live in `src/styles.css:1-25`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#080d18` | Page background |
| `--surface`, `--surface-2` | `#101827`, `#151f31` | Report surfaces and stat cards |
| `--ink-strong`, `--ink`, `--ink-muted` | `#f4f7ff`, `#c7d0e2`, `#a4b1c8` | Headings, body copy and secondary metadata |
| `--line`, `--line-strong` | `rgba(159,181,219,.14/.23)` | Structure and control boundaries |
| `--accent` | `#91e9c2` | Primary action, live indicators, focus and positive change |
| `--accent-2` | `#9e9cff` | Forecast emphasis, links and event dots |
| `--warning`, `--danger` | `#f2c36f`, `#f58b91` | Lightning glyph and recoverable field errors |

Weather cards use the same semantic accent roles with restrained radial gradients. Status is always paired with text (Calm, Breezy, Stormy, Lightning) so color is not the only cue. Contrast was reviewed in the rendered dark theme; the automated axe pass found no violations, while a formal ratio audit across alpha gradients remains unmeasured.

## Typography

`src/styles.css:14-25` uses the system stack `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; no remote font or font file is required. No remote font or synthesis override is required; antialiasing is set once on the root. The page heading uses a responsive `clamp` size, tight leading and balanced wrapping. Body copy uses 16px and 1.6 line-height. Small labels use 12px with positive tracking; changing values use tabular numerals. The mobile input remains 16px to avoid iOS zoom.

## Layout

`main` uses a centered 1180px reading frame with 28px desktop gutters and 18px mobile gutters. The intro is centered, then the report card follows a consistent shared edge. The hero uses a 1.65fr/0.85fr grid at wide widths (`src/styles.css:84`), collapses at 860px, and moves to a stacked, padded report at 680px. Stats use four columns on wide screens and two columns on mobile. The transfer table keeps useful columns in a horizontally scrollable region with an explicit “Scroll the table” cue.

At 390px and below the weather graphic floats beside the reading while the label and summary remain in normal flow; the short weather name never breaks mid-word. The 320px Playwright pass showed no document overflow. Logical properties are used for directional margins and inset positions where relevant.

## Elevation & Depth

The page is a flat dark field with restrained radial light. The main report uses a translucent dark gradient, a low-opacity structural border and a soft `0 24px 80px` shadow. Cards use one-pixel borders and tonal fills for grouping; no decorative border is used where spacing already carries the hierarchy. Focus uses a 2px accent outline with a 3px offset and a forced-colors fallback.

## Shapes

The primary report radius is 22px (`--radius-card`), nested cards use 18px, controls use 12px, and compact badges use 8px or 5px. Mobile reduces the report to a 17px radius and cards to 14px while keeping concentric padding. Touch controls use at least a 40px control box, with the mobile copy, refresh and explorer controls reaching 44px.

## Components

- **Search form** — `src/main.tsx:62-127` and `.search-form` in `src/styles.css`. A labelled native input, one verb-first submit button, a sample action, progress text and an inline alert. It validates on submit, keeps the previous report visible during loading, disables duplicate reads, and focuses the invalid input.
- **Forecast card** — `WeatherGlyph`, `weather-card` and `signal-card` in `src/main.tsx:23-36, 139-150` and `src/styles.css:84-116`. Weather text, icon, count, previous-window change and a minute chart repeat the same state in label, shape and number form.
- **Stat cards** — `StatCard` in `src/main.tsx:30-35` and `.stat-card` in `src/styles.css:120-126`. Four compact readouts share label, icon, number and detail spacing.
- **Transfer table** — native `table` markup in `src/main.tsx:164-175`, with a labelled scroll region, external explorer links, UTC times and expandable full-precision amount details. Empty and error states point to a recovery action.
- **Copy and explorer actions** — native buttons and links in `src/main.tsx:92-105, 132-136`. Copy reports success through a stable polite status toast; explorer links identify the new tab in their accessible names.

## Do's and Don'ts

- Start new content inside the report's 31px desktop / 15px mobile padding and reuse the existing tokens.
- Use `--accent` for one primary action and positive/live status; use `--accent-2` for analytical emphasis and links.
- Keep token addresses in monospace and preserve a route to the complete value; do not truncate without an explicit copy or explorer action.
- Use native buttons, inputs, links, `details`, and table semantics before adding ARIA.
- Keep the report useful while the network is loading, and write an error beside the field with its next fix.
- Add another page by reusing the `topbar`, `search-form`, report/card tokens, `StatCard`, and table patterns. A bright unrelated theme, wallet flow, or dense unlabelled chart would conflict with this system.
