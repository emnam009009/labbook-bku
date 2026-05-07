# Workflow — AI-Assisted Patch-Based Development

**Version**: 1.0
**Last updated**: 2026-05-07
**Audience**: nAM (developer) + AI assistants (Claude, future agents)
**Status**: Active

> Tài liệu này mô tả **quy trình làm việc thực tế** giữa nAM và AI assistant cho dự án LabBook BKU. Đây là quy trình đã được kiểm chứng qua 100+ rounds patch và cần được duy trì cho các round tiếp theo.
>
> *This document describes the actual working process between nAM and AI assistants for LabBook BKU. The workflow has been validated through 100+ patch rounds and must be maintained for subsequent rounds.*

---

## 1. Tổng quan / Overview

Dự án phát triển theo mô hình **"Round-based patches"**:

- Mỗi thay đổi (feature, fix, refactor) được đóng gói thành **một Round có số thứ tự** (vd: Round 105)
- AI assistant tạo **Python patch script** chứa toàn bộ logic apply patch
- nAM tải script về máy local (`/mnt/d/labbook-patches/`), chạy thử, deploy
- Nếu OK → commit lên git theo Conventional Commits

Lý do dùng patch script thay vì copy-paste code trực tiếp:
1. **Reproducible**: chạy lại được nếu cần
2. **Reversible**: tự động backup file trước khi sửa
3. **Auditable**: script là document hóa thay đổi
4. **Atomic**: applies all-or-nothing, không để codebase ở state nửa vời
5. **AI-friendly**: AI đọc lại patch script để hiểu thay đổi đã làm

---

## 2. Hệ thống thư mục / Directory Layout

### 2.1 Trên máy local (WSL Ubuntu)

```
~/LAB-MANAGER/labbook-vite-tailwind/labbook/    ← repo working directory
├── src/
├── index.html
├── package.json
├── ...
└── (file backup _bak33, _bak34, ... được tạo bởi patch script)
```

### 2.2 Patch storage (Windows D drive, accessible từ WSL qua /mnt/d)

```
/mnt/d/labbook-patches/                  ← patch scripts master folder
├── round-105-foundation/
│   ├── apply.py                         ← main patch script
│   ├── README.md                        ← round notes
│   └── files/                           ← raw files to be created (if any)
├── round-106-blaze-setup/
│   ├── apply.py
│   └── README.md
├── round-107-chat-shell/
│   ├── apply.py
│   ├── README.md
│   └── assets/                          ← images, fonts if needed
└── ...
```

### 2.3 Truy cập từ WSL

```bash
# Từ WSL Ubuntu, /mnt/d trỏ đến D: drive Windows
ls /mnt/d/labbook-patches/

# Workflow điển hình:
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook/
python3 /mnt/d/labbook-patches/round-105-foundation/apply.py
```

---

## 3. Quy trình một Round / Round Workflow

### 3.1 Phía AI assistant

Khi user yêu cầu một Round mới, AI assistant cần:

1. **Đọc state hiện tại** trước khi viết patch:
   - Verify file paths, structure HTML/JS
   - Grep tìm string boundary cần thay thế
   - Confirm CSS class, function signature đang dùng
   - **KHÔNG BAO GIỜ assume** structure — luôn đọc raw file content trước

2. **Viết Python patch script** với các đặc điểm bắt buộc:
   - Backup file trước khi sửa: `index.html.bak33` → `index.html.bak34`
   - Verify boundary string TỒN TẠI trước khi replace
   - Assert critical IDs/classes hiện diện sau khi sửa
   - Idempotent khi có thể (chạy lại không break)
   - In log rõ ràng từng bước
   - Exit code != 0 nếu có lỗi

3. **Đặt output đúng vị trí**:
   - Path chuẩn: `/mnt/user-data/outputs/labbook-patches/round-XXX-name/`
   - Bao gồm: `apply.py`, `README.md`, `files/` (nếu cần)
   - User sẽ tải về và copy sang `/mnt/d/labbook-patches/`

