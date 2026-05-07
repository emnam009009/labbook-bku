# LabBook BKU — AI Architecture

**Version**: 1.0
**Last updated**: 2026-05-07
**Status**: Foundation
**Owner**: nAM (superadmin)

---

## 1. Vision

LabBook BKU AI là một **hệ sinh thái AI Research Platform** chuyên cho lab vật liệu 2D/TMDs (WS₂, WO₃, MoS₂...). Không phải chatbot Q&A, mà là **AI nghiên cứu đồng hành** với khả năng:

1. **Quản trị thông minh** — truy vấn database lab, kiểm soát compliance, điều phối thực nghiệm
2. **Phân tích khoa học chuyên sâu** — đọc phổ XRD/Raman/UV-Vis/PL/FTIR/LSV ở mức nhà nghiên cứu thực thụ
3. **Suy luận và định hướng** — Agentic RAG trên 1000+ paper + lab history, đề xuất thí nghiệm tối ưu
4. **Hỗ trợ viết** — luận văn, paper, đồ án từ dữ liệu lab thực
5. **Voice-first lab workflow** — nhập/đọc bằng giọng nói khi đeo găng

---

## 2. Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Query (Vietnamese)                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  Intent Router (Flash)   │
                  └────────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼──────┐         ┌─────▼──────┐        ┌─────▼──────┐
   │  TIER 1   │         │   TIER 2   │        │   TIER 3   │
   │ Lab Mgr   │         │  Analyst   │        │  Research  │
   │           │         │            │        │   Agent    │
   │ Gemini    │         │ Sonnet 4.6 │        │  Opus 4.7  │
   │ 2.5 Flash │         │            │        │            │
   └───────────┘         └────────────┘        └────────────┘
   RTDB queries          Spectrum analysis     Agentic RAG
   Compliance            Vision + tools        Hypothesis gen
   Inventory             Computational         Multi-hop reason
   Booking               (Tauc, Tafel...)      Paper writing
```

### Tier 1 — Lab Manager (Gemini 2.5 Flash)

**Use cases**: "Còn bao nhiêu L-Cysteine?", "Ai đặt máy XRD tuần sau?", "Hóa chất X có thuộc Phụ lục III Nghị định 24/2026 không?"

**Tools**:
- `query_chemicals(name?, formula?, status?)`
- `query_equipment(name?, status?)`
- `query_bookings(date_range, equipment?, user?)`
- `query_experiments(filters)`
- `query_history(actor?, action?, date_range?)`
- `check_compliance(chemical_name)` → Nghị định 24/2026 + GHS
- `get_member_info(uid)`

**Cost**: ~$0.003/query (Flash). Free tier rộng.

### Tier 2 — Spectrum Analyzer (Claude Sonnet 4.6)

**Use cases**: "Phân tích file XRD này", "Tính Eg từ phổ UV-Vis", "Mẫu nào có HER tốt nhất?"

**Tools**:
- `parse_spectrum(file, type)` — XRD/Raman/UV-Vis/PL/FTIR/LSV
- `detect_peaks(data, threshold)`
- `match_jcpds(peaks, candidate_phases)`
- `compute_scherrer(peak_fwhm, theta)`
- `compute_tauc(uvvis_data, transition_type)`
- `compute_tafel(lsv_data, region)`
- `fit_lorentzian(raman_data)` / `fit_gaussian` / `fit_voigt`
- `identify_functional_groups(ftir_peaks)` — knowledge base C-H, C=O, Mo-S, W-O...
- `analyze_pl_excitons(pl_data, material)` — A⁻/A⁰/B for TMDs
- `compare_samples(sample_ids, technique)`
- `vision_read_spectrum(image)` — fallback khi chỉ có ảnh PNG, không có file raw

**Cost**: ~$0.06/query trung bình.

### Tier 3 — Research Agent (Claude Opus 4.7)

**Use cases**: "Em tổng hợp WS₂ QDs trên WO₃, Eg=3.05 eV, làm sao tăng HER?", "Có khoảng trống nghiên cứu gì giữa lab và literature?", "Viết phần methodology cho mẫu #042"

**Tools** (composing Tier 1+2 tools, plus):
- `vector_search_papers(query, filters?)` — Voyage-3 + rerank-2.5
- `bm25_search(keywords)` — keyword fallback
- `hybrid_retrieval(query)` — combined dense + sparse
- `lab_memory_query(facts_about)` — episodic memory
- `cross_source_verify(claim)` — check paper vs lab vs general knowledge
- `generate_hypothesis(observation)`
- `design_experiment(goal, constraints)`
- `write_section(template, data, citations)` — methodology, results, discussion
- `web_search_arxiv(query)` — live arXiv for very recent papers
- `dft_input_generator(material, calculation_type, software)` — QE/CASTEP/VASP

**Cost**: ~$0.30/query trung bình (deep multi-step).

### Routing Logic

```javascript
// src/js/ai/core/router.js (pseudocode)
function routeQuery(query, conversationContext) {
  const classification = await flashRouter(query); // cheap classifier

  if (classification.tier === 1) return tier1Agent;
  if (classification.tier === 2) return tier2Agent;
  if (classification.tier === 3) return tier3Agent;

  // Mixed — start with Tier 2, escalate to Tier 3 if needed
  return tier2WithEscalation;
}
```

**Estimated mix**: 60% Tier 1, 30% Tier 2, 10% Tier 3 → average cost ~$0.04/query.

---

## 3. Agentic RAG Pipeline

### 3.1 Ingestion (Offline, one-time + incremental)

```
Sources                          Pipeline                     Storage
───────                          ────────                     ───────
Web upload  ──┐
Zotero sync ──┼─▶  PDF Files  ─▶ Chandra OCR (text/eqs/tables)
Drive sync  ──┘                  ▼
                                 Claude Vision (figures)
                                 ▼
                                 Metadata (Crossref via DOI)
                                 ▼
                                 Smart Chunking (section-aware,
                                 500 tokens, 15% overlap)
                                 ▼
                                 Contextual Pre-prep (Anthropic
                                 technique: each chunk gets
                                 LLM-generated context summary)
                                 ▼
                                 Embed (Voyage-3, 1024 dim)
                                 ▼
                                 Index ────────────────────▶ Firestore Vector
                                                            BM25 (Lunr.js)
                                                            Metadata index
