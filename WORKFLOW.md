# Workflow — LabBook BKU Development

**Version**: 3.0
**Last updated**: 2026-05-11
**Status**: Active từ Round 157a trở đi
**Audience**: nAM, AI assistants (Claude, Cursor, Copilot), future collaborators

---

## Major changes from v2.0

- **Branch model**: GitHub Flow thay patch-based monolith branch (`ai-assistant`)
- **1 round = 1 branch ngắn = 1 PR** thay vì gom nhiều round vào 1 long-lived branch
- **CI/CD bắt buộc**: typecheck + test + build chạy trên mỗi PR, block merge nếu fail
- **Conventional Commits enforced**: commitlint trên husky + CI
- **Multi-environment ready**: code-level prep cho dev/staging/prod, setup khi commercial
- **Patch scripts retired**: không còn dùng atomic Python scripts. Git diff workflow trực tiếp.

---

## 1. Why this workflow exists

LabBook BKU đang từ **lab tool nội bộ** chuyển hướng **commercial SaaS**. Workflow v2.0 (patch-based, single long-lived AI branch) phù hợp solo dev + AI assistant nhanh, nhưng không scale cho:

- Team multi-developer (cần PR review)
- Customer-facing (cần staging trước prod)
- Hotfix khẩn cấp tách khỏi feature work
- Rollback nhanh khi production breaks
- Audit history (mỗi feature = 1 PR rõ ràng, không gộp 34 commits 1 lần)

v3.0 áp dụng **GitHub Flow** — chuẩn de facto cho SaaS modern (GitHub, Heroku, Shopify, Vercel).

---

## 2. Branch model

### 2.1 Branch types

```
main                                    ← production, luôn deployable, protected
  ↑
  ├─ phase-c1/R157a-pdf-export          ← feature branch, ngắn (1-7 ngày)
  ├─ phase-c1/R158-xrd-analyzer
  ├─ fix/R159-booking-race              ← bugfix branch
  ├─ chore/R160-deps-update             ← chore/build/config
  ├─ docs/R161-update-architecture      ← doc-only changes
  └─ hotfix/R162-prod-payment-bug       ← urgent prod fix (priority merge)
```

### 2.2 Branch naming

Format: `<type>/<phase>/<round>-<slug>` hoặc `<type>/<round>-<slug>`

**Có phase** (cho rounds nằm trong phase rõ ràng theo ROADMAP.md):
```
phase-a/R108-chat-sidetab
phase-b/R130-paper-upload
phase-b5/R150-materials-firestore
phase-c1/R157a-pdf-export        ← Phase C-1 (R156-R171)
phase-c2/R158-cv-analyzer        ← Phase C-2 (R157-R171)
phase-d/R187-tga-dsc-analyzer
phase-e/R202-lab-mode
```

**Không phase** (cho fix/chore/docs):
```
fix/R162-stock-race-edge-case
chore/R163-bump-firebase-sdk
docs/R164-refresh-architecture
hotfix/R165-prod-csp-blocker
```

### 2.3 Branch rules

- **Branch ngắn**: max 1 tuần. Merge sớm, tránh diff to.
- **1 PR = 1 mục đích**: feature, fix, hoặc chore — không gộp.
- **Branch name lowercase**, dấu gạch ngang, không dấu Vietnamese.
- **Round number bắt buộc** trong branch name để track theo CHANGELOG.

### 2.4 Branch protection trên `main`

GitHub Settings → Branches → Add rule for `main`:

- ✅ Require pull request before merging
- ✅ Require status checks to pass (CI Test + Build phải xanh)
- ❌ Required approving reviews: **0** (solo dev hiện tại, tăng lên 1 khi có team)
- ✅ Require branches to be up to date before merging
- ✅ Require linear history: **OFF** (cho phép merge commit để giữ history)
- ✅ Do not allow bypassing the above settings
- ✅ Lock branch (no force push, no deletion)

---

## 3. Round workflow

### 3.1 Bắt đầu round mới

```bash
# Sync main
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook
git checkout main
git pull origin main

# Tạo branch
git checkout -b phase-c1/R157a-pdf-export
```

### 3.2 Develop + commit

```bash
# Code, edit files trực tiếp (không dùng patch script)
# Commit thường xuyên, mỗi commit là 1 sub-task hoặc fix:

git add <files>
git commit -m "feat(R157a): scaffold PDF export module with Vietnamese fonts"
git commit -m "feat(R157a): add PDF preview before download"
git commit -m "fix(R157a-fix1): correct font embedding for Vietnamese diacritics"

# Sub-round suffix (a/b/c/fix1/fix2/...) như cũ — giữ convention
```