4. **Tuân thủ ràng buộc kỹ thuật**:
   - CSS `:has()` selector **KHÔNG dùng** (đã verified broken)
   - Inline event handlers (`onclick=...`) **KHÔNG dùng** (CSP strict, dùng global delegation `data-action`)
   - Inline styles **dùng tạm** (sẽ remove ở phase tương lai)
   - File CSS phải tham chiếu CSS variables từ `:root`, không hardcode color

### 3.2 Phía nAM (developer)

1. **Tải patch về máy**:
   - Download các file output từ Claude → `D:\Downloads\` (hoặc tương đương)
   - Move sang `D:\labbook-patches\round-XXX-name\`

2. **Đọc README** của round trước khi chạy:
   - Hiểu thay đổi gì
   - Check pre-conditions (vd: cần round trước đó hoàn thành)
   - Lưu ý risks

3. **Chạy patch script**:
   ```bash
   cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook/
   python3 /mnt/d/labbook-patches/round-XXX-name/apply.py
   ```

4. **Verify changes**:
   - Check git diff
   - Test local: `npm run dev`
   - Hard reload browser (Ctrl+Shift+R)

5. **Build & test production**:
   ```bash
   npm run build
   npm run preview
   ```

6. **Deploy** (nếu OK):
   ```bash
   npm run build && firebase deploy --only hosting
   ```
   - Hard reload browser sau deploy
   - Verify trên production URL

7. **Commit lên git** (theo CONTRIBUTING.md):
   ```bash
   # Add changes (KHÔNG add file backup *.bakN)
   git add -A
   git status   # verify

   # Commit theo Conventional Commits
   git commit -m "feat(scope): description from round README"

   # Push
   git push origin <branch-name>
   ```

8. **Lưu trữ** (optional):
   - Sau khi commit OK, file `*.bakN` có thể giữ tạm hoặc xóa
   - `.gitignore` đã exclude `_backups_*` và pattern `*.bak*`

### 3.3 Khi gặp lỗi

Nếu patch script fail giữa chừng:
1. **Đừng panic** — patch script đã backup file trước khi sửa
2. **Restore từ backup**: `cp index.html.bak33 index.html`
3. **Báo lại Claude** với:
   - Output log của patch (toàn bộ, kèm error message)
   - State của file (`head -50` hoặc snippet relevant)
   - Round nào, dòng nào fail

Claude sẽ debug và đưa ra patch sửa lỗi (Round XXXa hoặc Round XXX_v2).

---

## 4. Quy ước đặt tên / Naming Conventions

### 4.1 Round naming

```
round-<3-digit-number>-<short-name>/
```

Ví dụ:
- `round-105-foundation/`
- `round-106-blaze-setup/`
- `round-107-chat-shell/`
- `round-108a-fix-streaming/`   ← hotfix cho 108
- `round-108b-revert-streaming/` ← revert nếu cần

### 4.2 Backup file naming

```
<original-filename>.bak<round-number>
```

Ví dụ:
- `index.html.bak105`
- `src/css/main.css.bak105`

→ Mỗi round bump số bak. Nếu round có nhiều file đụng vào, tất cả dùng cùng số.

### 4.3 Round README

Mỗi round có `README.md` với cấu trúc:

```markdown
# Round XXX — <name>

**Date**: YYYY-MM-DD
**Type**: feat | fix | refactor | docs | chore
**Phase**: A | B | C | D | E
**Depends on**: Round YYY (nếu có)
**Estimated time**: ~N minutes

## What changes
- File 1: làm gì
- File 2: làm gì

## Why
Motivation, link to design doc.

## Pre-conditions
- [ ] Round YYY applied
- [ ] npm install latest

## How to apply
\`\`\`bash
python3 /mnt/d/labbook-patches/round-XXX-name/apply.py
\`\`\`

## Verification
- [ ] `npm run dev` → no console error
- [ ] Specific UI test: ...
- [ ] Build pass: `npm run build`

## Rollback
\`\`\`bash
cp index.html.bakXXX index.html
# tương tự cho file khác
\`\`\`

## Commit message
\`\`\`
feat(scope): description

Body explaining what and why.

Refs: Round XXX
\`\`\`
```