```

### 3.2 Retrieval (Online, per query)

```
User query
   │
   ▼
Query analysis (decompose if multi-aspect)
   │
   ├─▶ Hybrid retrieval (parallel):
   │      • Dense: top-50 Voyage embedding similarity
   │      • Sparse: top-50 BM25 keyword
   │   ▼
   │   Reciprocal rank fusion → top-50 merged
   │
   ▼
Reranker (voyage-rerank-2.5) → top-10
   │
   ▼
Confidence Grader (CRAG):
   ├─▶ "Correct" (>0.7): use chunks
   ├─▶ "Ambiguous" (0.3-0.7): chunks + web search
   └─▶ "Incorrect" (<0.3): web search only
   │
   ▼
LLM generates answer with chunks injected
   │
   ▼
Reflection loop: self-critique for unsupported claims
   │
   ▼
Final answer + citations + confidence
```

### 3.3 Storage Schema (Firestore Vector Search)

```javascript
// Collection: paper_chunks
{
  id: "paper_2023_park_001_chunk_007",
  paper_id: "paper_2023_park_001",
  chunk_index: 7,
  text: "raw chunk text",
  contextual_text: "LLM-prep context + raw chunk",  // for embedding
  embedding: [...],  // 1024-dim vector
  metadata: {
    paper_title: "WS2/WO3 heterojunction for HER",
    authors: ["Park, J.", "Lee, S."],
    year: 2023,
    journal: "Nano Letters",
    doi: "10.1021/...",
    section: "Results and Discussion",
    page: 4,
    figures_in_chunk: ["Fig 3", "Fig 4"],
    tables_in_chunk: [],
    equations: ["E_g = ...", "η = ..."]
  },
  tags: ["WS2", "WO3", "heterojunction", "HER", "Eg"]
}

// Collection: papers (master metadata)
{
  id: "paper_2023_park_001",
  title: "...",
  authors: [...],
  year: 2023,
  doi: "...",
  abstract: "...",
  keywords: [...],
  pdf_url: "...",
  num_chunks: 32,
  ingested_at: timestamp,
  ingested_by: "superadmin_uid",
  source: "zotero" | "drive" | "upload"
}

