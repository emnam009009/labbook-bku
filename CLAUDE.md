# CLAUDE.md

> **Entry point cho AI agents** (Claude, Cursor, Copilot). Đọc file này TRƯỚC, sau đó dive vào AGENTS.md cho chi tiết.

## TL;DR — 30 seconds

LabBook BKU là **web app quản lý phòng thí nghiệm hoá**. Stack:
- **Vite 8 + Tailwind 3 + Firebase RTDB + TypeScript ESM**
- Deploy: **Firebase Hosting (Spark plan)** → `https://lab-manager-268a6.web.app`
- Working dir (WSL Ubuntu): `~/LAB-MANAGER/labbook-vite-tailwind/labbook`
- Repo: `github.com/emnam009009/labbook-bku`

**Owner**: bạn Nam — communication 100% **tiếng Việt**.

## Critical rules (NEVER violate)

1. **CSS `:has()` selector BROKEN** trong project — không dùng. Dùng JS DOM check thay thế.
2. **Patches**: Luôn dùng atomic Python script trong `/mnt/user-data/outputs/labbook-patches/` với backup `.bakNN`.
3. **Verify before deploy**: `npm run typecheck && npm run build && npm test` (62/62 must pass).
4. **AGENTS.md tracked in repo** — `git pull` đầu session, KHÔNG `rm -f`.
5. **Boundary verify before patch**: grep/read file thực tế trước khi viết patch — KHÔNG assume HTML structure.

## Quick navigation

| Topic | File |
|-------|------|
| Full architecture + folder map | [AGENTS.md](./AGENTS.md) |
| Tech stack details + conventions | [.claude/memory/global.md](./.claude/memory/global.md) |
| Established code patterns | [.claude/memory/patterns.md](./.claude/memory/patterns.md) |
| Lessons learned (DON'Ts) | [.claude/memory/mistakes.md](./.claude/memory/mistakes.md) |
| Debug workflow | [.claude/skills/coding/debug.md](./.claude/skills/coding/debug.md) |
| Optimization workflow | [.claude/skills/coding/optimize.md](./.claude/skills/coding/optimize.md) |
| Origin Lab integration | [.claude/skills/labbook/origin-integration.md](./.claude/skills/labbook/origin-integration.md) |
| Future features | [ROADMAP.md](./ROADMAP.md) |
| Recent changes | [CHANGELOG.md](./CHANGELOG.md) |

## Current state (as of Round 103b)

- ✅ **Tests**: 62/62 pass (Vitest)
- ✅ **Lighthouse Mobile**: Performance 93, Accessibility 95, Best Practices 100, SEO 100
- ✅ **CSP**: Mozilla Observatory 125/100 Grade A+ (Round 55-58e)
- ✅ **Origin Lab integration**: Working end-to-end (Round 95-102)
- ✅ **Bundle optimized**: -600KB initial load (Round 103a-b)
- 🔄 **Next**: TBD per user request

## Round numbering

Round = 1 patch session = 1+ atomic Python scripts = 1+ git commits.

Latest pushed: Round 103b. Numbering không reset, monotonically increasing.

## Communication norms

- **Vietnamese-only** với owner Nam.
- Brief, direct. Không ramble.
- Khi tool fail, paste error + diagnose, không apologize blindly.
- Block lệnh cho user **PHẢI** phân biệt rõ WSL bash vs Windows cmd — không trộn.
- Commit messages: tiếng Anh OK (git convention).

## Tools used

- **WSL Ubuntu**: dev environment, builds, deploys
- **Windows**: end user (browser test), Origin Lab desktop integration
- **Firebase Console**: monitor RTDB, Hosting, Auth
- **Edge browser**: primary user browser (downloads → C:\Users\LEGION\Downloads)
