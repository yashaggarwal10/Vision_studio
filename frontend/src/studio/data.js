export const TYPES = [
  "kpi",
  "area",
  "bar",
  "line",
  "donut",
  "pie",
  "table",
  "scatter",
  "histogram",
];
export const TYPE_NAMES = {
  kpi: "Metric",
  area: "Area",
  bar: "Bar",
  line: "Line",
  donut: "Donut",
  pie: "Pie",
  table: "Table",
  scatter: "Scatter",
  histogram: "Histogram",
};
export const COLORS = [
  "#7165e8",
  "#45b7ab",
  "#f1b65b",
  "#6699df",
  "#d386ad",
  "#94a3b8",
];
export const uid = () => crypto.randomUUID();
const missing = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && !value.trim());
export const numeric = (value) =>
  missing(value) || typeof value === "boolean"
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
export const isDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value) &&
  Number.isFinite(Date.parse(value));
export function profile(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50000)
    throw new Error("Choose a dataset with 1–50,000 rows.");
  if (rows.some((r) => !r || Array.isArray(r) || typeof r !== "object"))
    throw new Error("Every row must be an object.");
  const names = Object.keys(rows[0]);
  if (
    !names.length ||
    names.length > 100 ||
    names.some((n) => !n.trim() || n.length > 120)
  )
    throw new Error("Use 1–100 named columns (up to 120 characters each).");
  if (
    rows.some((r) =>
      Object.values(r).some(
        (v) =>
          v !== null && !["string", "number", "boolean"].includes(typeof v),
      ),
    )
  )
    throw new Error(
      "Nested values are not supported. Flatten your data first.",
    );
  return names.map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => !missing(v));
    const type =
      values.length && values.every((v) => typeof v === "boolean")
        ? "boolean"
        : values.length && values.every((v) => numeric(v) !== null)
          ? "number"
          : values.length && values.every(isDate)
            ? "date"
            : "text";
    return {
      name,
      type,
      missing: rows.length - values.length,
      unique: new Set(values.map(String)).size,
    };
  });
}
export function aggregate(rows, field, agg) {
  if (agg === "count") return rows.length;
  const vals = rows.map((r) => numeric(r[field])).filter((v) => v !== null);
  if (!vals.length) return null;
  if (agg === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (agg === "min") return vals.reduce((a, b) => Math.min(a, b), Infinity);
  if (agg === "max") return vals.reduce((a, b) => Math.max(a, b), -Infinity);
  return vals.reduce((a, b) => a + b, 0);
}
export function bucket(value, period = "month") {
  if (!isDate(value))
    return value === null || value === undefined || value === ""
      ? "(Missing)"
      : String(value);
  const date = new Date(value);
  if (period === "year") return String(date.getUTCFullYear());
  if (period === "day") return date.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 7);
}
export function series(rows, widget, columns = []) {
  const groups = new Map();
  const date = columns.find((c) => c.name === widget.x)?.type === "date";
  for (const row of rows) {
    const raw = row[widget.x];
    const key = date
      ? bucket(raw, widget.timeBucket)
      : raw === null || raw === undefined || raw === ""
        ? "(Missing)"
        : String(raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let items = [...groups].map(([name, group]) => ({
    name,
    value: aggregate(group, widget.y, widget.agg),
  }));
  if (date || widget.sort === "label")
    items.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  else
    items.sort(
      (a, b) =>
        (widget.sort === "asc" ? 1 : -1) *
          ((a.value ?? -Infinity) - (b.value ?? -Infinity)) ||
        a.name.localeCompare(b.name),
    );
  const total = items.length;
  const limit = Number(widget.limit) || 20;
  items = items.slice(0, limit);
  return { items, total, limited: total > items.length };
}
export function histogram(rows, field, bins = 10) {
  const values = rows.map((r) => numeric(r[field])).filter((v) => v !== null);
  if (!values.length) return [];
  const min = values.reduce((a, b) => Math.min(a, b), Infinity),
    max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  if (min === max) return [{ name: String(min), value: values.length }];
  const size = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    name: `${formatNumber(min + i * size)}–${formatNumber(min + (i + 1) * size)}`,
    value: 0,
  }));
  values.forEach(
    (v) => out[Math.min(bins - 1, Math.floor((v - min) / size))].value++,
  );
  return out;
}
export function formatNumber(value, compact = false) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}
export function formatValue(value, widget) {
  if (value === null) return "—";
  const str = formatNumber(value, widget.format === "compact");
  return widget.format === "currency"
    ? `${widget.currency || "$"}${str}`
    : widget.format === "percent"
      ? `${str}%`
      : str;
}
export function filterRows(rows, filter) {
  if (!filter.column || filter.value === "") return rows;
  return rows.filter((r) => String(r[filter.column] ?? "") === filter.value);
}
export function arrange(widgets) {
  const metrics = widgets.filter((w) => w.type === "kpi");
  const charts = widgets.filter((w) => w.type !== "kpi");
  const result = [];
  let y = 0;
  function row(items, widths, height) {
    let x = 0;
    items.forEach((widget, index) => {
      result.push({ ...widget, layout: { x, y, w: widths[index], h: height } });
      x += widths[index];
    });
    y += height;
  }
  const metricRows = Math.ceil(metrics.length / 4);
  for (let r = 0, offset = 0; r < metricRows; r++) {
    const count = Math.ceil((metrics.length - offset) / (metricRows - r));
    row(metrics.slice(offset, offset + count), Array(count).fill(12 / count), 3);
    offset += count;
  }
  // Pair chart sizes and fill each row without leaving unused grid columns.
  const circular = (w) => ["pie", "donut"].includes(w.type);
  while (charts.length) {
    const first = charts.shift();
    if (!charts.length) {
      row([first], [12], 7);
      continue;
    }
    let partner = 0;
    if (["line", "area"].includes(first.type)) {
      const candidate = charts.findIndex(circular);
      if (candidate >= 0) partner = candidate;
    }
    const second = charts.splice(partner, 1)[0];
    const widths = circular(first) === circular(second)
      ? [6, 6]
      : circular(first) ? [4, 8] : [8, 4];
    row([first, second], widths, 7);
  }
  return result;
}
export function makeWidget(columns, type = "bar") {
  const num = columns.find((c) => c.type === "number")?.name || "";
  const category =
    columns.find((c) => c.type === "text")?.name || columns[0]?.name || "";
  const date = columns.find((c) => c.type === "date")?.name;
  return {
    id: uid(),
    type,
    title: TYPE_NAMES[type],
    x:
      type === "line" || type === "area"
        ? date || category
        : type === "histogram" || type === "scatter"
          ? num
          : category,
    y: num,
    agg: num ? "sum" : "count",
    color: COLORS[0],
    limit: 20,
    sort: "desc",
    timeBucket: "month",
    format: "number",
    currency: "$",
    layout: { x: 0, y: 0, w: 6, h: 8 },
  };
}
export function emptyProject() {
  const id = uid();
  return {
    version: 1,
    name: "Untitled workspace",
    dataset: null,
    pages: [
      {
        id,
        name: "Overview",
        description: "A fresh canvas for your next insight.",
        widgets: [],
      },
    ],
  };
}
export function sampleProject() {
  const regions = ["North America", "Europe", "Asia Pacific", "Latin America"];
  const channels = ["Direct", "Organic search", "Paid search", "Referral"];
  const rows = [];
  for (let month = 0; month < 6; month++)
    for (let i = 0; i < 32; i++) {
      const revenue = Math.round(
        920 + month * 168 + ((i * 73 + month * 29) % 780),
      );
      rows.push({
        date: `2026-${String(month + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
        region: regions[i % 4],
        channel: channels[(Math.floor(i / 4) + month) % 4],
        revenue,
        profit: Math.round(revenue * (0.22 + (i % 5) * 0.02)),
        orders: 8 + ((i * 7 + month) % 18),
      });
    }
  const columns = profile(rows),
    base = makeWidget(columns);
  const specs = [
    { type: "kpi", title: "Total revenue", y: "revenue", format: "currency" },
    { type: "kpi", title: "Total orders", y: "orders", color: COLORS[1] },
    {
      type: "kpi",
      title: "Total profit",
      y: "profit",
      format: "currency",
      color: COLORS[2],
    },
    {
      type: "area",
      title: "Revenue over time",
      x: "date",
      y: "revenue",
      sort: "label",
    },
    { type: "donut", title: "Revenue by channel", x: "channel", y: "revenue" },
    {
      type: "bar",
      title: "Revenue by region",
      x: "region",
      y: "revenue",
      color: COLORS[1],
    },
    { type: "table", title: "Channel performance", x: "channel", y: "revenue" },
  ];
  return {
    version: 1,
    name: "Growth workspace",
    dataset: { name: "Sample · Commerce", sample: true, rows, columns },
    pages: [
      {
        id: uid(),
        name: "Revenue overview",
        description:
          "A closer look at revenue, orders, and what drives growth.",
        widgets: arrange(specs.map((s) => ({ ...base, ...s, id: uid() }))),
      },
    ],
  };
}
export function validateWidget(w, columns) {
  if (
    !w ||
    !TYPES.includes(w.type) ||
    typeof w.title !== "string" ||
    !w.title.trim() ||
    w.title.length > 100
  )
    throw new Error("A chart has an invalid type or title.");
  if (!["sum", "avg", "min", "max", "count"].includes(w.agg))
    throw new Error("A chart has an unsupported aggregation.");
  if (w.type !== "kpi" && !columns.some((c) => c.name === w.x))
    throw new Error(`Unknown grouping column in “${w.title}”.`);
  if (
    w.type !== "histogram" &&
    w.agg !== "count" &&
    !columns.some((c) => c.name === w.y && c.type === "number")
  )
    throw new Error(`Choose a numeric value for “${w.title}”.`);
  if (
    ["scatter", "histogram"].includes(w.type) &&
    !columns.some((c) => c.name === w.x && c.type === "number")
  )
    throw new Error("Scatter and histogram charts require a numeric X field.");
  if (
    w.type === "scatter" &&
    !columns.some((c) => c.name === w.y && c.type === "number")
  )
    throw new Error("Scatter charts require a numeric Y field.");
  if (!/^#[0-9a-f]{6}$/i.test(w.color || ""))
    throw new Error("Choose a valid chart color.");
  return {
    ...w,
    id: typeof w.id === "string" ? w.id : uid(),
    limit: [5, 10, 20, 50, 1000].includes(Number(w.limit))
      ? Number(w.limit)
      : 20,
    timeBucket: ["day", "month", "year"].includes(w.timeBucket)
      ? w.timeBucket
      : "month",
    sort: ["asc", "desc", "label"].includes(w.sort) ? w.sort : "desc",
    format: ["number", "compact", "currency", "percent"].includes(w.format)
      ? w.format
      : "number",
    currency: "$",
  };
}
export function validateProject(input) {
  if (
    !input ||
    input.version !== 1 ||
    typeof input.name !== "string" ||
    input.name.length > 100 ||
    !Array.isArray(input.pages) ||
    !input.pages.length ||
    input.pages.length > 20
  )
    throw new Error(
      "This is not a supported Vision Studio project (version 1).",
    );
  const dataset = input.dataset
    ? {
        name: String(input.dataset.name || "Imported data").slice(0, 120),
        rows: input.dataset.rows,
        columns: profile(input.dataset.rows),
        sample: !!input.dataset.sample,
      }
    : null;
  const ids = new Set();
  const pages = input.pages.map((p) => {
    if (
      !p ||
      typeof p.name !== "string" ||
      p.name.length > 100 ||
      !Array.isArray(p.widgets) ||
      p.widgets.length > 24 ||
      (!dataset && p.widgets.length)
    )
      throw new Error("Invalid project page.");
    const widgets = p.widgets.map((w) => {
      const clean = validateWidget(w, dataset.columns);
      if (ids.has(clean.id)) clean.id = uid();
      ids.add(clean.id);
      const l = w.layout;
      if (
        !l ||
        !["x", "y", "w", "h"].every((k) => Number.isInteger(l[k])) ||
        l.x < 0 ||
        l.y < 0 ||
        l.w < 2 ||
        l.h < 3 ||
        l.x + l.w > 12 ||
        l.y > 10000 ||
        l.h > 30
      )
        throw new Error("A chart has an invalid layout.");
      return { ...clean, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    });
    return {
      id: uid(),
      name: p.name,
      description: String(p.description || "").slice(0, 300),
      widgets,
    };
  });
  return { version: 1, name: input.name, dataset, pages };
}
export const initialHistory = (present) => ({ past: [], present, future: [] });
export function historyReducer(state, action) {
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1),
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  if (action.type === "reset") return initialHistory(action.value);
  if (action.type === "change") {
    const next = action.update(state.present);
    if (next === state.present) return state;
    return {
      past: [...state.past, state.present].slice(-30),
      present: next,
      future: [],
    };
  }
  return state;
}