---

## 5. Patch Script Template

Mọi `apply.py` phải tuân theo template này:

```python
#!/usr/bin/env python3
"""
Round XXX — <name>
Apply patch for LabBook BKU.

Usage:
    cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook/
    python3 /mnt/d/labbook-patches/round-XXX-name/apply.py
"""

import sys
import os
import re
from pathlib import Path
from datetime import datetime

# ============================================================
# CONFIG
# ============================================================
ROUND_NUMBER = "XXX"
ROUND_NAME = "name"
BACKUP_SUFFIX = f".bak{ROUND_NUMBER}"

# Files this round touches
FILES_TO_MODIFY = [
    "index.html",
    "src/js/main.js",
    # ...
]

# ============================================================
# UTILITIES
# ============================================================
def log(msg, level="INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}")

def err(msg):
    log(msg, "ERROR")
    sys.exit(1)

def assert_in_repo():
    """Verify chạy đúng thư mục repo."""
    if not Path("package.json").exists() or not Path("index.html").exists():
        err("Phải chạy script từ thư mục root của repo labbook!")
    if not Path("src/js/main.js").exists():
        err("Không tìm thấy src/js/main.js — không phải repo labbook?")

def backup_file(path):
    """Backup file với suffix bakXXX."""
    p = Path(path)
    if not p.exists():
        err(f"File không tồn tại: {path}")
    bak_path = Path(f"{path}{BACKUP_SUFFIX}")
    if bak_path.exists():
        log(f"Backup đã tồn tại: {bak_path} (bỏ qua)", "WARN")
    else:
        bak_path.write_bytes(p.read_bytes())
        log(f"Backup: {path} → {bak_path}")

def read_file(path):
    return Path(path).read_text(encoding="utf-8")

def write_file(path, content):
    Path(path).write_text(content, encoding="utf-8")

def assert_contains(content, substring, file_label):
    """Verify boundary tồn tại trước khi replace."""
    if substring not in content:
        err(f"BOUNDARY KHÔNG TỒN TẠI trong {file_label}:\n  {repr(substring[:80])}...")

def replace_once(content, old, new, file_label):
    """Replace chính xác 1 lần. Fail nếu không tìm thấy hoặc tìm thấy nhiều."""
    count = content.count(old)
    if count == 0:
        err(f"Không tìm thấy boundary trong {file_label}")
    if count > 1:
        err(f"Boundary xuất hiện {count} lần trong {file_label} — không chắc chắn replace cái nào")
    return content.replace(old, new, 1)

def assert_after(content, expected_id, file_label):
    """Verify ID/class tồn tại sau khi sửa."""
    if expected_id not in content:
        err(f"ASSERT FAILED: {expected_id!r} không có trong {file_label} sau khi patch")
    log(f"  ✓ Verified {expected_id!r} present in {file_label}")

# ============================================================
# MAIN PATCH LOGIC
# ============================================================
def main():
    log(f"=== Round {ROUND_NUMBER} — {ROUND_NAME} ===")
    assert_in_repo()

    # Step 1: Backup
    log("\n--- Step 1: Backup files ---")
    for f in FILES_TO_MODIFY:
        backup_file(f)

    # Step 2: Patch index.html
    log("\n--- Step 2: Patch index.html ---")
    content = read_file("index.html")

    OLD = """<existing-boundary-string>"""
    NEW = """<replacement-string>"""

    assert_contains(content, OLD, "index.html")
    content = replace_once(content, OLD, NEW, "index.html")
    write_file("index.html", content)

    # Verify post-conditions
    new_content = read_file("index.html")
    assert_after(new_content, "id=\"new-element\"", "index.html")

    # Step 3: ... (tiếp tục cho các file khác)

    # Step N: Done
    log("\n=== ✓ Round XXX applied successfully ===")
    log("Next: npm run dev (verify) → npm run build → firebase deploy")

if __name__ == "__main__":
    main()
```

---

## 6. Quy ước AI assistant phải tuân theo

