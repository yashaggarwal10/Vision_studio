import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import Chart from "./Chart.jsx";
import {
  COLORS,
  TYPES,
  TYPE_NAMES,
  formatNumber,
  profile,
  validateProject,
  validateWidget,
} from "./data.js";

export function Dialog({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  drawer = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    const focusable = () =>
      [
        ...root.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ].filter((el) => el.offsetParent !== null);
    (
      root.querySelector("input:not([type=file]),textarea") ||
      focusable()[0] ||
      root
    ).focus();
    const handle = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const list = focusable();
        if (!list.length) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0].focus();
        }
      }
    };
    root.addEventListener("keydown", handle);
    return () => {
      root.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={`overlay ${drawer ? "drawer-overlay" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`dialog ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ChartEditor({ widget, columns, rows, dark, onSave, onClose }) {
  const [value, setValue] = useState(widget),
    [error, setError] = useState("");
  const numbers = columns.filter((c) => c.type === "number");
  const change = (key, next) => setValue((v) => ({ ...v, [key]: next }));
  const setType = (type) =>
    setValue((v) => ({
      ...v,
      type,
      x: ["scatter", "histogram"].includes(type)
        ? numbers[0]?.name || ""
        : v.x || columns[0]?.name || "",
      y: type === "scatter" ? numbers[1]?.name || numbers[0]?.name || "" : v.y,
      agg: type === "scatter" ? "sum" : v.agg,
    }));
  return (
    <Dialog
      title="Chart settings"
      subtitle="Make the data tell your story."
      onClose={onClose}
      drawer
    >
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(validateWidget(value, columns));
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <label>
          Chart title
          <input
            maxLength={100}
            required
            value={value.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <div>
          <span className="field-label">Visualization</span>
          <div className="type-picker">
            {TYPES.map((type) => (
              <button
                type="button"
                key={type}
                className={value.type === type ? "selected" : ""}
                onClick={() => setType(type)}
              >
                {TYPE_NAMES[type]}
              </button>
            ))}
          </div>
        </div>
        {value.type !== "kpi" && (
          <label>
            {["scatter", "histogram"].includes(value.type)
              ? "X field (numeric)"
              : "Group by"}
            <select
              value={value.x}
              onChange={(e) => change("x", e.target.value)}
            >
              {(["scatter", "histogram"].includes(value.type)
                ? numbers
                : columns
              ).map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {value.type !== "histogram" && (
          <>
            <label>
              Calculation
              <select
                value={value.agg}
                onChange={(e) => change("agg", e.target.value)}
                disabled={value.type === "scatter"}
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count rows</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
              </select>
            </label>
            {(value.agg !== "count" || value.type === "scatter") && (
              <label>
                Value field
                <select
                  value={value.y}
                  onChange={(e) => change("y", e.target.value)}
                >
                  <option value="">Select a numeric field</option>
                  {numbers.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {columns.find((c) => c.name === value.x)?.type === "date" && (
          <label>
            Time interval
            <select
              value={value.timeBucket}
              onChange={(e) => change("timeBucket", e.target.value)}
            >
              <option value="day">Daily</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </label>
        )}
        {!["kpi", "scatter", "histogram"].includes(value.type) && (
          <div className="form-row">
            <label>
              Sort
              <select
                value={value.sort}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="desc">Largest first</option>
                <option value="asc">Smallest first</option>
                <option value="label">Label / date</option>
              </select>
            </label>
            <label>
              Group limit
              <select
                value={value.limit}
                onChange={(e) => change("limit", Number(e.target.value))}
              >
                {[5, 10, 20, 50, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n === 1000 ? "Up to 1,000" : n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label>
          Number display
          <select
            value={value.format}
            onChange={(e) => change("format", e.target.value)}
          >
            <option value="number">Number · 1,234</option>
            <option value="compact">Compact · 1.2K</option>
            <option value="currency">Currency · $1,234</option>
            <option value="percent">Percentage · 12% (no rescaling)</option>
          </select>
        </label>
        <div>
          <span className="field-label">Accent color</span>
          <div className="swatches">
            {COLORS.map((color) => (
              <button
                type="button"
                key={color}
                aria-label={`Use ${color}`}
                aria-pressed={value.color === color}
                style={{ background: color }}
                onClick={() => change("color", color)}
              >
                {value.color === color && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
        <div className="preview-label">LIVE PREVIEW</div>
        <div className="editor-preview">
          <Chart widget={value} rows={rows} columns={columns} dark={dark} />
        </div>
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <footer className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            <Check size={16} />
            Apply chart
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export function ImportDialog({
  onDataset,
  onProject,
  onSample,
  onClose,
  hasData,
}) {
  const fileRef = useRef(null),
    controller = useRef(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function read(file) {
    if (!file || busy) return;
    setError("");
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Maximum file size is 20 MB.");
      if (file.name.toLowerCase().endsWith(".json")) {
        onProject(validateProject(JSON.parse(await file.text())));
        return;
      }
      let rows;
      if (file.name.toLowerCase().endsWith(".csv")) {
        const parsed = Papa.parse(await file.text(), {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h) => h.trim(),
        });
        if (
          parsed.errors.length ||
          Object.keys(parsed.meta.renamedHeaders || {}).length
        )
          throw new Error(
            "Check the CSV: use unique headers and the same number of fields on every row.",
          );
        rows = parsed.data;
      } else if (file.name.toLowerCase().endsWith(".xlsx")) {
        controller.current = new AbortController();
        const timer = setTimeout(() => controller.current.abort(), 30000);
        try {
          const body = new FormData();
          body.append("dataset", file);
          const res = await fetch("/api/upload-dataset", {
            method: "POST",
            body,
            signal: controller.current.signal,
          });
          const data = await res.json();
          if (!res.ok)
            throw new Error(
              typeof data.detail === "string"
                ? data.detail
                : "The workbook could not be read.",
            );
          rows = data.rows;
        } finally {
          clearTimeout(timer);
        }
      } else
        throw new Error(
          "Choose a .csv, .xlsx, or Vision Studio .json project.",
        );
      const columns = profile(rows);
      onDataset({ name: file.name, rows, columns, sample: false });
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "Import cancelled or timed out. Please retry."
          : err.message || "Import failed. Check that the API is running.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Bring your data"
      subtitle="Every great dashboard starts with a good dataset."
      onClose={onClose}
    >
      <div className="dialog-body">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.json"
          hidden
          onChange={(e) => read(e.target.files[0])}
        />
        <button
          className={`dropzone ${drag ? "dragging" : ""}`}
          disabled={busy}
          onClick={() => fileRef.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            read(e.dataTransfer.files[0]);
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" size={30} />
          ) : (
            <Upload size={28} />
          )}
          <strong>
            {busy ? "Reading your data…" : "Choose a file or drop it here"}
          </strong>
          <span>CSV, Excel (.xlsx), or a saved project (.json)</span>
          <small>Up to 20 MB · 50,000 rows · 100 columns</small>
        </button>
        {hasData && (
          <div className="notice">
            Importing starts a fresh workspace with the selected data. Export
            your current project to keep a separate copy. You can undo the
            import in this session.
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="or-divider">
          <span>OR EXPLORE FIRST</span>
        </div>
        <button className="sample-option" disabled={busy} onClick={onSample}>
          <span className="sample-icon">
            <FileSpreadsheet size={22} />
          </span>
          <span>
            <strong>Try the commerce dataset</strong>
            <small>192 sample records · 6 months of growth</small>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
    </Dialog>
  );
}

export function AiDialog({
  onClose,
  onGenerate,
  busy,
  error,
  configured,
  columns,
  hasCharts,
  hasDraft,
  onCancel,
}) {
  const [prompt, setPrompt] = useState(""),
    [mode, setMode] = useState(hasDraft ? "refine" : "new");
  const number = columns.find((c) => c.type === "number")?.name,
    category = columns.find((c) => c.type === "text")?.name,
    date = columns.find((c) => c.type === "date")?.name;
  const suggestions = [
    number && category
      ? `Compare ${number} by ${category} with a total and a breakdown.`
      : "Create an overview with counts and useful category breakdowns.",
    date && number
      ? `Show ${number} over ${date}, along with the total and average.`
      : "Show the most common categories and the total record count.",
    "Create a concise executive overview with 3 metrics and 3 charts.",
  ];
  return (
    <Dialog
      title="A little help from AI"
      subtitle="Describe the view. Make it yours."
      onClose={onClose}
      drawer
    >
      <form
        className="ai-form"
        onSubmit={(e) => {
          e.preventDefault();
          onGenerate(prompt, hasDraft ? "refine" : mode);
        }}
      >
        <div className="ai-orb">
          <Sparkles size={28} />
        </div>
        <h3>What would you like to see?</h3>
        <p>
          Start with a question or describe a dashboard. You’ll review a draft
          before anything changes.
        </p>
        {!hasDraft && hasCharts && (
          <label>
            Generation mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={busy}
            >
              <option value="new">Create a new page</option>
              <option value="refine">Refine the current page</option>
            </select>
          </label>
        )}
        <label className="sr-only" htmlFor="ai-prompt">
          Describe your dashboard
        </label>
        <textarea
          id="ai-prompt"
          placeholder="e.g. Show monthly revenue, top regions, and a breakdown by acquisition channel…"
          rows={6}
          required
          minLength={3}
          maxLength={3000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
        />
        <div className="field-label">A FEW IDEAS TO GET STARTED</div>
        <div className="suggestions">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s}
              disabled={busy}
              onClick={() => setPrompt(s)}
            >
              <Sparkles size={14} />
              {s}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
        <div className="available-fields">
          <span className="field-label">AVAILABLE FIELDS</span>
          <div>
            {columns.map((c) => (
              <span key={c.name}>{c.name}</span>
            ))}
          </div>
        </div>
        {configured === false && (
          <div className="notice">
            AI isn’t connected yet. Configure the provider key to generate
            dashboards, or use the manual chart editor.
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <footer className="dialog-actions">
          {busy ? (
            <>
              <span className="subtle">Building a chart plan…</span>
              <button
                type="button"
                className="button secondary"
                onClick={onCancel}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="button primary full"
              disabled={configured === false || prompt.trim().length < 3}
              type="submit"
            >
              <Sparkles size={17} />
              {hasDraft || mode === "refine"
                ? "Refine draft"
                : "Generate dashboard"}
              <ArrowRight size={16} />
            </button>
          )}
        </footer>
        <p className="ai-note">
          AI proposes the charts. Vision validates the fields and calculates the
          results from your data.
        </p>
      </form>
    </Dialog>
  );
}

export function DataView({ dataset, onImport }) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  if (!dataset)
    return (
      <div className="empty-state">
        <FileSpreadsheet size={32} />
        <h2>Your data starts here</h2>
        <p>Import a file to inspect its fields and build a dashboard.</p>
        <button className="button primary" onClick={onImport}>
          <Upload size={16} />
          Import data
        </button>
      </div>
    );
  const rows = query
    ? dataset.rows.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
      )
    : dataset.rows;
  const totalPages = Math.max(1, Math.ceil(rows.length / 25)),
    current = Math.min(page, totalPages - 1),
    missing = dataset.columns.reduce((s, c) => s + c.missing, 0);
  return (
    <div className="data-view">
      <div className="data-stats">
        <div>
          <span>Records</span>
          <strong>{formatNumber(dataset.rows.length)}</strong>
        </div>
        <div>
          <span>Fields</span>
          <strong>{dataset.columns.length}</strong>
        </div>
        <div>
          <span>Missing cells</span>
          <strong>{formatNumber(missing)}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong className="source-name">{dataset.name}</strong>
        </div>
      </div>
      <div className="data-table-card">
        <div className="table-toolbar">
          <div>
            <h3>Dataset explorer</h3>
            <p>Inspect your source data before building.</p>
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Search dataset"
              placeholder="Search records…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        <div className="raw-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {dataset.columns.map((c) => (
                  <th key={c.name}>
                    <strong>{c.name}</strong>
                    <span>
                      {c.type} ·{" "}
                      {c.missing ? `${c.missing} missing` : "complete"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(current * 25, (current + 1) * 25).map((r, i) => (
                <tr key={current * 25 + i}>
                  <td>{current * 25 + i + 1}</td>
                  {dataset.columns.map((c) => (
                    <td key={c.name}>
                      {r[c.name] === null ||
                      r[c.name] === undefined ||
                      r[c.name] === "" ? (
                        <span className="missing">null</span>
                      ) : (
                        String(r[c.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="chart-empty">No matching records.</div>
          )}
        </div>
        <footer className="pagination">
          <span>
            {formatNumber(rows.length)} records · Page {current + 1} of{" "}
            {totalPages}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous records"
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Next records"
              disabled={current === totalPages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
