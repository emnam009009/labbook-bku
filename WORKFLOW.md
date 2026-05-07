# Workflow — AI-Assisted Patch-Based Development

**Version**: 2.0
**Last updated**: 2026-05-07
**Audience**: nAM (developer) + AI assistants (Claude, future agents)
**Status**: Active

> **Major changes from v1.0**:
> - Added TypeScript strict partial rule (Section 6.5)
> - Added Hybrid TS + Python service rules (Section 7)
> - Clarified `/mnt/d/` master copy strategy (Section 2.3)
> - Updated patch script template với TypeScript stub pattern (Section 5)

> Tài liệu này mô tả **quy trình làm việc thực tế** giữa nAM và AI assistant cho dự án LabBook BKU. Đây là quy trình đã được kiểm chứng qua 100+ rounds patch và cần được duy trì cho các round tiếp theo.

---

## 1. Tổng quan / Overview

Dự án phát triển theo mô hình **"Round-based patches"**:

- Mỗi thay đổi được đóng gói thành **một Round có số thứ tự** (vd: Round 105)
- AI assistant tạo **Python patch script** chứa toàn bộ logic apply patch
- nAM tải script về máy local (`/mnt/d/labbook-patches/`), chạy thử, deploy
- Nếu OK → commit lên git theo Conventional Commits

Lý do dùng patch script thay vì copy-paste code trực tiếp:
1. **Reproducible**: chạy lại được nếu cần
2. **Reversible**: tự động backup file trước khi sửa
3. **Auditable**: script là document hóa thay đổi
4. **Atomic**: applies all-or-nothing
5. **AI-friendly**: AI đọc lại patch script để hiểu thay đổi đã làm

---

## 2. Hệ thống thư mục / Directory Layout

### 2.1 Trên máy local (WSL Ubuntu)

```
~/LAB-MANAGER/labbook-vite-tailwind/labbook/    ← repo working directory
├── src/
│   ├── ts/                                     ← TypeScript code (100% migrated)
│   │   ├── ai/                                 ← AI module (Round 105+)
│   │   ├── services/                           ← existing services
│   │   ├── pages/, ui/, utils/, types/
│   │   └── main.ts, firebase.ts, etc.
│   └── css/
├── functions/                                  ← Cloud Functions (Round 106+)
├── python-service/                             ← FastAPI (Round 107+)
├── docs/{ai,design}/                           ← Detail docs
├── tests/
├── index.html
├── package.json
├── tsconfig.json                               ← TypeScript strict partial
├── firebase.json
├── vite.config.js
├── WORKFLOW.md, AI_ARCHITECTURE.md, DESIGN.md  ← Master docs
└── (file backup *.bakXXX được tạo bởi patch script)
```

### 2.2 Patch storage (`/mnt/d/labbook-patches/`)

```
/mnt/d/labbook-patches/                  ← patch scripts master folder
├── round-105-foundation/
│   ├── apply.py                         ← main patch script
│   ├── README.md                        ← round notes
│   └── files/                           ← raw files to be created (if any)
├── round-106-blaze-setup/
│   ├── apply.py
│   └── README.md
├── round-107-python-service/
│   ├── apply.py
│   └── README.md
└── ...
```

### 2.3 Master docs storage (`/mnt/d/`)

```
/mnt/d/
├── WORKFLOW.md                    ← master copy (lưu trữ)
├── AI_ARCHITECTURE.md             ← master copy
├── DESIGN.md                      ← master copy
└── labbook-patches/               ← tất cả round patches
```

**Update workflow cho master docs**:
1. Claude gửi file mới → nAM tải về máy
2. Ghi đè file ở `/mnt/d/<file>.md`
3. Copy vào repo: `cp /mnt/d/<file>.md ~/LAB-MANAGER/labbook-vite-tailwind/labbook/`
4. `git diff` → review → commit `docs: update <file>.md to vX.Y`

`/mnt/d/` là **source of truth thứ 2** nếu repo bị reset.

