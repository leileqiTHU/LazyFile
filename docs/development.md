# Development

Build and test LazyFile locally. For features and usage, see the [English README](../README.md) or [简体中文](../README.zh-CN.md). The app uses Electron, React, TypeScript and Vite.

## Run

Install Node.js 22.12+ (or Node.js 24) and pnpm. Then:

```powershell
git clone https://github.com/leileqiTHU/LazyFile.git
cd LazyFile
pnpm install
pnpm dev
```

`pnpm build` builds the production renderer. `pnpm start` opens the built desktop app. `pnpm test` runs file-safety and agent-policy tests. `pnpm package` creates an unpacked desktop build; `pnpm dist:win` creates a Windows installer. Build `pnpm dist:mac` on a Mac, then configure Apple signing/notarization before distribution.

## First use

1. In Settings, check the Codex connection or sign in with ChatGPT. A local Codex CLI is required; the app discovers the desktop app's CLI on Windows, common CLI locations on Mac, or accepts an explicit executable. Authentication remains under Codex's credential management. Tokens are not read into the renderer or copied into LazyFile settings.
2. Choose the single **LazyFile workspace** in Settings. Send files from chat or the file page: the host copies the selected files into workspace/Inbox and keeps the originals. The Agent gets access only to the received copies, never the original parent directory. Files already in the workspace can move directly.
3. Optionally add multiple **observation folders**. These remain read-only and are included in global search. Existing directory descriptions may be read, but LazyFile never writes descriptions or shadow descriptions for observation folders. Autonomous organization is enabled by default inside the workspace; disable it to keep AI understanding without moves. Essential ambiguity produces a focused question.
4. Use Ctrl+Shift+Space (Windows) / Cmd+Shift+Space (Mac) from another app, or Ctrl/Cmd+K inside LazyFile. Typing shows exact matches, then local semantic matches. Arrow keys select, Enter opens, Ctrl/Cmd+Enter reveals. Search hits keep page/time information; PDF/video previews use the matching location.
5. Recent Activity contains an undo action for every successful move. An undo refuses to overwrite a new original or discard a modified destination.

## Local search setup

Install or build the [DigUp helper](https://github.com/ARahim3/DigUp) for your platform, then select its executable in LazyFile Settings. Model download alone does not install the helper. The following Windows paths are examples used by the original development setup, not files included in this source repository. That setup uses the DigUp v0.7.0-beta.1 helper at `D:\Apps\LazyFileRuntime\DigUp\helper\digup.exe`, and its verified EmbeddingGemma 2 models at `D:\Caches\LazyFile\Models` (~865 MB). The official installer was extracted, not run; no DigUp startup entry or independent installation was created.

The package build bundles the helper and its required DLLs when present. Override `DIGUP_RUNTIME_DIR` for another build machine. Models are separate. Download them with:

```powershell
$env:DIGUP_MODELS = 'D:\Caches\LazyFile\Models'
& 'D:\Apps\LazyFileRuntime\DigUp\helper\digup.exe' download-model --to $env:DIGUP_MODELS
```

The upstream downloader pins the model revision, verifies file sizes and SHA-256, and resumes interrupted downloads. On Mac install/build DigUp, then select `DigUp.app/Contents/Helpers/digup` in Settings or bundle that helper when building. Override `LAZYFILE_MODELS_PATH` and `LAZYFILE_DIGUP_PATH` when running from source. A settings action can download missing models using the configured helper.

## Storage and scope

On Windows with a D: drive, application data uses `D:\Apps\LazyFile\Data`, models use `D:\Caches\LazyFile\Models`, and dependencies/build artifacts stay on D:. Otherwise the application uses its OS application-data directory. Set `LAZYFILE_DATA_DIR` to choose another location before launch. Existing Codex authentication/configuration stays in its existing location (currently C: on the development machine).

The application scans only explicitly authorized roots. Filesystem links cannot grant access outside those roots. File inventory skips hidden files and dependency trees and has a 5,000-file limit per root scan; incomplete scans are shown in the UI. No original upload directory is indexed. Ordinary workspace directories maintain .overview.md and .intro.md; intact repositories/packages are excluded from internal organization. Text extraction for AI is bounded to 60,000 characters and PDFs to 40 pages; the local DigUp search index has its own upstream extraction limits. Audio/video are searchable with the local multimodal engine; their AI chat understanding is currently metadata-only. Files needing OCR are labeled rather than silently represented as fully read.

## Architecture

- `electron/codex.mjs`: newline-delimited app-server RPC, native account login, structured inference, cancellation, process recovery. Host Codex chat routing variables are removed from the child environment. The model has no raw execution environment. It chooses structured tool calls; the host executes authorized tools and feeds results back for the next step.
- `electron/digup.mjs`: local search/index helper lifecycle and JSON-line protocol. Keeps model inference local, with hybrid semantic and exact matching. No cloud search fallback is performed silently.
- `electron/intelligence.mjs`: bounded Agent tool loop for browsing, reading, local search, directory creation, moves and directory descriptions. Each turn has at most 16 inference steps and four tools per step.
- `electron/access.mjs` / `workspace.mjs`: canonical path authorization, upload copy, observation scopes, directory movement and permission changes.
- `electron/protocol.mjs`: directory guides with strict 200/2000-token limits using js-tiktoken 1.0.21 and o200k_base. Complete sentences/entries are retained during automatic compression; unsafe writes are reported for repair.
- `electron/search.mjs`: independent DigUp indexes for each scope, preventing global top-k candidates from crowding out a selected folder. A new scope may initially report indexing and return incomplete results; retry after indexing.
- `electron/files.mjs`: extraction, source identity checks, exclusive destination creation, content verification, serialized move/undo transactions and activity records.
- `electron/main.mjs` / `preload.cjs`: narrow IPC allowlist, validated file IDs, native dialogs, global shortcut, watcher, preview and application lifecycle.
- `src/`: bilingual React UI. Add locale dictionaries through the typed translation interface; English and Simplified Chinese ship now.

## Validation

`node scripts/probe-codex.mjs` tests real OAuth inference. `node scripts/probe-search.mjs` builds an isolated 16-document index and checks exact invoice search and Chinese-to-English semantic search. `node scripts/probe-workspace.mjs` checks real OAuth Agent tool loops in both browse→search and search→browse order, scoped multilingual retrieval, copy/organization, directory guides and undo. `node scripts/smoke-desktop.mjs` tests the actual Electron renderer, language switching, search UI and account access; screenshots are written under D: cache.

## Current release boundaries

This is an initial desktop implementation, not a signed production release. Windows is the tested host; Mac targets are configured but need a native Mac build, helper/framework validation, signing and notarization. Local search depends on the bundled/configured DigUp helper and model files. Codex access uses the user's available plan/quota, and is not a promise of unlimited or free inference. The library metadata store is an atomic JSON file; DigUp keeps its own SQLite/vector index. Interrupted move plans are reconciled at startup without deleting either copy. Large-library storage migration, advanced media playback, and broader UI translations remain subsequent hardening work.

## Version 0.2 migration

Outputs are in `release-v0.2/`. An existing v1 library is backed up before metadata migration. The old archive destination becomes the workspace; non-overlapping imported roots become read-only observation folders. Unscoped legacy single-file references are removed from the active catalog without deleting originals. Legacy chat context is reset so removed scopes are not carried into new Agent requests. The backup remains under application data. Workspace switching does not migrate files; old workspace files remain where they are.

See [architecture decisions](architecture-decisions.md). Machine-specific validation reports are kept locally.