### 3.3 Push + tạo PR

```bash
# Push branch lần đầu
git push -u origin phase-c1/R157a-pdf-export

# Hoặc push tiếp các commit sau
git push
```

GitHub auto detect → suggest tạo PR. Hoặc vào https://github.com/emnam009009/labbook-bku/pull/new/phase-c1/R157a-pdf-export

**PR Title format**:
```
feat(R157a): PDF export for experiment reports
```

**PR Description template**:
```markdown
## What changes
- Scaffold `src/ts/services/pdf-export/` module
- Add Vietnamese font (Roboto) embedding
- Wire export button vào experiment detail page

## Why
- User cần xuất report PDF gửi đối tác/giảng viên
- Trước đây chỉ có Excel export, không phù hợp định dạng báo cáo

## Files
- `src/ts/services/pdf-export/index.ts` (new)
- `src/ts/services/pdf-export/fonts.ts` (new)
- `src/ts/pages/experiments.ts` (modified)
- `public/fonts/Roboto-*.ttf` (new assets)

## Verification
- [x] `npm run typecheck` passes
- [x] `npm test` passes (62/62)
- [x] `npm run build` passes
- [x] Manual test: tạo report PDF từ HT-001, verify Vietnamese diacritics render đúng
- [x] PDF size <500KB cho 1-page report

## Round notes
Refs: Round 157a | Phase C-1 prep | Depends on: none
```

### 3.4 CI runs

Auto trigger trên mỗi push lên PR branch:
- `npm ci`
- `npm run typecheck` (tsc --noEmit)
- `npm test` (vitest run, 219+ tests)
- `npm run build` (Vite production build)

CI **phải xanh** trước khi merge. Branch protection block merge nếu đỏ.

### 3.5 Merge

Khi CI xanh + (optional) review approve:

1. GitHub UI → dropdown merge button
2. Chọn **Create a merge commit** (default cho project này — giữ history chi tiết)
3. Merge commit message format:
   ```
   Merge pull request #N from emnam009009/phase-c1/R157a-pdf-export

   feat(R157a): PDF export for experiment reports
   ```

### 3.6 Cleanup

```bash
git checkout main
git pull origin main
git branch -d phase-c1/R157a-pdf-export
git push origin --delete phase-c1/R157a-pdf-export
```

GitHub có option "Automatically delete head branches" — bật trong Settings để skip step manual.

### 3.7 Hotfix flow (production breaks)

```bash
# Tạo từ main, không từ feature branch dở dang
git checkout main
git pull origin main
git checkout -b hotfix/R162-prod-csp-blocker

# Fix nhanh, commit
git commit -m "fix(R162): unblock cdn.jsdelivr.net in CSP for production"
git push -u origin hotfix/R162-prod-csp-blocker

# Tạo PR → CI pass → merge ngay (không đợi feature work khác)
# Sau merge: deploy production immediately
```

---

## 4. Conventional Commits

### 4.1 Format

```
<type>(<scope>): <description>

[optional body — chi tiết tại sao thay đổi]

[optional footer — BREAKING CHANGE / Closes #xxx / Refs: Round XXX]
```

### 4.2 Types

| Type | Khi nào | Version bump |
|---|---|---|
| `feat` | Tính năng mới | minor |
| `fix` | Sửa bug | patch |
| `docs` | Docs only | none |
| `style` | Format, semicolons (no logic change) | none |
| `refactor` | Đổi cấu trúc, không đổi behavior | patch |
| `perf` | Optimize performance | patch |
| `test` | Thêm/sửa test | none |
| `chore` | Build, deps, config | none |
| `ci` | CI/CD config | none |

### 4.3 Scope

Scope là **Round number** (chuẩn LabBook) hoặc area code:

```
feat(R157a): ...           ← preferred — round number
fix(R162-fix2): ...        ← sub-round suffix
feat(booking): ...         ← area code (legacy, vẫn OK)
chore(deps): ...           ← chore scope
```

### 4.4 Examples

✅ Good:
```
feat(R157a): scaffold PDF export module with Vietnamese fonts
fix(R156g-fix2): add natural + stopwords-iso to root deps for test runtime
docs(R163): update ARCHITECTURE.md to reflect TypeScript migration
chore(R164): bump firebase-tools to 14.0.0
perf(R165): lazy-load chart.js to reduce initial bundle by 200KB
```

❌ Bad:
```
update code
WIP
fix bug
asdf
feat: stuff (missing scope)
```

### 4.5 Breaking changes

```
feat(R200)!: migrate Firestore schema from flat to nested per-tenant

BREAKING CHANGE: All Firestore reads/writes need tenantId field.
Migration script in scripts/migrate-tenantid-r200.mjs required before deploy.
```