### 2.4 Truy cập từ WSL

```bash
# Từ WSL Ubuntu, /mnt/d trỏ đến D: drive Windows
ls /mnt/d/labbook-patches/

# Workflow điển hình:
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook/
python3 /mnt/d/labbook-patches/round-XXX-name/apply.py
```

---

## 3. Quy trình một Round / Round Workflow

### 3.1 Phía AI assistant

Khi user yêu cầu một Round mới, AI assistant cần:

1. **Đọc state hiện tại** trước khi viết patch:
   - Verify file paths, structure HTML/TS
   - Grep tìm string boundary cần thay thế
   - Confirm CSS class, function signature đang dùng
   - **KHÔNG BAO GIỜ assume** structure — luôn đọc raw file content trước

2. **Viết Python patch script** với các đặc điểm bắt buộc:
   - Backup file trước khi sửa: `index.html.bakXXX`
   - Verify boundary string TỒN TẠI trước khi replace
   - Assert critical IDs/classes hiện diện sau khi sửa
   - Idempotent khi có thể (chạy lại không break)
   - In log rõ ràng từng bước
   - Exit code != 0 nếu có lỗi

3. **Đặt output đúng vị trí**:
   - Path chuẩn: `/mnt/user-data/outputs/labbook-patches/round-XXX-name/`
   - Bao gồm: `apply.py`, `README.md`, `files/` (nếu cần)

4. **Tuân thủ ràng buộc kỹ thuật**:
   - CSS `:has()` selector **KHÔNG dùng** (đã verified broken)
   - Inline event handlers (`onclick=...`) **KHÔNG dùng** (CSP strict, dùng global delegation `data-action`)
   - **TypeScript strict partial preserved** — không bật `strict: true` trong AI rounds (xem Section 6.5)
   - File CSS phải tham chiếu CSS variables từ `:root`, không hardcode color
   - **Không tạo lại logic đã có** — reuse `src/ts/services/parsers/` + `src/ts/services/plot/` (xem Section 8)

### 3.2 Phía nAM (developer)

1. **Tải patch về máy**:
   - Download các file output từ Claude → `D:\Downloads\` (hoặc tương đương)
   - Move sang `D:\labbook-patches\round-XXX-name\`

2. **Đọc README** của round trước khi chạy

3. **Chạy patch script**:
   ```bash
   cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook/
   python3 /mnt/d/labbook-patches/round-XXX-name/apply.py
   ```

4. **Verify changes**:
   ```bash
   git diff
   npm run typecheck   # ← MỚI: bắt buộc cho mọi AI round
   npm run dev
   # Hard reload browser (Ctrl+Shift+R)
   ```

5. **Build & test production**:
   ```bash
   npm run build
   npm run preview
   ```

6. **Deploy** (nếu có code thay đổi runtime):
   ```bash
   npm run build && firebase deploy --only hosting
   ```

7. **Commit lên git**:
   ```bash
   git add -A
   git commit -m "<type>(<scope>): <description>

   <body>

   Refs: Round XXX"
   git push origin <branch-name>
   ```

### 3.3 Khi gặp lỗi

1. **Đừng panic** — patch đã backup
2. **Restore từ backup**: `cp index.html.bakXXX index.html`
3. **Báo lại Claude** với:
   - Output log của patch (toàn bộ)
   - State của file (`head -50` hoặc snippet relevant)
   - Round nào, dòng nào fail

Claude sẽ debug và đưa ra patch sửa lỗi (Round XXXa hoặc XXX_v2).

---

## 4. Quy ước đặt tên / Naming Conventions

### 4.1 Round naming

```
round-<3-digit-number>-<short-name>/
```

Ví dụ:
- `round-105-foundation/`
- `round-106-blaze-setup/`
- `round-107-python-service/`
- `round-108a-fix-streaming/`   ← hotfix cho 108
- `round-108b-revert-streaming/` ← revert nếu cần

### 4.2 Backup file naming

```
<original-filename>.bak<round-number>
```

Mỗi round bump số bak. Pattern `*.bak[0-9]*` đã được gitignore từ Round 105.

### 4.3 Round README

Mỗi round có `README.md` với cấu trúc:

```markdown
# Round XXX — <name>