// Collection: lab_memory (episodic facts)
{
  id: "fact_001",
  type: "verified_observation" | "experimental_result" | "lesson_learned",
  content: "WS₂ QDs từ 180°C/12h hydrothermal có Eg = 3.05±0.05 eV",
  source_type: "experiment" | "user_input" | "ai_extracted",
  source_ids: ["exp_042"],
  embedding: [...],
  verified_by: ["superadmin_uid"],
  verified_at: timestamp,
  confidence: "high" | "medium" | "low",
  tags: ["WS2", "QD", "hydrothermal", "Eg"]
}
```

---

## 4. Anti-Hallucination — 9 Layers

### Layer 1: Strict Grounding (System Prompt)

```
Bạn là AI nghiên cứu vật liệu cho lab. QUY TẮC TUYỆT ĐỐI:
1. CHỈ trả lời dựa trên: (a) chunks retrieved, (b) lab data tools,
   (c) computational tool results.
2. KHÔNG TỰ SINH số liệu khoa học (Eg, d-spacing, Tafel, etc.).
   Nếu cần số, GỌI TOOL hoặc TÌM trong RAG.
3. Mỗi claim PHẢI kèm citation ID hoặc tool source.
4. Không có nguồn → nói "Không có dữ liệu về điều này trong corpus."
5. Không suy đoán bằng "thường thì", "có thể là" cho số liệu — chỉ cho cơ chế.
```

### Layer 2: Citation API (Anthropic Citations)

Mỗi câu được pin với chunk_id chính xác. Anthropic Citations API:
- `cited_text` không tính output token
- Format: `[claim] Park 2023 p.4`
- UI render link clickable đến chunk gốc

### Layer 3: Numerical Verification

Schema validation cho LLM output. Số liệu phải có format:
```
Eg = 3.05 eV [tool:tauc_calc] hoặc [src:chunk_891]
```
Reject nếu LLM cố sinh số không có tag nguồn.

### Layer 4: Confidence Grader (CRAG)

Pre-LLM step: grade từng chunk relevance trước khi inject vào prompt. Reject score <0.3.

### Layer 5: Reflection Loop

Post-LLM step: tự critique câu trả lời với prompt:
```
Phân tích câu trả lời sau. Chỉ ra các claim KHÔNG có nguồn cụ thể
(không nằm trong chunks hoặc tool results). Output JSON:
{ "unsupported_claims": [...], "should_remove": true/false }
```

Nếu có unsupported claims → re-query hoặc remove.

### Layer 6: Cross-source Verification

Khi RAG paper nói X, lab data nói Y → flag conflict, present both:
```
⚠️ Paper Park 2023 báo cáo Eg = 2.8 eV cho WS₂/WO₃.
   Nhưng mẫu lab #042 đo được 3.05 eV.
   Có thể do: khác synthesis method, khác đặc trưng pha.
```

### Layer 7: OOD (Out-of-Distribution) Detection

Câu hỏi về vật liệu chưa có trong lab + corpus:
```
🤖 Tôi không có dữ liệu nội bộ về vật liệu này trong lab hoặc
   1023 paper trong corpus. Đây là kiến thức general, độ tin cậy
   thấp hơn. Khuyến nghị tham khảo paper gốc.
