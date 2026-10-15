# Third-party notices

LazyFile integrates the MIT-licensed DigUp search helper by Abdur Rahim: https://github.com/ARahim3/DigUp. Its MIT license is included at `licenses/DigUp-MIT.txt`. Upstream runtime dependency notices are preserved with the helper in packaged builds.

DigUp uses EmbeddingGemma 2 from Google DeepMind and the pinned GGUF model conversion. Model weights are downloaded separately through DigUp's verified downloader, with their upstream Apache-2.0 licensing. The helper includes llama.cpp and native document/media libraries; consult the accompanying upstream `THIRD-PARTY-NOTICES.txt` for their notices and obligations. No affiliation with Google, Apple, Microsoft or OpenAI is implied.

The application also uses Electron, React, Vite, TypeScript, Lucide, Mammoth, PDF.js Chokidar and js-tiktoken. Their package license files are retained with runtime/build dependencies.