**Date**: YYYY-MM-DD
**Type**: feat | fix | refactor | docs | chore
**Phase**: A | B | C-1 | C-2 | C-3 | D | E
**Depends on**: Round YYY (nếu có)
**Estimated time**: ~N minutes
**Risk level**: 🟢 Low | 🟡 Medium | 🔴 High

## What changes
## Why
## Pre-conditions
## How to apply
## Verification
## Idempotency
## Rollback
## Commit message
## What's next
```

---

## 5. Patch Script Template

### 5.1 Generic Template

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

ROUND_NUMBER = "XXX"
ROUND_NAME = "name"
BACKUP_SUFFIX = f".bak{ROUND_NUMBER}"

# (utilities — log, err, ok, warn, backup_file, read_file, write_file, etc.)

def main():
    log(f"=== Round {ROUND_NUMBER} — {ROUND_NAME} ===")
    assert_in_repo()

    # Step 1: Backup
    for f in FILES_TO_MODIFY:
        backup_file(f)

    # Step 2: Apply patches
    # ...

    # Step N: Verify
    # assert_after(...)

    log("✓ Round XXX applied successfully")

if __name__ == "__main__":
    main()
```

### 5.2 TypeScript Stub Pattern

Khi tạo file `.ts` skeleton (Round 105+), dùng pattern:

```python
def make_ts_stub(file_path, description, references=None, todo=None):
    refs = ""
    if references:
        refs = "\n * @see " + "\n * @see ".join(references)

    todo_block = ""
    if todo:
        todo_block = f"\n\n// TODO Round {todo['round']}: {todo['task']}"

    return f"""/**
 * {description}
 *
 * Round {ROUND_NUMBER} — Foundation skeleton.
 * Implementation will be added in subsequent rounds.{refs}
 */{todo_block}

export {{}};
"""
```

Output:
```typescript
/**
 * UV-Vis analyzer: Tauc plot, Kubelka-Munk, Urbach energy
 *
 * Round 105 — Foundation skeleton.
 * Implementation will be added in subsequent rounds.
 * @see src/ts/services/plot/tauc.ts (REUSE)
 * @see src/ts/services/plot/bandgap-fit.ts (REUSE)
 */

// TODO Round 137-138: wrap existing tauc.ts + add advanced analyses

export {};
```

→ Valid TypeScript strict partial, có JSDoc + reference + TODO clear.

---

## 6. Quy ước AI assistant phải tuân theo

Đây là **non-negotiable rules** mà bất kỳ AI assistant nào (Claude, GPT, Gemini, ...) làm việc với dự án này phải tuân:

### 6.1 Trước khi viết patch
1. **Đọc raw file content trước khi assume structure** — tuyệt đối không đoán HTML/TS structure
2. **Grep tìm boundary string** — confirm tồn tại và unique
3. **Verify CSS classes/IDs đang dùng** — không tạo class mới trùng tên
4. **Check ràng buộc**: CSP strict, no `:has()`, no inline events

### 6.2 Trong patch script
5. **Luôn backup trước khi sửa** — `*.bakXXX` pattern
6. **Verify boundary tồn tại** trước replace
7. **Assert post-conditions** sau replace
8. **Idempotent** khi có thể
9. **Log rõ ràng** từng bước
10. **Exit code != 0** khi lỗi

### 6.3 Trong tài liệu
11. **README per round** — what/why/verify/rollback
12. **Update ROADMAP.md** với round mới
13. **Update CHANGELOG.md** sau khi round merged

### 6.4 Communication
14. **Tiếng Việt** cho discussion với nAM
15. **English** cho code, comments code-level, conventional commits scope
16. **Cite sources** khi đề xuất kỹ thuật mới (link doc, paper, repo)
17. **Hỏi clarification** thay vì assume — đặc biệt với architectural decisions

