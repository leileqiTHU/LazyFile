# Third-party notices

LazyFile integrates the MIT-licensed DigUp search helper by Abdur Rahim: https://github.com/ARahim3/DigUp. Its MIT license is included at `licenses/DigUp-MIT.txt`. Upstream runtime dependency notices are preserved with the helper in packaged builds.

DigUp uses EmbeddingGemma 2 from Google DeepMind and the pinned GGUF model conversion. Model weights are downloaded separately through DigUp's verified downloader, with their upstream Apache-2.0 licensing. The helper includes llama.cpp and native document/media libraries; consult the accompanying upstream `THIRD-PARTY-NOTICES.txt` for their notices and obligations. No affiliation with Google, Apple, Microsoft or OpenAI is implied.

The Windows release bundles the official OpenAI Codex CLI 0.162.1 Windows x64 runtime from `@openai/codex@0.162.1-win32-x64` (Apache-2.0). Its license and NOTICE are included at `licenses/Codex-LICENSE.txt` and `licenses/Codex-NOTICE.txt`; bundled runtime notices are retained under `resources/codex`. No account credentials or user configuration are bundled. Authentication is performed by Codex on the user's machine.

The application also uses Electron, React, Vite, TypeScript, Lucide, Mammoth, PDF.js, Chokidar and js-tiktoken. Their package license files are retained with runtime/build dependencies.