Đây là **non-negotiable rules** mà bất kỳ AI assistant nào (Claude, GPT, Gemini, ...) làm việc với dự án này phải tuân:

### 6.1 Trước khi viết patch
1. **Đọc raw file content trước khi assume structure** — tuyệt đối không đoán HTML/JS structure
2. **Grep tìm boundary string** — confirm tồn tại và unique
3. **Verify CSS classes/IDs đang dùng** — không tạo class mới trùng tên
4. **Check ràng buộc**: CSP strict, no `:has()`, no inline events

### 6.2 Trong patch script
5. **Luôn backup trước khi sửa** — `*.bakXXX` pattern
6. **Verify boundary tồn tại** trước replace
7. **Assert post-conditions** sau replace
8. **Idempotent** khi có thể — script chạy lại không break
9. **Log rõ ràng** từng bước
10. **Exit code != 0** khi lỗi

### 6.3 Trong tài liệu
11. **README per round** — what/why/verify/rollback
12. **Update ROADMAP.md** với round mới
13. **Update CHANGELOG.md** sau khi round merged
14. **Update .claude/memory/** nếu có pattern/mistake mới đáng lưu

### 6.4 Communication
15. **Tiếng Việt** cho discussion với nAM
16. **English** cho code, comments code-level, conventional commits scope
17. **Cite sources** khi đề xuất kỹ thuật mới (link doc, paper, repo)
18. **Hỏi clarification** thay vì assume — đặc biệt với architectural decisions

---

## 7. Conventional Commits — Mapping với Round

Mỗi round commit theo format trong `CONTRIBUTING.md`. Mapping gợi ý:

| Round type | Commit type | Scope examples |
|---|---|---|
| Foundation/setup | `chore` | `setup`, `config`, `deps` |
| AI feature mới | `feat` | `ai`, `chat`, `rag`, `spectrum`, `voice` |
| UI redesign | `refactor` | `ui`, `design`, `tokens` |
| Bug fix | `fix` | matching scope |
| Documentation | `docs` | `architecture`, `roadmap`, `workflow` |
| Performance | `perf` | matching scope |

Ví dụ:
```
Round 105 → chore(setup): foundation for AI module
Round 107 → feat(ai-chat): add slide-out chat sidetab
Round 119 → feat(rag): add Voyage-3 embedding pipeline
Round 145 → refactor(ui): migrate to design tokens system
```

---

## 8. Phase to Round Mapping

Theo `AI_ARCHITECTURE.md`, dự án chia thành 5 Phase. Round numbers map như sau:

| Phase | Rounds | Focus |
|---|---|---|
| Phase A — Foundation | 105-115 | Provider abstraction, chat UI, Tier 1 tools |
| Phase B — RAG Infrastructure | 116-128 | Paper ingestion, embedding, vector search |
| Phase C — Tier 2 Spectrum Analyzer | 129-145 | XRD/Raman/UV-Vis/PL/FTIR/LSV parsers |
| Phase D — Agentic + Self-learning | 146-160 | Orchestrator, CRAG, memory, provenance |
| Phase E — Advanced Features | 161+ | Materials DB, DFT, Writer, Lab Mode |

---

## 9. Git branch strategy cho AI module

Theo `CONTRIBUTING.md`:
- `main` — stable, deployable
- **`ai-assistant`** — branch chính cho toàn bộ AI module phát triển
- Sub-branches từ `ai-assistant` cho từng phase nếu cần:
  - `ai-assistant/phase-a-foundation`
  - `ai-assistant/phase-b-rag`
  - ...

Khi 1 phase hoàn tất + tested → merge `ai-assistant/phase-X` vào `ai-assistant` → khi ổn → merge `ai-assistant` vào `main`.

Lý do dùng branch riêng: AI module lớn (~95+ rounds), không nên đụng `main` trong giai đoạn không ổn định.

---

## 10. Backup & Recovery Strategy

### 10.1 Layer 1 — Per-round backup (`*.bakXXX`)

- Mỗi round patch script tạo backup
- Giữ lại ít nhất 5 round backup gần nhất
- Cleanup sau khi merge phase: `rm *.bak1*` (chỉ xóa khi an toàn)

### 10.2 Layer 2 — Git history

- Commit thường xuyên (mỗi round)
- Push lên GitHub sau mỗi 2-3 round
- Tag mốc quan trọng: `v0.5-phase-a-complete`, `v0.7-rag-ready`, etc.

### 10.3 Layer 3 — Patch archive

- `/mnt/d/labbook-patches/` giữ TẤT CẢ patch scripts vĩnh viễn
- Đây là source of truth nếu cần redo

### 10.4 Layer 4 — Code state archive

Mỗi mốc lớn:
```bash
cd ~/LAB-MANAGER/labbook-vite-tailwind/
tar czf labbook-snapshot-$(date +%Y%m%d).tar.gz labbook/
mv labbook-snapshot-*.tar.gz /mnt/d/labbook-snapshots/
```

---

## 11. Future AI Sessions — Onboarding

Khi nAM bắt đầu session mới với AI assistant (Claude hoặc khác), AI assistant cần đọc theo thứ tự:

1. **`CLAUDE.md`** — entry point, tổng quan dự án
2. **`README.md`** — tech stack, setup
3. **`ARCHITECTURE.md`** — kiến trúc tổng (cũ, đã có)
4. **`AI_ARCHITECTURE.md`** — kiến trúc AI module (mới)
5. **`DESIGN.md`** — UI design system (mới)
6. **`WORKFLOW.md`** — file này, quy trình làm việc
7. **`CONTRIBUTING.md`** — git workflow, conventional commits
8. **`ROADMAP.md`** — kế hoạch round
9. **`CHANGELOG.md`** — round đã làm
10. **`.claude/memory/global.md`** + **`.claude/memory/patterns.md`** + **`.claude/memory/mistakes.md`**

Sau đó AI assistant **MỚI** đề xuất round tiếp theo. Không nhảy vào code ngay khi chưa đọc context.

---

## 12. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-XX-XX | Bắt đầu round-based patches | Nhịp ổn định, reproducible |
| 2026-XX-XX | Patches lưu tại `/mnt/d/labbook-patches` | Backup ngoài repo, persist nếu repo bị reset |
| 2026-XX-XX | Backup file `*.bakXXX` pattern | Mỗi round 1 backup, dễ recover |
| 2026-04-XX | CSP strict (Round 55-58e) | Security score 125/100, không dùng inline events |
| 2026-04-XX | CSS `:has()` cấm dùng | Verified broken trên Edge user |
| 2026-05-07 | Tạo branch `ai-assistant` | AI module 95+ rounds, không đụng main |
| 2026-05-07 | Workflow.md formalized | Future AI sessions onboard nhanh |

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **Round** | Một đơn vị thay đổi code, có số thứ tự, được apply qua Python script |
| **Patch script** | File `apply.py` thực hiện thay đổi code an toàn |
| **Boundary string** | Đoạn text duy nhất trong file dùng làm anchor để replace |
| **Backup suffix** | Pattern `.bakXXX` thêm vào file gốc trước khi sửa |
| **Idempotent** | Script chạy nhiều lần cho kết quả như chạy 1 lần |
| **CSP strict** | Content-Security-Policy chặt, không cho inline events/scripts |
| **Global delegation** | Pattern: 1 event listener duy nhất trên `document.body`, dispatch theo `data-action` |
| **Phase** | Nhóm các Round có chung mục tiêu lớn (A→E) |
| **Tier** | Phân cấp AI agent (1=quản lý, 2=phân tích, 3=research) |
| **RAG** | Retrieval-Augmented Generation — truy xuất tài liệu thay vì train |
| **Provenance chain** | Audit log đầy đủ của mỗi câu trả lời AI (steps + sources + claims) |

---

*Tài liệu này là hợp đồng làm việc giữa nAM và AI assistants. Cập nhật khi quy trình thay đổi.*

*This document is the working contract between nAM and AI assistants. Update when the process changes.*
