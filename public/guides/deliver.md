# Packaging and delivery guidelines

1. **Clean tree**: remove temp files, logs, caches, `.env`, `node_modules`, `.venv`, build artefacts that can be regenerated (keep `dist/` only for static sites that need no build).
2. **Run it fresh once**: from a clean copy (or after removing node_modules/.venv) run the documented install and start commands; confirm they work as written.
3. **README.md** at the root: one-line description, screenshot or feature list, requirements (Node/Python versions), install, run (dev and production), environment variables (from `.env.example`), tests, project structure, API summary, deployment notes (Docker/Vercel/Render if relevant), license.
4. **Pin and record**: lockfile or `requirements.txt`; scripts in `package.json` (`dev build start test`).
5. **Deliver**: `<deliver name="project-name" zip="true"/>` packages the workspace without heavy folders; `<deliver files="report.pdf,deck.pptx"/>` offers individual files. For documents, deliver the final file, not the generator, unless asked (mention that the script is included in the zip).
6. **Final message** (`<done>`): what was built (2-3 sentences), how to run it (exact commands), what was verified (tests, endpoints, renders), known limits. No marketing language.