### 6.5 TypeScript Rules ⭐ NEW

Repo đã migrate 100% sang TypeScript với **strict partial mode**. AI assistant phải:

18. **Tất cả file mới**: `.ts` extension, không bao giờ `.js`
19. **KHÔNG bật `strict: true`** trong AI rounds — sẽ tạo 100+ lỗi cần fix
20. **Tôn trọng** existing tsconfig:
    - `noImplicitAny: true`
    - `strictNullChecks: true`
    - `noUnusedLocals: true`
    - `noUnusedParameters: true`
21. **Stub files** phải là valid TypeScript: ít nhất `export {};`
22. **Type definitions** đặt trong `src/ts/ai/types/` (cho AI module)
23. **Reuse types** từ `src/ts/types/global.d.ts` nếu có
24. **Sau mỗi patch** verify: `npm run typecheck` phải pass (exit 0)
25. **Bùng strict mode** sẽ có round riêng dedicated cho việc này (Phase E)

### 6.6 Reuse Rules ⭐ NEW

26. **KHÔNG tạo lại** logic đã có trong `src/ts/services/parsers/`:
    - `corrware.ts` — CV/LSV
    - `jcamp-jasco.ts` — UV-Vis/FTIR
    - `detect.ts` — file type detection
    - `parser-core.ts` — shared utilities
27. **KHÔNG tạo lại** logic đã có trong `src/ts/services/plot/`:
    - `tauc.ts` — Eg calculation
    - `bandgap-fit.ts` — linear regression
28. **Wrap qua** `src/ts/ai/tools/spectrum-tools.ts` thay vì duplicate
29. **Single source of truth** cho khoa học — Eg từ AI và UI luôn nhất quán

---

## 7. Hybrid TS + Python Workflow ⭐ NEW

### 7.1 Phân chia công việc

| Task | Service | Round |
|---|---|---|
| UI orchestration | TypeScript (browser) | Phase A |
| LLM proxy + auth | TypeScript Cloud Functions | Round 106 |
| Quick parser preview | TypeScript (existing services) | Existing |
| Simple Tauc plot | TypeScript (existing services) | Existing |
| pymatgen XRD analysis | **Python (Cloud Run)** | Round 131-133 |
| lmfit Voigt fitting | **Python** | Round 134, 171 |
| impedance.py EIS | **Python** | Round 148-149 |
| ASE DFT input | **Python** | Round 181-186 |
| MatSciBERT embedding | **Python** | Round 128 |

### 7.2 Round triggers Python service development

Round 107 setup Python service skeleton. Sau đó mỗi round implement endpoint mới:

```python
# python-service/main.py (Round 107)
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

# Round 131 thêm:
@app.post("/xrd/analyze")
def analyze_xrd(file: UploadFile, candidates: List[str]):
    # pymatgen logic
    return {"peaks": ..., "matched_phase": ...}
```

### 7.3 TypeScript ↔ Python communication

Pattern chuẩn:

```typescript
// src/ts/ai/python-bridge/client.ts
import { auth } from '@/firebase';

export async function callPython(endpoint: string, payload: any) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/python${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Python service error: ${response.status}`);
  return response.json();
}

// src/ts/ai/analyzers/structural/xrd/index.ts
import { callPython } from '@/ai/python-bridge/client';

export async function analyzeXRD(file: File) {
  const buffer = await file.arrayBuffer();
  return callPython('/xrd/analyze', {
    fileData: arrayBufferToBase64(buffer),
    candidates: ['WO3-monoclinic', 'WO3-orthorhombic']
  });
}
```

Cloud Function đứng giữa làm proxy + auth:

```typescript
// functions/src/python-bridge.ts
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const PYTHON_URL = defineSecret('PYTHON_SERVICE_URL');

export const pythonBridge = onRequest(async (req, res) => {
  // Verify Firebase Auth
  // Forward to Python service with service-to-service auth
  // Return response
});
```

### 7.4 Local development workflow

```bash
# Terminal 1 — frontend
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook
npm run dev

