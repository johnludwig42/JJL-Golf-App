# v30.3.82 Product Experience System

## Purpose

The Match tab established a calm iPhone-first pattern: a clear page identity, a small number of understandable destinations, focused drill-ins, predictable return behavior, quiet status language, and one existing source of truth beneath the presentation. v30.3.82 applies that system to Scores, Library, and More.

## Shared contract

Each participating tab provides:

- a left-aligned page identity;
- a quiet overview made of destination cards;
- focused destination presentation;
- a consistent return control;
- accessible native buttons and headings;
- responsive one-column mobile and two-column wider layouts;
- print behavior that restores the complete Scores record.

## Distinct jobs

- **Scores:** Results, Scorecards, Statistics, and Round Story.
- **Library:** Rounds, Courses, Players, and Current Session.
- **More:** Account & Security, Preferences, Golf Utilities, Shared Match, and App Support.

The shared system does not make these tabs semantically identical. It gives different jobs a consistent navigation grammar.

## State and compatibility boundary

Destination selection is ephemeral presentation state. It is not saved to localStorage, synchronized through Shared Match, written to a Round, or included in a RoundRecord. Existing elements retain their IDs, handlers, forms, render functions, and data ownership. Opening a destination may open an existing disclosure but does not mutate domain state.

Play and Insights remained outside the original v30.3.82 release. Print restores all relevant Scores sections regardless of the currently viewed destination.

## v31.0.58 — all six tab jobs

The color, typography and component foundations now support every tab. Match is
round configuration; Play is the current-hole scoring instrument; Scores is round
review; Library manages recorded rounds and reusable entries; Insights provides
an entry to existing round statistics/history; More is settings and support.

Play shares control states, spacing, type roles and surface shapes but retains
direct hole/scoring controls instead of adopting an overview/drill-in wrapper.
Both Classic and Player Mode keep the same authoritative scoring controller.
Score choices reflow without fragmenting short labels at narrow/enlarged sizes.

Insights uses the destination-card grammar to route to existing Scores statistics
or Library rounds; it does not compute cross-round analytics. Both links use the
existing ephemeral destination navigation and preserve review selection/data.

Navigation uses six labeled SVG icons in a compact top row. At larger text sizes
the row scrolls independently, with keyboard focus and selected-tab visibility.
The current destination is exposed with aria-current. Bottom navigation is deferred;
real iPhone keyboard, Larger Text and safe-area acceptance remains required.