### 4.6 Enforcement

`commitlint.config.js` đã setup. Husky pre-commit hook block bad commit messages local. CI cũng check.

---

## 5. CI/CD

### 5.1 Pipeline

```
PR opened/pushed
   ↓
   .github/workflows/ci.yml runs:
     1. Checkout code
     2. Setup Node.js 20
     3. Cache npm dependencies
     4. npm ci (root + functions/)
     5. npm run typecheck (root)
     6. npm test (root vitest)
     7. npm run build (Vite production)
   ↓
   Status check posted to PR (pass/fail)
   ↓
   Merge blocked nếu fail
```

Chi tiết workflow: xem `.github/workflows/ci.yml`.

### 5.2 Deploy strategy (hiện tại — single env)

```
Merge to main
   ↓
   Manual deploy from local:
     git checkout main && git pull
     npm run build
     firebase deploy --only hosting[,functions,database]
```

### 5.3 Deploy strategy (tương lai — multi-env)

Setup khi commercial launch. Plan trong `docs/multi-environment-plan.md`. Tóm tắt:

```
Merge to main
   ↓
   GitHub Action auto deploy to staging
   ↓
   Smoke tests trên staging
   ↓
   Manual approve → tag v1.X.Y → auto deploy to production
```

---

## 6. Round numbering — kept

Round numbering vẫn dùng (đã có 156g rounds, không reset):

- 1 round = 1 PR = 1 feature branch
- Sub-rounds (a/b/c/fix1/fix2) cho iteration trong cùng round
- Round number tracking trong CHANGELOG.md (rule cũ giữ nguyên)
- Phase grouping trong branch name: `phase-c1/R157a-...`

Khác v2.0:
- Round không còn là "1 patch script" — là "1 feature branch + 1 PR"
- Không tạo `apply.py` nữa, code/commit/push trực tiếp

---

## 7. Backup & Recovery

### 7.1 Git history = primary backup

Không cần `.bakXXX` files nữa. Git history là source of truth:

```bash
# Revert 1 commit
git revert <commit-hash>

# Revert toàn bộ merge
git revert -m 1 <merge-commit-hash>

# Reset branch về state cũ (destructive — chỉ làm trên feature branch của mình)
git reset --hard <commit-hash>

# Recover deleted branch
git reflog
git checkout -b recovered-branch <commit-hash>
```

### 7.2 `*.bakXXX` files → retired

`*.bak*` pattern vẫn ở `.gitignore` (legacy files cũ). Không tạo mới.

### 7.3 Master docs in `/mnt/d/`

Vẫn giữ (insurance nếu repo bị wipe):
- `/mnt/d/WORKFLOW.md` (file này)
- `/mnt/d/AI_ARCHITECTURE.md`
- `/mnt/d/DESIGN.md`

Update workflow: cập nhật repo trước, copy ra `/mnt/d/` sau commit.

### 7.4 Code state snapshot (mốc lớn)

```bash
cd ~/LAB-MANAGER/labbook-vite-tailwind/
tar czf labbook-snapshot-$(date +%Y%m%d).tar.gz labbook/
mv labbook-snapshot-*.tar.gz /mnt/d/labbook-snapshots/
```

Khi nào: cuối mỗi Phase (B.5 done, C-1 done, ...).

---

## 8. AI assistant rules

AI assistants (Claude, Cursor, Copilot) phải tuân:

### 8.1 Trước khi code

1. **Đọc `docs/onboarding.md`** đầu tiên (entry point)
2. **Đọc raw file content** trước khi assume structure
3. **Grep tìm boundary** confirm tồn tại
4. **Check ràng buộc**: CSP strict, no `:has()`, no inline events, no `localStorage` trong artifacts

### 8.2 Khi code

5. **Branch từ main mới nhất**: `git checkout main && git pull && git checkout -b phase-X/RXXX-slug`
6. **TypeScript strict partial**: tất cả file mới `.ts`, không bật `strict: true` toàn cục
7. **Reuse existing services**: KHÔNG tạo lại logic trong `src/ts/services/{parsers,plot}/`
8. **Commit thường xuyên**: 1 commit = 1 logical change, Conventional Commits

### 8.3 Trước khi push

9. **Verify local**: `npm run typecheck && npm test && npm run build` phải pass
10. **PR description đầy đủ**: theo template Section 3.3

### 8.4 Trong PR

11. **Update docs** nếu cần (ARCHITECTURE/ROADMAP/CHANGELOG)
12. **Đợi CI xanh** trước khi merge
13. **Cleanup branch** sau merge

### 8.5 Communication

