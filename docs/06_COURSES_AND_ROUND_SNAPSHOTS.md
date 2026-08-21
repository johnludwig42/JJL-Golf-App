# Courses and Round Course Snapshots

## Current model

v30.3.60 does **not** provide a central canonical Course Catalog or cloud-owned personal course library. Its current production model is a device-local Course Library, optional transitional course-table synchronization, and local snapshots for newly finalized rounds.

The **Course Library** contains reusable saved course setup: course/location, tees, rating/slope, and hole yardage/par/stroke index. It is stored locally and may optionally synchronize with the shared cloud course tables. Manual entry and AI scorecard import save locally first.

Course draft publication is atomic: the course, tees, and holes succeed or roll back together. Before publication, the device stores a separate recovery snapshot. That snapshot is retained through any error and is cleared only after the cloud copy is read back, all tee and hole facts match, and the verified local state is saved. Cloud tees with missing holes remain explicitly incomplete and must never be expanded with default or inferred hole facts.

When a new round is finalized, the app creates a **Round Course Snapshot** containing the selected course and every tee used by the round’s players. Scoring, Play, scorecards, and reports prefer this saved copy so later Library edits do not rewrite that round’s course facts. Shared Match payloads publish the same snapshot.

Legacy rounds without `courseSnapshot` remain compatible by resolving their saved Library course and tee IDs. If a requested tee is missing, the app safely uses the first available tee and exposes the fallback in Play metadata.

AI scorecard import accepts one or multiple files for a single course. Front/back photos, tee panels, images, and PDFs are sent together and interpreted as one combined editable draft. Nothing is saved automatically: the golfer reviews and may correct course, tee, and hole fields first. An 18-hole extraction with only 16 or 17 populated holes renders 18 editable rows with the absent values left blank; a prominent warning names missing hole numbers where possible, and incomplete saves require explicit confirmation. Single-file imports use the existing compatible request shape.

Combo tees retain per-hole source tee IDs and copied hole metadata. Where available, Play and scorecard displays use the hole-specific source tee name rather than only “Combo.”

## Duplicate and validation behavior

Likely duplicates compare normalized name, available location fields, and hole count. Case, spacing, punctuation, accents, apostrophes, and `&` variations are normalized. A likely match prompts before saving another manual/imported course; similarly named courses in different locations remain distinct. This is a safety heuristic, not authoritative catalog matching.

New tee saves require holes 1–18, par 3–6, valid optional yardage, and each stroke index 1–18 exactly once. Existing legacy records remain tolerant on load.

## Future hybrid direction

The intended architecture is:

1. A curated central canonical Course Catalog.
2. A personal User Course Library with favorites, defaults, preferred tees, and controlled adjustments.
3. Immutable Round Course Snapshots for historical truth.

Cloud identity, canonical matching, legacy snapshot migration, dedicated 9-hole course authoring, and Starting Hole / Play Routing / Gambling Segment Basis remain future releases.

## v31.0.05 Course Library stabilization

Publishing now selects only explicit local changes. Approved catalog courses are protected from normal browser editing, deletion, and write-back. Local uploads remain cloud drafts until a maintainer uses the protected approval action. Course cards distinguish Local Changes, Draft Uploaded, Approved, and Needs Attention.

A tee's hole rows are written as one conflict-safe batch using the existing tee/hole uniqueness contract. Cloud operations have bounded timeouts; idempotent reads, updates, and hole batches may retry once, while ambiguous new parent inserts stop for explicit reconciliation rather than risk a duplicate. Publication displays per-course progress, and failures preserve the local draft for a later retry. After successful publication, the app reloads only the affected course IDs; Download Cloud Courses remains the explicit full-catalog refresh.

The future central catalog would introduce stable canonical facility/course identity. A future personal User Course Library would layer favorites, defaults, preferred tees, and controlled user adjustments on that catalog. A future migration may harden legacy rounds with snapshots only where historical facts can be established without guessing. None of those future layers are implemented in v30.3.60.
