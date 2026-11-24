# AGENTS.md — TuiVoz

Rules for AI agents working in this repo:

1. **Read `voz-forum-deploy.md` first, before anything.** It holds the architecture, module map, API routes, deploy steps and the changelog of past fixes/gotchas.
2. **After any source change, write back a short note to `voz-forum-deploy.md`:**
   - Changed a module's behavior → update its row in "Bản đồ module".
   - Bug fix / new feature → append a `§7.x` changelog entry: symptom → files → gotcha. Max ~5 lines, as short as possible.
3. **Comments**: every file keeps its 1-line kdoc header; in-code comments stay 1 short line ("why"/gotcha only) — delete comments that restate code.
4. **Verify**: `node --check` every JS file you touched.
5. Vanilla ES modules, **zero build tool** — don't add bundlers, transpilers or npm deps.
