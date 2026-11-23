# Local development and releases

- Automatic uploading is paused. Edit and verify locally; do not commit, push or deploy unless the user requests uploading/publishing again.
- On every explicit upload request, review all pending changes, update the `CHANGELOG.md` 未发布 section, and run `python tools/release.py prepare` before the release commit. The first release is 0.8.0; thereafter use `--bump minor` for features and `--bump patch` for fixes (the script detects 新增 by default).
- Run relevant tests, `npm run build`, and `python tools/release.py check` before uploading. If an upload fails after preparation, retry the same version; do not create an empty second release.
- Keep the most recent 10 published versions in `CHANGELOG.md`; the release script moves older entries to `docs/changelog/YYYY.md`. Never discard old notes. See `VERSIONING.md`.
- Keep screenshots, temporary test sites and private reference material outside the repository. Preserve unrelated local edits.

# UI work

- Before changing the builder UI, read `docs/UI-STANDARDS.md`. Keep mobile layouts compact and avoid unnecessary explanatory labels. Use the approved colors in `faction-colors.css` only at user-specified locations.
