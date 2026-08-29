/**
 * pack.js — block packing engine for the Ledger Entry.
 *
 * Deliberately free of DOM. Measurement is injected, so the algorithm can be
 * proven against synthetic fixtures in node and then run against real browser
 * layout unchanged. This is the whole reason page count can become an output
 * instead of a constant.
 *
 * A block is:
 *   { id, splittable, minRows, keepWithNext, keepTogetherWhenFits, breakBefore }
 * measure(block) returns:
 *   { height, headerH, rows: [heights...] }   // rows only meaningful if splittable
 *
 * Splitting a block yields { block, rowStart, rowEnd, height, continued, resumed }
 * so the renderer can emit a repeated header and a "continued" marker.
 */

function packPages(blocks, pageHeight, measure, opts = {}) {
  const MIN_ROWS = opts.minRows ?? 2;      // never strand fewer than this
  const MIN_TAIL = opts.minTail ?? 2;      // never carry fewer than this
  const pages = [];
  let page = [];
  let used = 0;
  const overflows = [];

  const flush = () => { if (page.length) { pages.push(page); page = []; used = 0; } };
  const remaining = () => pageHeight - used;

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const m = measure(block);

    // Blocks that must open a page — the appendix, principally.
    if (block.breakBefore && used > 0) flush();

    // A block that must stay with the next one needs both to fit.
    if (block.keepWithNext && bi + 1 < blocks.length) {
      const next = measure(blocks[bi + 1]);
      const nextMin = blocks[bi + 1].splittable
        ? next.headerH + (next.rows.slice(0, Math.max(MIN_ROWS, blocks[bi + 1].minRows ?? MIN_ROWS))
            .reduce((a, b) => a + b, 0))
        : next.height;
      if (m.height + nextMin > remaining() && used > 0) flush();
    }

    if (m.height <= remaining()) {
      page.push({ block, rowStart: 0, rowEnd: m.rows ? m.rows.length : 0, height: m.height });
      used += m.height;
      continue;
    }

    // Compact category tables should move intact to a fresh page when they fit
    // there. Oversized tables still use the normal row-aware split path.
    if (block.splittable && block.keepTogetherWhenFits && m.height <= pageHeight && used > 0) {
      flush();
      page.push({ block, rowStart: 0, rowEnd: m.rows ? m.rows.length : 0, height: m.height });
      used += m.height;
      continue;
    }

    if (!block.splittable) {
      if (used > 0) flush();
      if (m.height > pageHeight) overflows.push({ id: block.id, by: m.height - pageHeight });
      page.push({ block, rowStart: 0, rowEnd: m.rows ? m.rows.length : 0, height: m.height });
      used += m.height;
      continue;
    }

    // Splittable: fill the current page with as many rows as clear the minimums.
    let cursor = 0;
    const total = m.rows.length;
    const minRows = Math.max(MIN_ROWS, block.minRows ?? MIN_ROWS);

    while (cursor < total) {
      const avail = remaining();
      let h = m.headerH;
      let n = 0;
      while (cursor + n < total && h + m.rows[cursor + n] <= avail) {
        h += m.rows[cursor + n];
        n++;
      }
      const tail = total - cursor - n;
      // Don't strand a runt on this page, and don't carry a runt to the next.
      if (n > 0 && n < minRows) n = 0;
      if (n > 0 && tail > 0 && tail < MIN_TAIL) n = Math.max(0, n - (MIN_TAIL - tail));
      if (n > 0 && n < minRows) n = 0;

      if (n === 0) {
        if (used === 0) {
          // Nothing fits on an empty page: header plus one row is taller than a
          // page. Emit one row anyway and record the overflow rather than loop.
          const forced = m.headerH + m.rows[cursor];
          overflows.push({ id: block.id, by: forced - pageHeight });
          page.push({ block, rowStart: cursor, rowEnd: cursor + 1, height: forced,
                      continued: cursor > 0, resumed: total > cursor + 1 });
          cursor += 1;
          used += forced;
          flush();
          continue;
        }
        flush();
        continue;
      }

      page.push({ block, rowStart: cursor, rowEnd: cursor + n, height: h,
                  continued: cursor > 0, resumed: cursor + n < total });
      used += h;
      cursor += n;
      if (cursor < total) flush();
    }
  }

  flush();
  return { pages, overflows };
}

globalThis.packPages = packPages;
if (typeof module !== "undefined") module.exports = { packPages };