- **Tiếng Việt** với nAM
- **English** cho code, comments, commit messages
- **Block lệnh** phân biệt rõ WSL bash vs Windows cmd
- **Concise**, không ramble, không trade-off analysis dài (xem memory preference)

---

## 9. Phase to Branch prefix mapping

Reference từ ROADMAP.md (tổng 220+ rounds):

| Phase | Rounds | Branch prefix |
|---|---|---|
| Phase A — Foundation | R105-R115 + R129 | `phase-a/RXXX-...` (DONE, retroactive naming) |
| Pre-Commercial Audit | R116-R126 | `phase-audit/RXXX-...` (DONE) |
| Phase B — RAG Infrastructure | R130-R142 | `phase-b/RXXX-...` (DONE) |
| Phase B.5 — Research Schema | R143-R156g | `phase-b5/RXXX-...` (DONE) |
| **Phase C-1 — Optical/Structural** | **R157-R171** | **`phase-c1/RXXX-...`** ⭐ NEXT |
| Phase C-2 — Electrochem | R172-R186 | `phase-c2/RXXX-...` |
| Phase C-3 — Photoelectrochem | R187-R201 | `phase-c3/RXXX-...` |
| Phase D — Materials DB | R202-R216 | `phase-d/RXXX-...` |
| Phase E — Advanced | R217+ | `phase-e/RXXX-...` |
| Commercial track | parallel | `commercial/RXXX-...` |
| Hotfix | any | `hotfix/RXXX-...` |
| Standalone fix/chore/docs | any | `fix/`, `chore/`, `docs/` (no phase) |

**Note**: Round numbers shift khi unplanned work xen vào (như R116-R126 audit đẩy Phase B + C). Reference CHANGELOG.md cho mapping thực tế.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Round** | Đơn vị thay đổi code, có số thứ tự, = 1 branch + 1 PR |
| **Sub-round** | Iteration trong round (vd R156g-fix1, R157a-v2) |
| **Phase** | Nhóm rounds có chung mục tiêu lớn (A→E + audit + commercial) |
| **GitHub Flow** | Branch model: short-lived feature branches → PR → main |
| **Branch protection** | GitHub rule chặn direct push, force push, bad merges |
| **Status check** | CI job report pass/fail trên PR, block merge nếu fail |
| **Conventional Commits** | Commit format `type(scope): description` chuẩn hoá |
| **commitlint** | Tool lint commit messages theo Conventional Commits |
| **Husky** | Git hooks runner — pre-commit lint, pre-push verify |
| **Tier** | AI agent classification (1=Lab Mgr, 2=Analyst, 3=Research) |
| **RAG** | Retrieval-Augmented Generation cho AI |

---

## 11. Migration from v2.0

Việc cần làm 1 lần khi áp dụng v3.0:

- [x] Merge PR Phase B.5 (cuối cùng dùng workflow v2)
- [ ] Delete branch `ai-assistant` (sau merge thành công)
- [ ] Setup branch protection rule cho `main` (GitHub Settings → Branches)
- [ ] Enable "Automatically delete head branches" (Settings → General → Pull Requests)
- [ ] Add `.github/workflows/ci.yml` (file đã cung cấp)
- [ ] Update `CLAUDE.md` pointer to `docs/onboarding.md`
- [ ] Add `docs/onboarding.md` (file đã cung cấp)
- [ ] Move old `WORKFLOW.md` → `docs/workflow-v2-archived.md` (reference)
- [ ] Commit + push tất cả changes như 1 round riêng: `docs/R157-workflow-v3-migration`

---

## 12. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-11 | GitHub Flow over GitFlow | Đơn giản, deploy-friendly, scale tốt cho SaaS |
| 2026-05-11 | Branch prefix `phase-XX/RXXX-slug` | Group theo phase, dễ filter `git branch -l 'phase-c1/*'` |
| 2026-05-11 | Merge commit default | Giữ commit history chi tiết (preference của nAM) |
| 2026-05-11 | 0 reviewer required | Solo dev, CI check là đủ. Tăng lên 1 khi có team |
| 2026-05-11 | Retire patch scripts | Git diff workflow đơn giản hơn, CI/CD automate được |
| 2026-05-11 | Defer multi-env Firebase | Lab nội bộ chưa cần. Code prep từ R157a (env-based config) |
| 2026-05-11 | Round numbering kept | Backward compat với CHANGELOG, vẫn track tiến độ phase |
| 2026-05-11 | Husky + commitlint enforced | Catch bad commits sớm, CI là safety net cuối |

---

*Tài liệu này là hợp đồng làm việc giữa nAM và mọi contributor (human + AI). Cập nhật qua PR riêng (`docs/RXXX-update-workflow`).*