# Terminal 2 — Cloud Functions emulator
cd functions
npm run serve

# Terminal 3 — Python service local
cd python-service
uv sync
uvicorn main:app --reload --port 8000
```

3 services chạy song song → develop end-to-end.

---

## 8. Conventional Commits — Mapping với Round

| Round type | Commit type | Scope examples |
|---|---|---|
| Foundation/setup | `chore` | `setup`, `config`, `deps` |
| AI feature mới | `feat` | `ai`, `chat`, `rag`, `spectrum`, `voice`, `python-service` |
| UI redesign | `refactor` | `ui`, `design`, `tokens` |
| Bug fix | `fix` | matching scope |
| Documentation | `docs` | `architecture`, `roadmap`, `workflow` |
| Performance | `perf` | matching scope |

Ví dụ:
```
Round 105 → chore(setup): foundation for AI module
Round 106 → chore(functions): setup Cloud Functions skeleton
Round 107 → chore(python-service): initial FastAPI + Cloud Run setup
Round 108 → feat(ai-chat): add slide-out chat sidetab
Round 131 → feat(spectrum): XRD analyzer via pymatgen
```

---

## 9. Phase to Round Mapping

| Phase | Rounds | Focus |
|---|---|---|
| Phase A — Foundation | 105-115 | Provider abstraction, chat UI, Tier 1 tools, Web Speech |
| Phase B — RAG Infrastructure | 116-128 | Paper ingestion, embedding, vector search |
| **Phase C-1** — Optical & Structural | 129-145 | XRD/Raman/UV-Vis/PL/FTIR/SEM/TEM |
| **Phase C-2** — Electrochemistry | 146-160 | CV/LSV/EIS/GCD/OCP + Agentic + Memory |
| **Phase C-3** — Photoelectrochemistry | 161-175 | PEC/Mott-Schottky/IPCE/XPS/EDS/BET |
| Phase D — Materials DB + Structure | 176-190 | DFT, Materials Database, AI Writer |
| Phase E — Advanced Features | 191-220+ | Lab Mode, Knowledge Graph, Spectrum Compare, UI redesign |

---

## 10. Git branch strategy cho AI module

- `main` — stable, deployable
- **`ai-assistant`** — branch chính cho toàn bộ AI module phát triển ⭐ active
- Sub-branches từ `ai-assistant` cho từng phase nếu cần:
  - `ai-assistant/phase-a-foundation`
  - `ai-assistant/phase-c1-optical`
  - ...

Khi 1 phase hoàn tất + tested → merge vào `ai-assistant` → khi ổn → merge `ai-assistant` vào `main`.

---

## 11. Backup & Recovery Strategy

### 11.1 Layer 1 — Per-round backup (`*.bakXXX`)
- Mỗi round patch script tạo backup
- Pattern `*.bak[0-9]*` đã gitignore từ Round 105
- Cleanup sau khi merge phase

### 11.2 Layer 2 — Git history
- Commit thường xuyên (mỗi round)
- Push lên GitHub sau mỗi 2-3 round
- Tag mốc quan trọng: `v0.5-phase-a-complete`, etc.

### 11.3 Layer 3 — Patch archive
- `/mnt/d/labbook-patches/` giữ TẤT CẢ patch scripts vĩnh viễn
- Source of truth thứ 2 nếu cần redo

### 11.4 Layer 4 — Master docs archive
- `/mnt/d/{WORKFLOW,AI_ARCHITECTURE,DESIGN}.md` master copies
- Update qua workflow Section 2.3

### 11.5 Layer 5 — Code state snapshot

Mỗi mốc lớn:
```bash
cd ~/LAB-MANAGER/labbook-vite-tailwind/
tar czf labbook-snapshot-$(date +%Y%m%d).tar.gz labbook/
mv labbook-snapshot-*.tar.gz /mnt/d/labbook-snapshots/
```

---

## 12. Future AI Sessions — Onboarding

Khi nAM bắt đầu session mới với AI assistant, AI cần đọc theo thứ tự:

1. **`CLAUDE.md`** — entry point
2. **`README.md`** — tech stack, setup
3. **`ARCHITECTURE.md`** — kiến trúc tổng (cũ, đã có)
4. **`AI_ARCHITECTURE.md`** — kiến trúc AI module ⭐
5. **`DESIGN.md`** — UI design system ⭐
6. **`WORKFLOW.md`** — file này, quy trình ⭐
7. **`CONTRIBUTING.md`** — git workflow
8. **`ROADMAP.md`** — kế hoạch
9. **`CHANGELOG.md`** — round đã làm
10. **`docs/ai/*`** — chi tiết AI module
11. **`docs/design/*`** — chi tiết design
12. **`.claude/memory/global.md`** + **`.claude/memory/patterns.md`** + **`.claude/memory/mistakes.md`**

Sau đó AI **MỚI** đề xuất round tiếp theo. **Không nhảy vào code ngay** khi chưa đọc context.

---

## 13. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-XX-XX | Bắt đầu round-based patches | Nhịp ổn định, reproducible |
| 2026-XX-XX | Patches lưu tại `/mnt/d/labbook-patches` | Backup ngoài repo |
| 2026-XX-XX | Backup file `*.bakXXX` pattern | Mỗi round 1 backup, dễ recover |
| 2026-04-XX | CSP strict (Round 55-58e) | Security score 125/100 |
| 2026-04-XX | CSS `:has()` cấm dùng | Verified broken trên Edge |
| 2026-XX-XX | TypeScript migration hoàn tất | 89 files .ts, 0 .js trong src/ |
| 2026-05-07 | Tạo branch `ai-assistant` | AI module 220+ rounds |
| 2026-05-07 | Workflow.md formalized | Future AI sessions onboard |
| 2026-05-07 | **TypeScript strict partial preserved** | Tránh bùng strict gây 100+ errors |
| 2026-05-07 | **Hybrid TS + Python (Cloud Run)** | Materials informatics needs Python ecosystem |
| 2026-05-07 | **Reuse parsers/ + plot/ existing** | Single source of truth cho khoa học |
| 2026-05-07 | **`/mnt/d/` master docs strategy** | Persist nếu repo bị reset |

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Round** | Một đơn vị thay đổi code, có số thứ tự, được apply qua Python script |
| **Patch script** | File `apply.py` thực hiện thay đổi code an toàn |
| **Boundary string** | Đoạn text duy nhất trong file dùng làm anchor để replace |
| **Backup suffix** | Pattern `.bakXXX` thêm vào file gốc trước khi sửa |
| **Idempotent** | Script chạy nhiều lần cho kết quả như chạy 1 lần |
| **CSP strict** | Content-Security-Policy chặt, không cho inline events/scripts |
| **Global delegation** | Pattern: 1 event listener trên `document.body`, dispatch theo `data-action` |
| **Phase** | Nhóm các Round có chung mục tiêu lớn (A→E) |
| **Tier** | Phân cấp AI agent (1=quản lý, 2=phân tích, 3=research) |
| **RAG** | Retrieval-Augmented Generation — truy xuất tài liệu thay vì train |
| **Provenance chain** | Audit log đầy đủ của mỗi câu trả lời AI |
| **TypeScript strict partial** | tsconfig với một số strict checks, không phải full strict mode |
| **Hybrid architecture** | TypeScript (UI/orchestration) + Python (materials informatics) |
| **Reuse strategy** | AI module wraps existing services, không tạo lại |
| **Cold start** | Cloud Run khởi động instance mới sau idle (~2-5s) |
| **MCP** | Model Context Protocol — Anthropic tool-calling standard |
| **Materials informatics** | pymatgen, ASE, MatSciBERT, lmfit, impedance.py ecosystem |

---

*Tài liệu này là hợp đồng làm việc giữa nAM và AI assistants. Cập nhật khi quy trình thay đổi.*
