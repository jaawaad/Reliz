v1.2.0

## ✨ New: Security audit gate

Reliz now runs a **security audit (`npm audit`) before the release/publish step**,
so you don't ship a version with known vulnerabilities by accident.

For every vulnerability it prints the **severity**, a one-line **description**, and
the **version it's fixed in**:

```
⚠ 2 vulnerabilities found (1 critical, 1 moderate)

   1. [critical] lodash <4.17.21
        Prototype Pollution
        fixed in 4.17.21
   2. [moderate] axios <0.21.4
        SSRF via redirect
        fixed in 1.0.0 (major / possibly breaking)
```

### How it works
- **Interactive runs**: pick which packages to update (`1,3`, `a` for all fixable,
  or `n`/Enter to skip). Selected packages are installed at their fixed version, so
  the fix lands in the same release commit. Fixes that need a **major** bump are
  flagged and never auto-selected.
- **CI / `--yes`**: the release is **blocked** when a vulnerability is `failOn`
  (`high` by default) or higher. Set `security.autoUpdate: true` to apply all
  non-major fixes automatically instead.
- **No lockfile / non-npm project**: skipped with a warning. Use `security.command`
  to provide a yarn/pnpm equivalent that emits npm-style JSON.

### Enabled by default — easy to turn off
On by default. Disable per run with `--no-audit` / `RELIZ_NO_AUDIT=1`, or in config:

```json
{
  "security": {
    "enabled": true,
    "level": "low",
    "failOn": "high",
    "autoUpdate": false,
    "command": null
  }
}
```

New flags: `--no-audit`, `--audit`. New env vars: `RELIZ_NO_AUDIT`, `RELIZ_AUDIT`.

---

**Full config reference:** see the README “Security audit” section.
No breaking changes — existing releases keep working; the audit simply runs as a
new pre-release step.
