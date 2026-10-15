# Architecture decisions — 2026-10-15

## Codex app-server versus Vercel AI SDK

Use the official app-server protocol directly for v0.2. It supplies native account/login APIs, model discovery, turn lifecycle, structured output and cancellation. AI SDK lists `ai-sdk-provider-codex-app-server`, but it is a community adapter, not an official authentication integration. Wrapping this single backend now adds another compatibility boundary without replacing the process/authentication work. Keep the Codex adapter isolated so AI SDK can be introduced when additional providers are implemented.

Sources: https://learn.chatgpt.com/docs/app-server and https://ai-sdk.dev/providers/community-providers/codex-app-server. Wire shapes were also verified against `codex app-server generate-ts --experimental` from the installed CLI. The standalone child drops parent-chat routing variables to prevent routing-discovery errors when launched from Codex.

## DigUp as a local search component

Source review: https://github.com/ARahim3/DigUp at `ec28973268b81f836be72187ff23b3a16ef4fd97`. Runtime: official Windows release `v0.7.0-beta.1`; installer SHA-256 `0d57036a1547b614cd6830633542169249bbef8e2b0a7e78b5092abc8889a9c6`, matched to GitHub release metadata.

Reviewed: `Sources/DigUpKit/Searcher.swift`, `IndexStore.swift`, `ModelFiles.swift`, `Sources/digup/SearchService.swift`, `IndexService.swift`, and `shell/src-tauri/src/helper.rs`.

Reuse the separate helper through its existing JSON-line protocol, rather than porting the Swift inference engine. Its hybrid ranking combines local semantic embeddings with exact-word matches, and preserves location metadata. Search requests use keyword mode while typing and meaning mode after a short pause. Helpers are launched without a shell; index/model locations are explicit. Codex is not involved in quick-search inference. The earlier cloud-reranking prototype is not the UI search path.

## File operations

The user authorizes autonomous organization inside one writable workspace. Multiple observation folders remain read-only. The host copies explicit uploads before exposing them to the Agent. Every read, search result and write is checked against canonical authorized paths; scope changes clear Agent history and re-filter the file inventory.

The Agent uses a bounded structured tool loop over app-server inference, rather than native unrestricted filesystem tools. Tools include browse, read_file, search, mkdir, move_file, move_directory and write_descriptions. Read-only questions cannot execute organization tools. Sources must be read before content-based file moves; explicit user-specified destinations can authorize metadata-only moves. Directory moves preserve entire contents. File moves use exclusive copies, hashes, source change checks and a durable journal; directory moves use serialized rename with destination checks and a tree hash for undo. No delete or overwrite tool is exposed.

## Directory protocol

Each ordinary workspace directory has overview and intro guides, measured with fixed o200k_base ranks from js-tiktoken 1.0.21. The host synthesizes truthful guides from actual children and known summaries, compressing at complete entry/sentence boundaries. The Agent may improve descriptions. Content signatures preserve Agent descriptions until the underlying directory changes. Missing or oversized guides are regenerated; unsafe writes surface as repair failures. Repositories and packages are opaque for mutations, but readable within authorized roots. Observation descriptions are never synthesized.

## Scoped retrieval

DigUp SearchService filters folder roots after its internal top-k. LazyFile therefore maintains isolated indexes keyed by each search scope's roots, instead of filtering a limited global result list. New scopes can require an initial indexing pass; that state is surfaced and keyword results remain available. This costs additional index storage and model work for overlapping scopes. Every returned hit is reauthorized and protocol files are excluded. Revocation closes affected helpers and suppresses stale results.

Tokenizer reference: https://github.com/dqbd/tiktoken/tree/main/js . App-server reference: https://learn.chatgpt.com/docs/app-server .

## Desktop choice

Electron keeps the frontend and Node-side subprocess/RPC orchestration in one language and works with the existing Windows environment. Both native file access and child-process management stay outside the renderer. The renderer uses a sandbox, context isolation, a CSP, no Node integration and an allowlisted preload bridge. Mac builds remain native-host validation work.