```

Implementation: classifier dựa trên embedding distance thresholds.

### Layer 8: Eval Dashboard (Ragas)

Weekly evaluation:
- **Faithfulness**: target ≥0.90
- **Answer Relevancy**: target ≥0.85
- **Context Precision**: target ≥0.80

Alert admin nếu metric drop > 5% so với baseline.

### Layer 9: Human-in-the-loop Verify

Mỗi answer có nút `[✓ Verify]`. Khi superadmin click:
- Fact được extract → Lab Memory permanent
- Confidence boost cho tương lai
- Chain entry "verified by..."

---

## 5. Self-Learning Strategy

### 5.1 Lab Memory (Episodic)

Tích lũy facts từ:
- **Auto-extraction**: mỗi experiment mới nhập RTDB → AI extract facts → propose to memory (admin approve)
- **Conversation extraction**: cuối mỗi conversation, AI tự đề xuất facts đáng lưu
- **Verified answers**: khi user thumbs-up + verify → fact added

Facts nuôi dần Tier 3 reasoning. Sau 6 tháng, lab có **knowledge graph riêng**.

### 5.2 Feedback Loop

Mỗi answer track:
- 👍 / 👎
- Click-through citations
- Re-query (signal: answer 1 không đủ)
- Verify action
- Time-to-next-question

Aggregate weekly:
- Chunks hay được dùng → boost score
- Chunks bị dislike → flag for re-review
- Failed queries → reformulation patterns
- Slow queries → optimize routing

### 5.3 Reformulation Learning

Track: query → fail → user rephrase → success
→ Build mapping table:
```
"Eg sao cao thế" → "band gap quantum confinement explanation"
"sao bị shift" → "peak shift causes strain doping"
```

Apply trong query expansion lần sau.

### 5.4 No Fine-tuning

**Quy tắc vàng**: Knowledge → RAG. Style → Prompt. Behavior → Eval.

Không fine-tune Claude/Gemini vì:
- Không hỗ trợ Opus/Sonnet
- Catastrophic forgetting risk
- Knowledge update chậm
- Bản quyền paper phức tạp hơn

---

## 6. Provenance Chain (Audit Log)

### 6.1 Schema

```javascript
// Collection: ai_provenance
{
  id: "ans_2026_05_07_14_22_001",
  user_uid: "superadmin_uid",
  conversation_id: "conv_xyz",
  user_query: "Cách tăng HER cho WS₂/WO₃",
  timestamp: "2026-05-07T14:22:00Z",
  tier_used: 3,
  model: "claude-opus-4-7",

  agent_steps: [
    {
      step: 1,
      type: "decompose",
      thought: "Multi-aspect, 3 sub-questions",
      output: ["sub_1: band alignment", "sub_2: HER mechanism", "sub_3: optimization"]
    },
    {
      step: 2,
      type: "tool_call",
      tool: "vector_search_papers",
      input: { query: "WS2 WO3 heterojunction HER" },
      output: { chunk_ids: [...], scores: [...] }
    },
    {
      step: 3,
      type: "tool_call",
      tool: "lab_memory_query",
      input: { facts_about: "WS2 WO3 lab samples" },
      output: { fact_ids: ["F0042"] }
    },
    {
      step: 4,
      type: "reflection",
      thought: "Need more data on optimization",
      action: "re_retrieve"
    },
    {
      step: 5,
      type: "synthesis",
      output: "final answer text"
    }
  ],

  claims_in_answer: [
    {
      claim_id: "c1",
      text: "Eg=3.05 eV chủ yếu từ WO₃",
      sources: ["chunk_891"],
      confidence: "high",
      verified_by_tool: false
    },
    {
      claim_id: "c2",
      text: "Tafel slope ~120 mV/dec điển hình cho WS₂",
      sources: ["chunk_42", "chunk_178"],
      confidence: "high",
      verified_by_tool: false
    },
    {
      claim_id: "c3",
      text: "Lab Exp #042 có overpotential 320 mV",
      sources: ["lab_exp_042"],
      confidence: "high",
      verified_by_tool: true
    }
  ],

  total_tokens: { input: 12450, output: 1820 },
  total_cost_usd: 0.32,
  duration_ms: 4530,

  feedback: null,  // populated when user gives feedback
  verified_by_admin: false,
  verified_at: null
}
```

### 6.2 UI Display

Provenance chain hiện collapsed bên dưới mỗi AI message:
```
🤖 [answer text]

──────────────────────────────────
Reasoning chain (5 steps · 4.5s · $0.32)  [▼ expand]
Sources:
  📄 Park 2023, p.4    [view]
  📄 Liu 2021, p.7     [view]
  🧪 Lab Exp #042      [open]
Confidence: ●●●●○ High
──────────────────────────────────
[👍] [👎]  [📋 copy]  [🔗 share]  [✓ verify]
```

### 6.3 Audit Use Cases

- **Luận văn**: "AI gợi ý X, dựa trên paper Y, Z" — đầy đủ chain để defend
- **Debug**: AI sai → xem bước nào sai → fix
- **Quality**: review weekly, identify bad chunks/prompts
- **Compliance**: AI usage disclosure cho paper publication (theo yêu cầu Sakana AI license)

---

## 7. Voice Integration

### 7.1 Phase 1 — Web Speech API (immediate)

**ASR (Speech-to-Text)**:
- `webkitSpeechRecognition` / `SpeechRecognition`
- Vietnamese support: `lang="vi-VN"` (Chrome works well)
- English fallback: `lang="en-US"`
- Continuous mode for lab dictation
- Free, no server, browser native

**TTS (Text-to-Speech)**:
- `speechSynthesis.speak(utterance)`
- Vietnamese: `lang="vi-VN"`, voice selection
- Speed/pitch control
- Free, browser native

**Limitation**: Quality decent nhưng không bằng VibeVoice. OK cho prototype.

### 7.2 Phase 2 — VibeVoice Self-host (future)

Khi có nhu cầu:
- VibeVoice-ASR-7B for accurate transcription with hotwords
  (lab-specific terms: "L-Cysteine", "WS₂", "Tafel"...)
- VibeVoice-Realtime-0.5B for low-latency TTS reading

**Infrastructure needed**:
- GPU server (RTX 4090+ / A100 / cloud)
- Docker NVIDIA container
- API endpoint exposed to webapp

**Cost**: ~$50-200/month cloud GPU OR one-time hardware.

**Defer until**: Phase D, when project has multiple users.

### 7.3 Lab Mode UX

```
Press F → Lab Mode fullscreen
  ↓
