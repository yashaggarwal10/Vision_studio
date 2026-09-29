import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  Download,
  FileJson,
  FilePlus2,
  Filter,
  GripVertical,
  LayoutDashboard,
  LayoutGrid,
  LoaderCircle,
  Menu,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import Chart from "./Chart.jsx";
import {
  AiDialog,
  ChartEditor,
  DataView,
  Dialog,
  ImportDialog,
} from "./Panels.jsx";
import {
  arrange,
  emptyProject,
  filterRows,
  formatNumber,
  historyReducer,
  initialHistory,
  makeWidget,
  sampleProject,
  uid,
  validateProject,
  validateWidget,
} from "./data.js";
import { download, loadProject, safeName, saveProject } from "./storage.js";

const Grid = WidthProvider(Responsive);
const NO_FILTER = { column: "", value: "" };

function WidgetCard({
  widget,
  rows,
  columns,
  dark,
  edit,
  draft,
  onEdit,
  onDelete,
  onDuplicate,
  onExplain,
  onFilter,
  notify,
}) {
  const ref = useRef(null);
  function exportImage() {
    const url = ref.current?.image();
    if (!url) {
      notify("Use Download → Print / PDF for metric and table cards.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(widget.title)}.png`;
    a.click();
  }
  return (
    <article
      className={`widget-card ${widget.type === "kpi" ? "metric-card" : ""}`}
    >
      <header className="widget-header">
        <div className={`widget-title ${edit && !draft ? "drag-handle" : ""}`}>
          {edit && !draft && <GripVertical size={14} />}
          <h3 title={widget.title}>{widget.title}</h3>
        </div>
        <div className="widget-actions">
          <button
            className="icon-button"
            aria-label={`Explain ${widget.title}`}
            title="How this is calculated"
            onClick={() => onExplain(widget)}
          >
            <CircleHelp size={14} />
          </button>
          {!["kpi", "table"].includes(widget.type) && (
            <button
              className="icon-button"
              aria-label={`Download ${widget.title} image`}
              onClick={exportImage}
            >
              <ArrowDownToLine size={14} />
            </button>
          )}
          {edit && !draft && (
            <>
              <button
                className="icon-button"
                aria-label={`Edit ${widget.title}`}
                onClick={() => onEdit(widget)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Duplicate ${widget.title}`}
                onClick={() => onDuplicate(widget)}
              >
                <Copy size={14} />
              </button>
              <button
                className="icon-button danger-icon"
                aria-label={`Remove ${widget.title}`}
                onClick={() => onDelete(widget.id)}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </header>
      {widget.type !== "kpi" && (
        <div className="widget-description">
          {widget.type === "histogram"
            ? `Distribution of ${widget.x}`
            : widget.type === "scatter"
              ? `${widget.y} against ${widget.x}`
              : `${widget.agg === "count" ? "Record count" : `${widget.agg === "avg" ? "Average" : widget.agg === "sum" ? "Total" : widget.agg} ${widget.y}`} by ${widget.x}`}
        </div>
      )}
      <div className="widget-content">
        <Chart
          ref={ref}
          widget={widget}
          rows={rows}
          columns={columns}
          dark={dark}
          onFilter={!edit && !draft ? onFilter : undefined}
        />
      </div>
    </article>
  );
}

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, null, () =>
    initialHistory(sampleProject()),
  );
  const project = history.present;
  const [ready, setReady] = useState(false),
    [pageId, setPageId] = useState(""),
    [view, setView] = useState("dashboard"),
    [mode, setMode] = useState("explore");
  const [dark, setDark] = useState(
    () => localStorage.getItem("vision-theme") === "dark",
  );
  const [modal, setModal] = useState(null),
    [editor, setEditor] = useState(null),
    [draft, setDraft] = useState(null),
    [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState(""),
    [aiConfigured, setAiConfigured] = useState(null);
  const [filter, setFilter] = useState(NO_FILTER),
    [menu, setMenu] = useState(null),
    [toast, setToast] = useState(""),
    [saveState, setSaveState] = useState("Loading"),
    [mobileNav, setMobileNav] = useState(false),
    [breakpoint, setBreakpoint] = useState("lg");
  const checkpoint = useRef(null),
    projectRef = useRef(project),
    abort = useRef(null),
    cancelled = useRef(false),
    autosaveQueue = useRef(Promise.resolve()),
    saveVersion = useRef(0);
  projectRef.current = project;
  const page = project.pages.find((p) => p.id === pageId) || project.pages[0];
  const columns = project.dataset?.columns || [];
  const rows = useMemo(
    () => filterRows(project.dataset?.rows || [], filter),
    [project.dataset, filter],
  );
  const active = draft
    ? {
        name: draft.title,
        description: draft.description,
        widgets: arrange(draft.widgets),
      }
    : page;
  const closeModal = useCallback(() => {
    abort.current?.abort();
    setAiBusy(false);
    setModal(null);
    setEditor(null);
  }, []);
  const notify = useCallback((message) => setToast(message), []);
  const change = useCallback(
    (update) => dispatch({ type: "change", update }),
    [],
  );
  const changePage = useCallback(
    (update) =>
      change((p) => {
        let changed = false;
        const pages = p.pages.map((item) => {
          if (item.id !== page.id) return item;
          const next = update(item);
          if (next !== item) changed = true;
          return next;
        });
        return changed ? { ...p, pages } : p;
      }),
    [change, page.id],
  );
  const updateWidgets = useCallback(
    (update) =>
      changePage((p) => {
        const widgets = update(p.widgets);
        return widgets === p.widgets ? p : { ...p, widgets };
      }),
    [changePage],
  );
  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          try {
            const restored = validateProject(saved);
            dispatch({ type: "reset", value: restored });
            checkpoint.current = restored;
          } catch {
            setToast(
              "The saved workspace could not be restored. Your export files are unaffected.",
            );
          }
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
          setToast(
            "Browser storage is unavailable. Download your project to keep it.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (ready && !checkpoint.current) checkpoint.current = project;
  }, [ready, project]);
  useEffect(() => {
    if (!ready) return;
    setSaveState("Saving");
    const version = ++saveVersion.current;
    const timer = setTimeout(() => {
      autosaveQueue.current = autosaveQueue.current
        .catch(() => {})
        .then(() => saveProject(project))
        .then(() => {
          if (version === saveVersion.current) setSaveState("Saved locally");
        })
        .catch(() => {
          if (version === saveVersion.current) setSaveState("Download to save");
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("vision-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setFilter(NO_FILTER);
  }, [project.dataset]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMenu(null);
      if (
        (e.ctrlKey || e.metaKey) &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        ) &&
        !modal
      ) {
        if (e.key === "z") {
          e.preventDefault();
          dispatch({ type: e.shiftKey ? "redo" : "undo" });
        }
        if (e.key === "y") {
          e.preventDefault();
          dispatch({ type: "redo" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);
  useEffect(() => {
    const warn = (e) => {
      if (saveState === "Saving" || saveState === "Download to save" || draft) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState, draft]);

  async function save() {
    try {
      ++saveVersion.current;
      setSaveState("Saving");
      const snapshot = projectRef.current;
      autosaveQueue.current = autosaveQueue.current
        .catch(() => {})
        .then(() => saveProject(snapshot));
      await autosaveQueue.current;
      checkpoint.current = snapshot;
      setSaveState("Saved locally");
      notify("Workspace saved in this browser.");
    } catch {
      setSaveState("Download to save");
      notify("Storage is full or unavailable. Download the project instead.");
    }
  }
  function replaceProject(next) {
    change(() => next);
    setPageId(next.pages[0].id);
    setFilter(NO_FILTER);
    setDraft(null);
    setView("dashboard");
    closeModal();
    notify("Workspace ready. You can undo this change.");
  }
  function importDataset(dataset) {
    const next = emptyProject();
    next.name = dataset.name.replace(/\.[^.]+$/, "");
    next.dataset = dataset;
    next.pages[0].description =
      "Your data is ready. Add a chart or create a dashboard with AI.";
    replaceProject(next);
  }
  function editWidget(widget) {
    if (draft) return;
    setMode("edit");
    setEditor(widget);
    setModal({ type: "editor" });
  }
  function addChart() {
    if (!project.dataset) {
      setModal({ type: "import" });
      return;
    }
    if (page.widgets.length >= 24) {
      notify(
        "This page has 24 charts. Add another page to keep things readable.",
      );
      return;
    }
    editWidget(makeWidget(columns));
  }
  function saveWidget(widget) {
    updateWidgets((list) =>
      list.some((w) => w.id === widget.id)
        ? list.map((w) => (w.id === widget.id ? widget : w))
        : arrange([...list, widget]),
    );
    closeModal();
    notify("Chart updated.");
  }
  function duplicate(widget) {
    if (page.widgets.length >= 24) {
      notify("Maximum 24 charts per page.");
      return;
    }
    updateWidgets((list) =>
      arrange([
        ...list,
        { ...widget, id: uid(), title: `${widget.title} copy`.slice(0, 100) },
      ]),
    );
  }
  function layoutChanged(layout) {
    if (mode !== "edit" || draft) return;
    const scale = 12 / { lg: 12, md: 8, sm: 4, xs: 2 }[breakpoint];
    updateWidgets((list) => {
      let changed = false;
      const next = list.map((w) => {
        const l = layout.find((i) => i.i === w.id);
        if (!l) return w;
        const nextLayout = {
          x: Math.round(l.x * scale),
          y: l.y,
          w: Math.round((l.x + l.w) * scale) - Math.round(l.x * scale),
          h: l.h,
        };
        if (["x", "y", "w", "h"].some((k) => w.layout[k] !== nextLayout[k])) {
          changed = true;
          return { ...w, layout: nextLayout };
        }
        return w;
      });
      return changed ? next : list;
    });
  }
  function rename(kind, target) {
    setModal({
      type: "name",
      kind,
      target,
      value:
        kind === "workspace"
          ? project.name
          : kind === "add"
            ? `Page ${project.pages.length + 1}`
            : target.name,
    });
  }
  function confirm(title, message, action) {
    setMenu(null);
    setModal({ type: "confirm", title, message, action });
  }
  async function openAI() {
    if (!project.dataset) {
      setModal({ type: "import" });
      return;
    }
    setAiError("");
    setAiConfigured(null);
    setModal({ type: "ai" });
    try {
      const res = await fetch("/api/health", {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAiConfigured(data.ai_configured);
    } catch {
      setAiConfigured(false);
      setAiError(
        "The AI service is offline. Start the backend to connect it. Manual editing is available.",
      );
    }
  }
  async function generate(prompt, generationMode) {
    setAiBusy(true);
    setAiError("");
    cancelled.current = false;
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    const current = draft
      ? {
          title: draft.title,
          description: draft.description,
          widgets: arrange(draft.widgets),
        }
      : generationMode === "refine"
        ? {
            title: page.name,
            description: page.description,
            widgets: page.widgets,
          }
        : null;
    try {
      const response = await fetch("/api/generate-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          rows: project.dataset.rows,
          current_dashboard: current,
        }),
        signal: controller.signal,
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          "The AI service returned an unreadable response. Please retry.",
        );
      }
      if (!response.ok)
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "The request could not be completed. Check your data and try again.",
        );
      const d = result.dashboard;
      if (
        !d ||
        !Array.isArray(d.widgets) ||
        !d.widgets.length ||
        d.widgets.length > 12
      )
        throw new Error(
          "The AI returned an invalid dashboard. Your page is unchanged.",
        );
      const widgets = arrange(
        d.widgets.map((w) =>
          validateWidget({ ...makeWidget(columns), ...w, id: uid() }, columns),
        ),
      );
      setDraft({
        title: String(d.title || "AI overview").slice(0, 100),
        description: String(d.description || "").slice(0, 300),
        widgets,
        target: draft?.target || (generationMode === "refine" ? page.id : null),
      });
      setView("dashboard");
      setModal(null);
      setFilter(NO_FILTER);
      notify("Your draft is ready. Review it, then add it to your workspace.");
    } catch (err) {
      setAiError(
        err.name === "AbortError"
          ? cancelled.current
            ? "Generation cancelled. Your page is unchanged."
            : "Generation timed out. Please try a shorter request."
          : err.message,
      );
    } finally {
      clearTimeout(timer);
      setAiBusy(false);
      abort.current = null;
    }
  }
  function keepDraft() {
    if (!draft.target && project.pages.length >= 20) {
      notify("Maximum 20 pages. Remove a page before adding this draft.");
      return;
    }
    const id = draft.target || uid();
    change((p) => ({
      ...p,
      pages: draft.target
        ? p.pages.map((item) =>
            item.id === id
              ? {
                  ...item,
                  name: draft.title,
                  description: draft.description,
                  widgets: arrange(draft.widgets),
                }
              : item,
          )
        : [
            ...p.pages,
            {
              id,
              name: draft.title,
              description: draft.description,
              widgets: arrange(draft.widgets),
            },
          ],
    }));
    setPageId(id);
    setDraft(null);
    setMode("edit");
    notify("Dashboard added. You can now edit it or add your own charts.");
  }
  function exportProject() {
    download(
      `${safeName(project.name)}.vision.json`,
      JSON.stringify(project, null, 2),
    );
    setMenu(null);
    notify("Editable project downloaded, including all pages and data.");
  }
  function exportCSV() {
    download(
      `${safeName(project.dataset?.name || "data")}.csv`,
      Papa.unparse(rows, { escapeFormulae: true }),
      "text/csv;charset=utf-8",
    );
    setMenu(null);
  }
  const onChartFilter = useCallback(
    (column, value) => {
      setFilter({ column, value });
      notify(`Filtered by ${column}: ${value}`);
    },
    [notify],
  );
  const filterColumns = columns.filter((c) => c.unique <= 200);
  const filterValues = useMemo(
    () =>
      filter.column
        ? [
            ...new Set(
              (project.dataset?.rows || []).map((r) =>
                String(r[filter.column] ?? ""),
              ),
            ),
          ]
            .filter(Boolean)
            .sort()
        : [],
    [filter.column, project.dataset],
  );
  const selectPage = (id) => {
    setPageId(id);
    setView("dashboard");
    setMobileNav(false);
  };
  if (!ready)
    return (
      <div className="boot">
        <LoaderCircle className="spin" size={24} />
        <span>Opening your workspace…</span>
      </div>
    );
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          aria-label="Close navigation"
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="wordmark">
          vision<span>studio</span>
          <i />
        </div>
        <button
          className="workspace-switch"
          onClick={() => rename("workspace")}
        >
          <span className="workspace-avatar">
            {project.name[0]?.toUpperCase() || "W"}
          </span>
          <span>
            <strong title={project.name}>{project.name}</strong>
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => {
              setView("dashboard");
              setMobileNav(false);
            }}
          >
            <LayoutDashboard size={18} />
            Dashboard
            <ChevronRight size={14} className="nav-chevron" />
          </button>
          <button
            className={view === "data" ? "active" : ""}
            onClick={() => {
              setView("data");
              setMobileNav(false);
            }}
          >
            <Database size={18} />
            Data explorer
            <span className="nav-count">{project.dataset ? 1 : 0}</span>
          </button>
          <button onClick={openAI}>
            <Sparkles size={18} />
            AI assistant<span className="new-tag">AI</span>
          </button>
        </nav>
        <div className="nav-label pages-label">
          YOUR PAGES
          <button
            className="icon-button"
            aria-label="Add page"
            disabled={project.pages.length >= 20 || !!draft}
            onClick={() => rename("add")}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="page-list">
          {project.pages.map((p, index) => (
            <div
              key={p.id}
              className={`page-item ${page.id === p.id && view === "dashboard" ? "selected" : ""}`}
            >
              <button disabled={!!draft} onClick={() => selectPage(p.id)}>
                <span className="page-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span title={p.name}>{p.name}</span>
              </button>
              <button
                className="page-edit icon-button"
                aria-label={`Rename ${p.name}`}
                disabled={!!draft}
                onClick={() => rename("page", p)}
              >
                <Pencil size={12} />
              </button>
              {project.pages.length > 1 && (
                <button
                  className="page-edit icon-button"
                  aria-label={`Delete ${p.name}`}
                  disabled={!!draft}
                  onClick={() =>
                    confirm(
                      "Delete this page?",
                      `“${p.name}” and its charts will be removed. You can undo this action.`,
                      () => {
                        change((pr) => ({
                          ...pr,
                          pages: pr.pages.filter((item) => item.id !== p.id),
                        }));
                        if (pageId === p.id) setPageId("");
                      },
                    )
                  }
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="add-page"
          disabled={project.pages.length >= 20 || !!draft}
          onClick={() => rename("add")}
        >
          <Plus size={15} />
          New page
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <strong>From question to clarity.</strong>
            <p>Turn an idea into a dashboard with a little help from AI.</p>
            <button onClick={openAI}>
              Create with AI
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="user-row">
            <span className="user-avatar">Y</span>
            <span>
              <strong>Your workspace</strong>
              <small>Saved on this device</small>
            </span>
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <LayoutGrid size={15} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {view === "data"
                ? "Data explorer"
                : draft
                  ? "AI draft"
                  : page.name}
            </strong>
          </div>
          <div className="top-actions">
            <span
              className={`save-status ${saveState === "Download to save" ? "failed" : ""}`}
            >
              <span />
              {saveState}
            </span>
            <button
              className="icon-button"
              aria-label="Workspace actions"
              onClick={() => setMenu(menu === "workspace" ? null : "workspace")}
            >
              <MoreHorizontal size={20} />
            </button>
            <button
              className="button secondary small"
              disabled={!!draft}
              onClick={save}
            >
              <Save size={15} />
              <span>Save</span>
            </button>
            <div className="menu-anchor">
              <button
                className="button primary small"
                onClick={() => setMenu(menu === "download" ? null : "download")}
              >
                <Download size={15} />
                Download
                <ChevronDown size={13} />
              </button>
              {menu === "download" && (
                <div className="dropdown">
                  <button onClick={exportProject}>
                    <FileJson size={16} />
                    <span>
                      Editable project
                      <small>All pages + source data · JSON</small>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setMenu(null);
                      setTimeout(() => window.print(), 100);
                    }}
                  >
                    <Download size={16} />
                    <span>
                      Print / save as PDF
                      <small>The current dashboard page</small>
                    </span>
                  </button>
                  <button disabled={!project.dataset} onClick={exportCSV}>
                    <Database size={16} />
                    <span>
                      Filtered source data
                      <small>Current matching rows · CSV</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
          {menu === "workspace" && (
            <div className="dropdown workspace-menu">
              <button
                onClick={() => {
                  setMenu(null);
                  rename("workspace");
                }}
              >
                <Pencil size={16} />
                Rename workspace
              </button>
              <button
                disabled={!!draft}
                onClick={() => {
                  setMenu(null);
                  setModal({ type: "import" });
                }}
              >
                <Upload size={16} />
                Import data / open project
              </button>
              <button
                onClick={() =>
                  confirm(
                    "Start a new workspace?",
                    "Download your current project to keep a separate copy. You can undo this action.",
                    () => replaceProject(emptyProject()),
                  )
                }
              >
                <FilePlus2 size={16} />
                New workspace
              </button>
              <button
                onClick={() =>
                  confirm(
                    "Discard session changes?",
                    "Restore the workspace to when you opened it or last clicked Save. This also replaces the autosaved copy. You can undo this action.",
                    () => {
                      change(() => checkpoint.current || emptyProject());
                      setDraft(null);
                      setPageId("");
                      setView("dashboard");
                      notify("Session changes discarded.");
                    },
                  )
                }
              >
                <RotateCcw size={16} />
                Discard session changes
              </button>
            </div>
          )}
        </header>
        {menu && (
          <button
            className="menu-scrim"
            aria-label="Close menu"
            onClick={() => setMenu(null)}
          />
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {draft
                  ? "YOUR NEXT PERSPECTIVE"
                  : view === "data"
                    ? "KNOW YOUR DATA"
                    : "THE BIG PICTURE"}
                <span className="eyebrow-line" />
              </div>
              <div className="heading-title">
                <h1>{view === "data" ? "Data explorer" : active.name}</h1>
                {!draft && view === "dashboard" && (
                  <button
                    className="icon-button rename-page"
                    aria-label="Rename current page"
                    onClick={() => rename("page", page)}
                  >
                    <Pencil size={16} />
                  </button>
                )}
                {project.dataset?.sample && (
                  <span className="sample-badge">Sample data</span>
                )}
              </div>
              <p>
                {view === "data"
                  ? "A clear view of the records behind your dashboard."
                  : active.description ||
                    "Explore your data. Find the story. Make it yours."}
              </p>
            </div>
            <div className="heading-actions">
              {view === "data" ? (
                <button
                  className="button secondary"
                  onClick={() => setModal({ type: "import" })}
                >
                  <Upload size={16} />
                  Import data
                </button>
              ) : (
                <>
                  <button
                    className="button secondary"
                    onClick={() => setModal({ type: "import" })}
                  >
                    <Upload size={16} />
                    Import data
                  </button>
                  <button className="button secondary" onClick={openAI}>
                    <Sparkles size={16} />
                    {draft ? "Refine draft" : "Ask AI"}
                  </button>
                  <button
                    className="button primary"
                    disabled={!!draft}
                    onClick={addChart}
                  >
                    <Plus size={17} />
                    Add chart
                  </button>
                </>
              )}
            </div>
          </div>
          {draft && (
            <div className="draft-banner">
              <span className="draft-symbol">
                <Sparkles size={20} />
              </span>
              <div>
                <strong>A new perspective, ready for review.</strong>
                <p>
                  {draft.widgets.length} validated charts · Nothing changes
                  until you keep this draft.
                </p>
              </div>
              <button
                className="button ghost"
                onClick={() => {
                  setDraft(null);
                  notify("AI draft discarded. Your workspace is unchanged.");
                }}
              >
                Discard
              </button>
              <button className="button primary" onClick={keepDraft}>
                <Check size={16} />
                {draft.target ? "Apply to page" : "Add to workspace"}
              </button>
            </div>
          )}
          {view === "data" ? (
            <DataView
              key={project.dataset?.name || "empty"}
              dataset={project.dataset}
              onImport={() => setModal({ type: "import" })}
            />
          ) : (
            <>
              <div className="canvas-toolbar">
                <div className="toolbar-left">
                  <div className="segmented" aria-label="Workspace mode">
                    <button
                      className={mode === "explore" ? "selected" : ""}
                      disabled={!!draft}
                      onClick={() => setMode("explore")}
                    >
                      <Search size={14} />
                      Explore
                    </button>
                    <button
                      className={mode === "edit" ? "selected" : ""}
                      disabled={!!draft}
                      onClick={() => setMode("edit")}
                    >
                      <SlidersHorizontal size={14} />
                      Edit
                    </button>
                  </div>
                  <span className="toolbar-divider" />
                  <div className="dataset-label">
                    <Database size={14} />
                    <span title={project.dataset?.name}>
                      {project.dataset?.name || "No dataset"}
                    </span>
                    <span className="row-count">
                      {formatNumber(rows.length)} rows
                    </span>
                  </div>
                </div>
                <div className="toolbar-right">
                  <button
                    className="icon-button"
                    aria-label="Undo"
                    title="Undo · Ctrl Z"
                    disabled={!history.past.length || !!draft}
                    onClick={() => dispatch({ type: "undo" })}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Redo"
                    title="Redo · Ctrl Shift Z"
                    disabled={!history.future.length || !!draft}
                    onClick={() => dispatch({ type: "redo" })}
                  >
                    <Redo2 size={16} />
                  </button>
                  <button
                    className="button text small"
                    disabled={!active.widgets.length || !!draft}
                    onClick={() => {
                      updateWidgets(arrange);
                      notify("Charts arranged into a balanced grid.");
                    }}
                  >
                    <LayoutGrid size={15} />
                    Auto arrange
                  </button>
                </div>
              </div>
              {project.dataset && (
                <div className="filter-bar">
                  <Filter size={14} />
                  <label className="sr-only" htmlFor="filter-field">
                    Filter field
                  </label>
                  <select
                    id="filter-field"
                    value={filter.column}
                    onChange={(e) =>
                      setFilter({ column: e.target.value, value: "" })
                    }
                  >
                    <option value="">Add a filter</option>
                    {filterColumns.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                  </select>
                  {filter.column && (
                    <>
                      <label className="sr-only" htmlFor="filter-value">
                        Filter value
                      </label>
                      <select
                        id="filter-value"
                        value={filter.value}
                        onChange={(e) =>
                          setFilter((f) => ({ ...f, value: e.target.value }))
                        }
                      >
                        <option value="">All values</option>
                        {filterValues.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                      <button
                        className="icon-button"
                        aria-label="Clear filter"
                        onClick={() => setFilter(NO_FILTER)}
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                  <span>
                    {filter.value
                      ? `${formatNumber(rows.length)} matching records`
                      : mode === "edit"
                        ? "Drag chart headers to move · Resize from the corner"
                        : "Click a bar or segment to filter · Scroll charts to zoom"}
                  </span>
                </div>
              )}
              {active.widgets.length ? (
                <Grid
                  className={`dashboard-grid ${mode === "edit" && !draft ? "editing" : ""}`}
                  layouts={{
                    lg: active.widgets.map((w) => ({
                      i: w.id,
                      ...w.layout,
                      minW: 2,
                      minH: 3,
                    })),
                  }}
                  breakpoints={{ lg: 900, md: 650, sm: 440, xs: 0 }}
                  cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
                  rowHeight={32}
                  margin={[18, 18]}
                  containerPadding={[0, 0]}
                  compactType="vertical"
                  isDraggable={mode === "edit" && !draft}
                  isResizable={mode === "edit" && !draft}
                  draggableHandle=".drag-handle"
                  onBreakpointChange={setBreakpoint}
                  onDragStop={layoutChanged}
                  onResizeStop={layoutChanged}
                >
                  {active.widgets.map((widget) => (
                    <div key={widget.id}>
                      <WidgetCard
                        widget={widget}
                        rows={rows}
                        columns={columns}
                        dark={dark}
                        edit={mode === "edit"}
                        draft={!!draft}
                        onEdit={editWidget}
                        onDelete={(id) => {
                          updateWidgets((list) =>
                            list.filter((w) => w.id !== id),
                          );
                          notify("Chart removed. Undo is available.");
                        }}
                        onDuplicate={duplicate}
                        onExplain={(w) =>
                          setModal({ type: "explain", widget: w })
                        }
                        onFilter={onChartFilter}
                        notify={notify}
                      />
                    </div>
                  ))}
                </Grid>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <LayoutDashboard size={32} />
                    <Sparkles size={16} />
                  </div>
                  <span className="eyebrow">
                    A LITTLE DATA. ENDLESS POSSIBILITIES.
                  </span>
                  <h2>
                    {project.dataset
                      ? "What story will you tell?"
                      : "Make room for your next insight."}
                  </h2>
                  <p>
                    {project.dataset
                      ? "Build your first chart, or let AI help you find a starting point."
                      : "Import your data and turn it into a dashboard worth exploring."}
                  </p>
                  <div>
                    <button
                      className="button primary"
                      onClick={
                        project.dataset
                          ? openAI
                          : () => setModal({ type: "import" })
                      }
                    >
                      {project.dataset ? (
                        <Sparkles size={16} />
                      ) : (
                        <Upload size={16} />
                      )}
                      {project.dataset ? "Create with AI" : "Import data"}
                    </button>
                    <button
                      className="button secondary"
                      onClick={
                        project.dataset
                          ? addChart
                          : () => replaceProject(sampleProject())
                      }
                    >
                      {project.dataset
                        ? "Build manually"
                        : "Explore sample data"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              )}
              <footer className="canvas-footer">
                <span>
                  <span className="live-dot" />{" "}
                  {draft
                    ? "Draft preview"
                    : `${active.widgets.length} charts · ${project.pages.length} ${project.pages.length === 1 ? "page" : "pages"}`}
                </span>
                <span>Made with clarity. Built by you.</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal?.type === "import" && (
        <ImportDialog
          hasData={!!project.dataset}
          onClose={closeModal}
          onDataset={importDataset}
          onProject={replaceProject}
          onSample={() => replaceProject(sampleProject())}
        />
      )}
      {modal?.type === "editor" && editor && (
        <ChartEditor
          key={editor.id}
          widget={editor}
          columns={columns}
          rows={rows}
          dark={dark}
          onSave={saveWidget}
          onClose={closeModal}
        />
      )}
      {modal?.type === "ai" && (
        <AiDialog
          onClose={closeModal}
          onGenerate={generate}
          busy={aiBusy}
          error={aiError}
          configured={aiConfigured}
          columns={columns}
          hasCharts={!!page.widgets.length}
          hasDraft={!!draft}
          onCancel={() => {
            cancelled.current = true;
            abort.current?.abort();
          }}
        />
      )}
      {modal?.type === "name" && (
        <Dialog
          title={
            modal.kind === "add"
              ? "Create a page"
              : modal.kind === "workspace"
                ? "Name your workspace"
                : "Rename page"
          }
          onClose={closeModal}
        >
          <form
            className="dialog-body"
            onSubmit={(e) => {
              e.preventDefault();
              const value = modal.value.trim();
              if (!value) return;
              if (modal.kind === "workspace")
                change((p) => ({ ...p, name: value }));
              else if (modal.kind === "add") {
                const id = uid();
                change((p) => ({
                  ...p,
                  pages: [
                    ...p.pages,
                    {
                      id,
                      name: value,
                      description: "A new perspective on your data.",
                      widgets: [],
                    },
                  ],
                }));
                setPageId(id);
                setView("dashboard");
              } else
                change((p) => ({
                  ...p,
                  pages: p.pages.map((item) =>
                    item.id === modal.target.id
                      ? { ...item, name: value }
                      : item,
                  ),
                }));
              closeModal();
            }}
          >
            <label>
              Name
              <input
                required
                maxLength={100}
                value={modal.value}
                onChange={(e) =>
                  setModal((m) => ({ ...m, value: e.target.value }))
                }
              />
            </label>
            <footer className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button type="submit" className="button primary">
                {modal.kind === "add" ? "Create page" : "Save name"}
                <Check size={15} />
              </button>
            </footer>
          </form>
        </Dialog>
      )}
      {modal?.type === "confirm" && (
        <Dialog title={modal.title} onClose={closeModal}>
          <div className="dialog-body">
            <p className="confirm-message">{modal.message}</p>
            <footer className="dialog-actions">
              <button className="button secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="button danger"
                onClick={() => {
                  const action = modal.action;
                  closeModal();
                  action();
                }}
              >
                Confirm
              </button>
            </footer>
          </div>
        </Dialog>
      )}
      {modal?.type === "explain" && (
        <Dialog
          title="Behind this chart"
          subtitle={modal.widget.title}
          onClose={closeModal}
        >
          <div className="dialog-body">
            <dl className="explanation">
              <dt>Source</dt>
              <dd>{project.dataset?.name}</dd>
              <dt>Matching records</dt>
              <dd>
                {formatNumber(rows.length)} of{" "}
                {formatNumber(project.dataset?.rows.length || 0)}
              </dd>
              <dt>Calculation</dt>
              <dd>
                {modal.widget.type === "histogram"
                  ? `Frequency in 10 equal-width bins of ${modal.widget.x}`
                  : modal.widget.type === "scatter"
                    ? `${modal.widget.x} and ${modal.widget.y} per valid row`
                    : `${modal.widget.agg.toUpperCase()}${modal.widget.agg === "count" ? " of rows" : ` of ${modal.widget.y}`}`}
              </dd>
              <dt>Grouping</dt>
              <dd>
                {modal.widget.type === "kpi"
                  ? "All matching rows"
                  : modal.widget.x}
              </dd>
              <dt>Active filter</dt>
              <dd>
                {filter.value ? `${filter.column} = ${filter.value}` : "None"}
              </dd>
              <dt>Missing values</dt>
              <dd>
                Ignored for numeric calculations. Count includes every matching
                row.
              </dd>
              <dt>Computation</dt>
              <dd>Calculated from source records in your browser.</dd>
            </dl>
            <button
              className="button secondary full"
              onClick={() => {
                closeModal();
                setView("data");
              }}
            >
              Inspect source data
              <ArrowRight size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
