# Vision Studio

**An AI-assisted dashboard editor for tabular data.**

Import a dataset, describe the view you want, and review an editable dashboard draft. Vision Studio combines natural-language chart planning with deterministic calculations, responsive layouts, and manual editing.

> **Status:** Phase 1 local application. Authentication, shared workspaces, custom measures, and user-controlled privacy restrictions are not implemented yet.

## Features

- **Import and explore:** CSV, Excel `.xlsx`, saved project JSON, column profiling, and searchable records.
- **AI-assisted authoring:** create or refine a dashboard, review its draft, then accept or discard it.
- **Nine visualizations:** metrics, bar, line, area, pie, donut, table, scatter, and histogram.
- **Editable canvas:** configure, duplicate, remove, drag, resize, and automatically arrange charts.
- **Multiple pages:** create, rename, and remove pages within a workspace.
- **Interactive exploration:** exact-value filters and chart selection.
- **Local persistence:** browser autosave, save checkpoints, and undo/redo.
- **Exports:** editable project JSON, filtered CSV, chart PNG, and current-page print/PDF.
- **Responsive design:** custom styling with light and dark themes.

## How it works

1. Import a table and inspect its inferred column types.
2. Describe a dashboard in **Ask AI**, or add charts manually.
3. The local API prepares a compact dataset description and requests a chart plan from Groq.
4. The backend validates the plan's structure, columns, and numeric requirements.
5. The browser validates again, calculates chart values from source rows, and arranges the canvas.
6. Review the draft. Accepted charts remain editable like manually created charts.

The model proposes chart specifications. Application code performs calculations and assigns coordinates. The app does not execute model-generated code.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Interface | React 19, JavaScript, JSX, custom CSS, Lucide |
| Development and build | Vite, pnpm |
| Charts and canvas | Apache ECharts, React Grid Layout |
| Browser data handling | Papa Parse, IndexedDB |
| API | Python, FastAPI, Uvicorn, Pydantic |
| File processing | pandas, NumPy, openpyxl |
| AI provider | Groq SDK, GPT-OSS 120B |
| Checks | Node test runner, Python unittest, ESLint |

The frontend uses custom CSS, not Material UI. Phase 1 does not use embeddings, a vector database, or retrieval-augmented generation.

## Quick start

### Prerequisites