Voice button always visible bottom-right
Hold-to-talk OR continuous mode
  ↓
Live transcription shows
  ↓
Confirmed → AI processes → TTS reads result aloud
```

Use case: "Claude, ghi: thêm 0.5g L-Cysteine lúc 14:22" → AI write to RTDB experiment log.

---

## 8. Document Processing Pipeline

### 8.1 Upload Pipeline

```
PDF Paper
   │
   ▼
Chandra OCR (datalab.to API)
   │
   ├─ Markdown text (with structure)
   ├─ LaTeX equations (inline + block)
   ├─ Tables (HTML/Markdown preserved)
   └─ Bounding boxes for figures
   │
   ▼
Figure extraction
   │
   ▼
Claude Vision reads each figure
   │
   ├─ Spectrum → identify type, peaks, samples
   ├─ Microscopy → identify scale, features
   ├─ Schematic → describe workflow
   └─ Chart → extract data points if possible
   │
   ▼
Merged document (text + figure descriptions + equations)
   │
   ▼
Smart chunking (section-aware)
   │
   ▼
Contextual pre-prep + Embed (Voyage-3)
   │
   ▼
Index Firestore Vector + BM25
```

### 8.2 Source Integrations

**Web Upload**:
- Drag & drop, batch up to 50 PDF
- Progress UI per file
- Dedup by DOI/title hash

**Zotero Sync**:
- Zotero Web API + library ID
- One-way sync (Zotero → LabBook)
- Filter by collection/tag

**Google Drive Sync**:
- Folder watch for new PDFs
- OAuth scope: drive.readonly
- Webhook trigger on file add

---

## 9. Workbench (Right Sidetab + Pages)

### 9.1 Right Sidetab (Chat) — `⌘J` toggle

Quick chat anywhere in app. Slide-out from right (380px width). Use cases:
- "Thông tin nhanh về [chemical]"
- "Mở booking máy XRD T2 9h"
- "Tìm paper về ZnO QD"

### 9.2 Workbench Pages (left sidebar)

Sub-sections under "AI Workbench":

#### 9.2.1 Spectrum Analyzer
- Upload XRD/Raman/UV-Vis/PL/FTIR/LSV files
- Auto-detect type
- AI analysis + computational tools
- Multi-sample comparison
- Export report

#### 9.2.2 Paper Library
- Browse 1000+ papers (filter, search)
- Reading view với AI Q&A on paper
- Highlight relevant to current lab work
- Citation manager (BibTeX export)

#### 9.2.3 Materials Database
- CAS number lookup
- JCPDS card library (WO₃, WS₂, MoS₂, etc. pre-loaded)
- Compound properties (Mw, density, hazards)
- Custom material entries

#### 9.2.4 Structure Viewer
- 3Dmol.js or Mol* for crystal/molecule
- CIF file upload
- Band structure plot (from DFT output)

#### 9.2.5 DFT Launcher
- Input file generator (QE, CASTEP, VASP)
- Pseudopotential picker
- K-point mesh suggester
- Convergence parameter helper
- Output parser (band gap, DOS, formation energy)
- **NOT actual DFT execution** (need HPC)

#### 9.2.6 Materials AI Writer
- Inspired by AI-Scientist, but materials-focused
- Templates: methodology, results, abstract, intro, discussion
- Pull from lab data + RAG corpus
- Output: LaTeX or Word
- Citation auto-management
- Style adaptation (journal-specific)

---

## 10. Tech Stack Summary

```yaml
# LLM Providers
tier_1: gemini-2.5-flash       # cheap, fast Q&A
tier_2: claude-sonnet-4-6      # vision + reasoning
tier_3: claude-opus-4-7        # deep reasoning

