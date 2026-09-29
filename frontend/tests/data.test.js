import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  arrange,
  filterRows,
  histogram,
  historyReducer,
  initialHistory,
  profile,
  sampleProject,
  series,
  validateProject,
  validateWidget,
} from "../src/studio/data.js";

test("numeric calculations ignore missing, malformed and boolean values without losing zero", () => {
  const rows = [
    { v: 10 },
    { v: 0 },
    { v: null },
    { v: "" },
    { v: "bad" },
    { v: true },
    { v: 20 },
  ];
  assert.equal(aggregate(rows, "v", "avg"), 10);
  assert.equal(aggregate(rows, "v", "min"), 0);
  assert.equal(aggregate(rows, "v", "sum"), 30);
  assert.equal(aggregate(rows, "v", "count"), 7);
  assert.equal(aggregate([{ v: null }], "v", "max"), null);
});
test("top groups are ranked before limiting; zero and false remain distinct categories", () => {
  const rows = [
    { g: 0, v: 3 },
    { g: false, v: 7 },
    { g: "large", v: 100 },
  ];
  const out = series(rows, {
    x: "g",
    y: "v",
    agg: "sum",
    limit: 2,
    sort: "desc",
  });
  assert.deepEqual(out.items, [
    { name: "large", value: 100 },
    { name: "false", value: 7 },
  ]);
  assert.equal(out.limited, true);
  assert.equal(
    series(rows, { x: "g", y: "v", agg: "sum", limit: 5, sort: "label" })
      .items[0].name,
    "0",
  );
});
test("dates group into sorted calendar periods and do not depend on source row order", () => {
  const rows = [
    { d: "2026-02-20", v: 3 },
    { d: "2026-01-03", v: 4 },
    { d: "2026-01-15", v: 6 },
  ];
  const columns = profile(rows);
  assert.equal(columns[0].type, "date");
  assert.deepEqual(
    series(
      rows,
      { x: "d", y: "v", agg: "sum", timeBucket: "month", limit: 20 },
      columns,
    ).items,
    [
      { name: "2026-01", value: 10 },
      { name: "2026-02", value: 3 },
    ],
  );
});
test("histogram counts all valid values including max, negatives and constant data", () => {
  assert.equal(
    histogram(
      [-2, 0, 2, 4, 6, null, "bad"].map((v) => ({ v })),
      "v",
      4,
    ).reduce((s, b) => s + b.value, 0),
    5,
  );
  assert.deepEqual(histogram([{ v: 2 }, { v: 2 }], "v"), [
    { name: "2", value: 2 },
  ]);
});
test("generated grid stays in bounds with no overlaps across mixed page sizes", () => {
  for (let count = 1; count <= 24; count++) {
    const list = arrange(
      Array.from({ length: count }, (_, i) => ({
        id: String(i),
        type:
          i % 4 === 0
            ? "kpi"
            : i % 3 === 0
              ? "area"
              : i % 2 === 0
                ? "donut"
                : "bar",
      })),
    );
    for (let i = 0; i < list.length; i++) {
      const a = list[i].layout;
      assert.ok(a.x >= 0 && a.x + a.w <= 12 && a.y >= 0);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j].layout;
        assert.ok(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
        );
      }
    }
  }
});
test("automatic layouts fill every row for incident dashboards and metric counts", () => {
  const cases = [
    ["kpi", "line", "bar", "donut", "bar", "donut", "bar", "table"],
    ...Array.from({ length: 24 }, (_, n) => Array(n + 1).fill("kpi")),
  ];
  for (const types of cases) {
    const input = types.map((type, i) => ({ type, id: String(i) }));
    const arranged = arrange(input);
    assert.equal(new Set(arranged.map((w) => w.id)).size, input.length);
    const rows = new Map();
    for (const { layout } of arranged) {
      assert.ok(Number.isInteger(layout.w));
      rows.set(layout.y, (rows.get(layout.y) || 0) + layout.w);
    }
    for (const width of rows.values()) assert.equal(width, 12);
    assert.deepEqual(arrange(arranged), arranged);
  }
});
test("editable project round trip preserves all rows, pages and chart layouts", () => {
  const project = sampleProject();
  project.pages.push({
    ...project.pages[0],
    id: "extra",
    name: "Second view",
    widgets: [],
  });
  project.pages[0].widgets[0].layout = { x: 1, y: 32, w: 4, h: 4 };
  const restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.dataset.rows, project.dataset.rows);
  assert.deepEqual(
    restored.pages.map((p) => p.widgets),
    project.pages.map((p) => p.widgets),
  );
  assert.equal(restored.pages.length, 2);
});
test("invalid imported fields, nonnumeric measures and oversized layouts are rejected", () => {
  const p = sampleProject();
  p.pages[0].widgets[0].y = "nonexistent";
  assert.throws(() => validateProject(p), /numeric/);
  const q = sampleProject();
  q.pages[0].widgets[0].layout.w = 30;
  assert.throws(() => validateProject(q), /layout/);
  const w = {
    ...sampleProject().pages[0].widgets[3],
    type: "scatter",
    x: "channel",
  };
  assert.throws(
    () => validateWidget(w, sampleProject().dataset.columns),
    /numeric X/,
  );
});
test("undo and redo preserve complete project data; new edits invalidate redo", () => {
  const p = sampleProject();
  let state = initialHistory(p);
  state = historyReducer(state, {
    type: "change",
    update: (p) => ({ ...p, name: "Changed" }),
  });
  state = historyReducer(state, { type: "undo" });
  assert.equal(state.present.name, p.name);
  state = historyReducer(state, { type: "redo" });
  assert.equal(state.present.name, "Changed");
  state = historyReducer(state, { type: "undo" });
  state = historyReducer(state, {
    type: "change",
    update: (p) => ({ ...p, name: "New direction" }),
  });
  assert.equal(state.future.length, 0);
});
test("global filters preserve zero and false values", () => {
  const rows = [{ v: 0 }, { v: false }, { v: 3 }];
  assert.deepEqual(filterRows(rows, { column: "v", value: "0" }), [{ v: 0 }]);
  assert.deepEqual(filterRows(rows, { column: "v", value: "false" }), [
    { v: false },
  ]);
});
