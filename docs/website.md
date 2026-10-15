# Product website maintenance

Public project site: https://leileqiTHU.github.io/LazyFile/ (English), /zh/ (Simplified Chinese).

This uses the existing public repository's GitHub Pages project site. It does not create an account-level user site, buy a domain/server, or add a paid subscription. Each other public project can use its own repository/path. GitHub platform limits still apply; no unlimited-capacity claim is made. Deployment runs only when website files or its workflow change, or on manual dispatch.

Edit bilingual copy in scripts/build-website.mjs, then run node scripts/build-website.mjs. The script reads the app version from package.json; regenerate after a release before publishing updated download links. Edit website/style.css for presentation. Commit generated website files. The website workflow uploads only website/, not app code, user data or development docs.

SEO: static HTML, language-specific canonical URLs, reciprocal hreflang, descriptive titles and metadata, visible factual FAQ, SoftwareApplication JSON-LD matching the page, sitemap.xml, descriptive screenshot alt text, and repository links. No fake ratings or testimonials. No tracking scripts or paid SEO services.

This project cannot control the account-root /robots.txt from its /LazyFile/ path. A project-local robots file would not control crawling, so none is added. Important text is served without JavaScript. AI-specific text files are not required for eligibility and are not treated as a ranking shortcut.

After deployment, inspect both languages and download links. Sitemap: https://leileqiTHU.github.io/LazyFile/sitemap.xml. Search Console registration/submission is optional and requires the owner's Google account verification; this task does not create accounts or claim submission. Search engine indexing and AI citation are not guaranteed. Keep screenshots and version facts current.

References: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages and https://developers.google.com/search/docs/appearance/ai-features