# Embedding & Reranking
embedding: voyage-3            # 1024-dim, scientific
reranker: voyage-rerank-2.5    # boost retrieval

# Storage
vector_db: Firestore Vector Search
chat_history: Firebase RTDB
papers_metadata: Firestore
provenance: Firestore
lab_memory: Firestore

# OCR & Vision
ocr: Chandra OCR (datalab.to API)
spectrum_vision: Claude Vision direct

# Voice (Phase 1)
asr: Web Speech API
tts: speechSynthesis API

# Voice (Phase 2 - future)
asr: VibeVoice-ASR-7B (self-host)
tts: VibeVoice-Realtime-0.5B (self-host)

# Backend
runtime: Firebase Cloud Functions (Blaze plan)
secrets: Firebase Functions config / GCP Secret Manager

# Frontend
framework: Vite + Vanilla JS (existing)
styling: Tailwind + CSS tokens (per DESIGN.md)
icons: Lucide (replace existing)

# Standards
tool_calling: MCP (Model Context Protocol, Anthropic-donated)
citations: Anthropic Citations API
contextual_retrieval: Anthropic technique
eval: Ragas framework (weekly)
```

---

## 11. Cost Projection (Single User Phase)

### Monthly Estimate

```
LLM (1000 queries/mo, Tier mix 60/30/10):
  Tier 1: 600 × $0.003  = $1.80
  Tier 2: 300 × $0.06   = $18.00
  Tier 3: 100 × $0.30   = $30.00
  ─────────────────────────────
  Subtotal:               $49.80

Embedding (Voyage-3):
  Index 1000 papers:     $0.90 (one-time)
  Query embed:           $0.01/mo

Reranking (Voyage rerank-2.5):
  ~500 reranks/mo:       $0.50

OCR (Chandra hosted):
  ~100 PDFs/mo:          $0 (free tier)

Firebase Blaze:
  Cloud Functions:       $0-2
  Firestore Vector:      $0 (within free tier 1GB)
  Hosting:               $0
  ─────────────────────────────
  Subtotal:               $2

TOTAL:                   ~$52/month
```

**Tối ưu hóa với prompt caching** (Anthropic):
- System prompt + tool defs cache → 90% input cost reduction trên call thứ 2+
- Estimated: **~$25-30/month thực tế** với caching đúng

### Cost Controls

- Hard quota: $100/month max → API rejection auto
- Per-query token limit: input <50K, output <8K
- Tier 3 only triggered explicitly hoặc by complexity classifier
- Streaming response (cancel mid-way if user navigates)
- Response caching cho similar queries

---

## 12. Security & Privacy

### 12.1 API Key Management

- Anthropic API key: Cloud Functions env (never client-side)
- Voyage API key: Cloud Functions env
- Chandra API key: Cloud Functions env
- Gemini API key: Firebase AI Logic (managed) OR Cloud Functions

### 12.2 Database Rules

```json
{
  "rules": {
    "ai_chats": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid && root.child('users').child(auth.uid).child('role').val() === 'superadmin'",
        ".write": "auth != null && auth.uid === $uid && root.child('users').child(auth.uid).child('role').val() === 'superadmin'"
      }
    },
    "ai_provenance": {
      "$ans_id": {
        ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'superadmin'",
        ".write": false  // only Cloud Functions
      }
    },
    "lab_memory": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'superadmin'",
      ".write": false  // only Cloud Functions, after admin approval
    }
  }
}
```

### 12.3 Data Retention

- Conversations: keep all (user-deletable)
- Provenance: keep 1 year minimum (audit)
- Lab Memory: permanent (until manually deleted)
- Embedding vectors: keep with papers
- API logs: 30 days

### 12.4 PII / Sensitive

- No external services see lab member personal info
- Chandra OCR: opt for "zero data retention" mode
- Anthropic: prompt caching is per-org, not shared
- Voyage: standard ToS, no training on user data

### 12.5 Paper Copyright

- RAG (truy xuất) chứ không train → fair use academic
- Citation strict (mỗi claim trace về paper)
- Don't share corpus externally
- Disclose AI usage trong publications (per Sakana AI license inspiration)

---

## 13. Evaluation Strategy

### 13.1 Golden Test Set

Bộ test fixed cho regression testing:
- **7 ảnh phổ user-uploaded** (XRD WO₃, MoS₂/rGO SEM/HRTEM, Raman series, FTIR series, PL trion, Tauc 3.05 eV, xQDs Stokes shift)
- **20 câu hỏi** mỗi tier (Q&A đơn giản, phân tích phổ, suy luận sâu)
- **Expected outputs** (key facts AI must mention)

Run weekly. Track regression.

### 13.2 Ragas Metrics

```python
# Weekly evaluation pipeline
from ragas import evaluate