- Python **3.12**
- Node.js **22.12+** (tested with Node 24)
- Git and a modern browser
- A [Groq API key](https://console.groq.com/keys) for AI generation

CSV import, manual editing, and local calculations work without an AI key. Excel import requires the local API. Initial dependency installation and AI requests require network access.

### 1. Get the source

```bash
git clone https://github.com/yashaggarwal10/Vision_studio.git
cd Vision_studio
```

### 2. Install backend dependencies

**Windows PowerShell**

```powershell
py -3.12 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

**macOS / Linux**

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

Copy the example only when `.env` does not already exist. Edit the root `.env` locally:

```dotenv
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
```

Never put a real key in frontend code or commit `.env`. Restart the API after changes. Existing process environment variables take precedence over `.env`.

### 3. Start the backend

From the repository root, leave this terminal open.

**Windows PowerShell**

```powershell
& .\.venv\Scripts\python.exe -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 5000
```

**macOS / Linux**

```bash
.venv/bin/python -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 5000
```

Check **http://127.0.0.1:5000/api/health**. `ai_configured` indicates that a key exists; it does not verify provider authentication.

### 4. Start the frontend

Open a second terminal:

```bash
cd frontend
npx pnpm install --frozen-lockfile
npx pnpm dev
```

Open **http://127.0.0.1:5173**. The first visit includes labelled synthetic commerce data. Vite forwards `/api` requests to port 5000.

## Using the workspace

### Import and inspect

Use **Import data** and inspect the fields in **Data explorer**. A new dataset starts a fresh workspace and can be undone in the current session. Export the current project first to retain a separate copy.

CSV parsing keeps literal values such as `NA` as text. Mixed numeric/text columns can be classified as text. Normalize missing markers and confirm units before drawing conclusions. Excel parsing can handle missing markers differently from CSV parsing.

### Generate and refine

Use exact column names and specify the calculation. For the built-in sample:

> Create a revenue overview with total revenue, total orders, revenue by month, and revenue by region. Use sum for the numeric measures and chronological order for the trend.

Review the draft before choosing **Add to workspace**. Refine mode can replace the current page after acceptance. Discarding an unaccepted draft leaves the workspace unchanged.

### Edit and arrange

Switch to **Edit** to configure, drag, or resize charts. **Auto arrange** fills the grid without another model request. Filters use one exact field value. Calculations include sum, average, minimum, maximum, and row count, with daily, monthly, or yearly date grouping.

Numeric calculations ignore invalid and missing values while preserving zero. Percentage formatting adds a percent sign without rescaling. Custom expressions, distinct-count measures, and DAX are not available.

### Save and export

| Option | Contents |
| --- | --- |
| Browser autosave | Active workspace in IndexedDB |
| Save | Local checkpoint used by discard changes |
| Editable project JSON | All pages, chart definitions, layouts, and source rows |
| Filtered CSV | Currently matching source rows |
| Chart PNG | An individual graphical chart |
| Print / PDF | The current dashboard page |

Storage belongs to a browser profile and site origin. `localhost` and `127.0.0.1` may have separate workspaces. Clearing site data removes local saves. Use project JSON as a portable backup.

## AI configuration and data handling

The default model is `openai/gpt-oss-120b`, with medium reasoning and strict JSON-schema output. The backend allows one explicit repair attempt if plan validation fails. Provider errors leave the current workspace unchanged.

The browser sends the dataset to the local API. The API sends Groq column statistics, category examples, and three sample rows, together with the prompt and optional current chart definitions. The complete dataset is not included in the model context.

**AI generation is not fully offline.** Samples, examples, and prompts may contain sensitive information. Field-level restrictions, masking, and access controls are future work. Project JSON exports also contain source rows.

Schema validation constrains the response format. It does not guarantee that proposed charts answer the question or that source data is correct.

## Project structure

```text
Vision_studio/
├── backend/
│   ├── app.py                  # Import and AI APIs
│   └── test_app.py             # API tests
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   └── studio/
│   │       ├── App.jsx         # Workspace, pages, history and canvas
│   │       ├── Panels.jsx      # Import, AI dialog, editor and data explorer
│   │       ├── Chart.jsx       # ECharts rendering and interaction
│   │       ├── data.js         # Profiling, calculations, validation and layout
│   │       ├── storage.js      # IndexedDB and downloads
│   │       └── styles.css      # Responsive interface and print styles
│   ├── tests/data.test.js
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── vite.config.js
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server status, model, and key-presence flag |
| POST | `/api/upload-dataset` | Parse a multipart file in the `dataset` field |
| POST | `/api/generate-dashboard` | Accept `prompt`, `rows`, and optional `current_dashboard`; return `dashboard` and `model` |

There is no server-side project persistence endpoint. Development CORS permits the two port-5173 localhost origins.

## Testing and build

From the repository root on Windows:

```powershell
& .\.venv\Scripts\python.exe -m unittest discover -s backend -p 'test_*.py' -v
```

On macOS/Linux, use `.venv/bin/python` for the same command.

```bash
cd frontend
npx pnpm test
npx pnpm lint
npx pnpm build
```

The suite has **10 frontend tests and 8 API tests**, covering calculations, date grouping, histograms, grid bounds, project round trips, history, uploads, and AI validation. Lint and the production build pass. ECharts produces a non-fatal bundle-size warning.

Browser checks covered editing, filters, persistence, draft acceptance/discard, undo, and responsive layout. Download completion and the OS print dialog still need verification in a regular browser.

## Limits

| Resource | Current limit |
| --- | --- |
| File import | 20 MB |
| Dataset | 50,000 rows and 100 columns |
| Workspace | One active dataset, up to 20 pages |
| Page | 24 charts |
| AI draft | 12 charts |
| Undo history | 30 prior project states |

Excel imports use the first sheet. Convert `.xls` to `.xlsx`. These are application constraints, not performance guarantees for every workload.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Page does not open | Frontend terminal and port 5173 |
| Excel import fails | Backend on port 5000, file format, and size |
| AI key rejected | Root `.env`, process environment, and API restart |
| Rate-limit error | Groq quota; wait before retrying |
| Provider timeout | Network access and provider availability |
| Numeric field appears as text | Mixed values or literal missing markers |
| Charts look too small | Browser zoom; use Ctrl+0 and Auto arrange |
| Workspace appears missing | Browser profile and exact site origin |

## Deployment and roadmap

`pnpm build` creates static assets in `frontend/dist`. A deployment must serve these files and route `/api` to FastAPI. The Vite proxy is for local development.

Before shared or public use, add authentication, authorization, HTTPS, server persistence, request limits, and monitoring.

Planned areas:

- Explicit data cleaning and type correction
- Validated custom measures
- User-controlled provider field access and privacy rules
- Authentication and shared workspaces
- Additional export and browser compatibility testing

## References

- [Groq models](https://console.groq.com/docs/models)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)
- [React](https://react.dev/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Apache ECharts](https://echarts.apache.org/)