result = evaluate(
    dataset=test_set,
    metrics=[
        faithfulness,        # answer grounded in context
        answer_relevancy,    # answer addresses question
        context_precision,   # retrieved chunks relevant
        context_recall       # all relevant chunks retrieved
    ]
)

# Target thresholds
assert result['faithfulness'] >= 0.90
assert result['answer_relevancy'] >= 0.85
assert result['context_precision'] >= 0.80
assert result['context_recall'] >= 0.75
```

### 13.3 User Feedback Aggregation

Weekly admin dashboard:
- Top 10 thumbs-up answers (good patterns)
- Top 10 thumbs-down (failure analysis)
- Citations clicked (which sources useful)
- Query reformulations (where retrieval fails)
- Verified facts count (memory growth)

---

## 14. Implementation Roadmap

### Phase A — Foundation (Round 105-115)

| Round | Task |
|---|---|
| 105 | Folder structure + env + secrets + provider abstraction |
| 106 | Firebase Blaze upgrade + Cloud Functions setup |
| 107 | AI Chat sidetab UI shell (slide-out, ⌘J toggle) |
| 108 | Conversation schema RTDB + load/save/list |
| 109 | Markdown + KaTeX + image rendering in chat |
| 110 | Streaming responses with abort controller |
| 111 | Tier 1 routing + Gemini Flash integration |
| 112 | Tier 1 tools: chemicals, equipment, bookings query |
| 113 | Tier 1 tools: history, members, compliance |
| 114 | Compliance KB (Nghị định 24/2026 4 phụ lục as JSON) |
| 115 | Web Speech API integration (ASR + TTS basic) |

### Phase B — RAG Infrastructure (Round 116-128)

| Round | Task |
|---|---|
| 116 | Paper upload UI + queue + dedup |
| 117 | Chandra OCR integration (Cloud Function proxy) |
| 118 | PDF extraction pipeline (text + figures + metadata) |
| 119 | Smart chunking (section-aware, overlap) |
| 120 | Contextual pre-prep (Anthropic technique) |
| 121 | Voyage-3 embedding pipeline |
| 122 | Firestore Vector Search index + queries |
| 123 | BM25 (Lunr.js) keyword index |
| 124 | Hybrid retrieval (RRF fusion) |
| 125 | Voyage rerank-2.5 integration |
| 126 | Citation tracking + UI display |
| 127 | Paper Library page (browse, search, filter) |
| 128 | Zotero + Drive sync sources |

### Phase C — Tier 2 Spectrum Analyzer (Round 129-145)

| Round | Task |
|---|---|
| 129 | Workbench page shell + Spectrum Analyzer tab |
| 130 | File upload UI + type detection (XRD/Raman/UV-Vis/PL/FTIR/LSV) |
| 131-132 | XRD parser (multiple formats) + peak detection |
| 133 | XRD Scherrer + lattice refinement + JCPDS matching |
| 134-135 | Raman parser + Lorentzian/Voigt fitting |
| 136 | Raman MoS₂/WS₂ layer counting (E¹₂g - A₁g distance) |
| 137-138 | UV-Vis parser + Tauc plot (direct/indirect/Kubelka-Munk) |
| 139-140 | PL parser + multi-Gaussian deconvolution (A⁻/A⁰/B for TMDs) |
| 141-142 | FTIR parser + functional group identification |
| 143-144 | LSV parser + Tafel + overpotential + ECSA |
| 145 | Vision fallback (Claude reads spectrum images directly) |

### Phase D — Agentic + Self-learning (Round 146-160)

| Round | Task |
|---|---|
| 146 | Tier 3 orchestrator with Opus 4.7 |
| 147 | Plan-Execute-Reflect agent loop |
| 148 | Multi-step decomposition |
| 149 | CRAG confidence grader integration |
| 150 | Reflection loop (self-critique) |
| 151 | Cross-source verification |
| 152 | OOD detection |
| 153 | Lab Memory schema + write API |
| 154 | Auto-extract facts from experiments |
| 155 | Feedback loop (thumbs aggregation) |
| 156 | Reformulation pattern learning |
| 157 | Provenance chain UI display |
| 158 | Verify-and-promote-to-memory flow |
| 159 | Eval pipeline (Ragas weekly) |
| 160 | Eval dashboard for admin |

### Phase E — Advanced Features (Round 161+)

| Round | Task |
|---|---|
| 161-165 | Materials Database tab (CAS + JCPDS card library) |
| 166-170 | Structure Viewer (3Dmol.js + CIF) |
| 171-175 | DFT Launcher (QE/CASTEP input gen + output parser) |
| 176-185 | Materials AI Writer (templates + LaTeX/Word export) |
| 186-190 | Lab Mode (F key) + voice-first workflow |
| 191-195 | Knowledge Graph viz |
| 196-200 | Spectrum Compare (drag overlay) + What-if Simulator |

---

## 15. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM cost spike | Medium | High | Hard quota, prompt caching, tier routing |
| Hallucination in scientific claims | High initially | High | 9-layer protection, provenance, eval |
| Vector DB scale issues | Low (1k papers) | Medium | Monitor, ready to migrate to Pinecone |
| Voyage API rate limits | Low | Low | Batch queries, fallback to Gemini embed |
| Anthropic API outage | Low | High | Fallback Gemini Pro for Tier 2 |
| Chandra OCR quota exhausted | Medium | Medium | Self-host pymupdf as fallback |
| Paper copyright dispute | Low | High | Strict citation, no redistribution, disclose |
| Lab member resistance to AI | Medium | Medium | Keep superadmin-only initially, prove value |

---

## 16. Success Criteria

End of each Phase:

**Phase A**: AI chat works for Tier 1 queries with role gating, voice input/output basic.

**Phase B**: 100+ papers indexed, RAG returns relevant chunks for materials queries, citations clickable.

**Phase C**: AI correctly analyzes 7 golden test spectra (XRD, Raman, UV-Vis, PL, FTIR, LSV, vision) with key facts mentioned.

**Phase D**: Agentic loop demonstrably outperforms naive RAG on multi-aspect queries; Lab Memory has 50+ verified facts; eval dashboard shows faithfulness ≥0.90.

**Phase E**: Full Workbench with all tabs functional; Materials AI Writer drafts thesis section that requires <30% human edit.

---

## 17. References

- **Anthropic Citations API** — guaranteed pointers, free output tokens
- **Anthropic Contextual Retrieval** — chunk + LLM-prep context
- **MCP (Model Context Protocol)** — donated to Linux Foundation Dec 2025
- **Voyage AI** — embedding + reranking, Anthropic-recommended
- **Ragas framework** — RAG evaluation metrics
- **CRAG paper** — Corrective RAG self-correction
- **Self-RAG paper** — special tokens for confidence
- **AI-Scientist v2 (SakanaAI)** — agentic tree search inspiration
- **Chandra OCR (Datalab)** — open-source SOTA OCR
- **Microsoft VibeVoice** — TTS/ASR for voice features
- **Nghị định 24/2026/NĐ-CP** — Vietnam chemical compliance

---

## 18. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-07 | 3-Tier architecture | Cost optimization + capability matching |
| 2026-05-07 | Claude Opus/Sonnet for Tier 2-3 | Vision + reasoning quality |
| 2026-05-07 | Voyage-3 over Gemini embed | Anthropic ecosystem coherence |
| 2026-05-07 | Firestore Vector Search | Native Firebase integration |
| 2026-05-07 | Chandra for OCR, not spectrum | Right tool for right job |
| 2026-05-07 | Web Speech API Phase 1 | Free, immediate, decent quality |
| 2026-05-07 | 9-layer anti-hallucination | Scientific claims demand high faithfulness |
| 2026-05-07 | Provenance chain from day 1 | Critical for thesis defensibility |
| 2026-05-07 | Superadmin-only Phase 1 | Cost control + iteration speed |
| 2026-05-07 | Materials AI Writer over AI-Scientist v2 | Domain-specific, no GPU needed |

---

*This is a living document. Update with each architectural decision.*
