# LabBook BKU — Commercial Roadmap

**Version**: 1.0  
**Last updated**: May 8, 2026 (post R137c2)  
**Owner**: nAM  
**Status**: Internal lab MVP done; commercial fork planning

---

## Strategy

Two parallel codebases:

1. **`labbook-bku`** — production for lab BKU (50 users). Stability + lab-specific UX. Current repo.
2. **`labbook-saas`** — future fork. Multi-tenant, scale, billing, customer onboarding. Branch off when lab MVP is stable enough to be a baseline.

The lab codebase ships features useful for the lab. Architecture decisions during lab phase are made commercial-aware (interfaces, abstractions, schema-ready fields) but never block lab usability for theoretical SaaS needs.

---

## Phase status (as of R137c2)

### ✅ Phase A — AI Foundation (R105–R115)
LLM proxy (Gemini Flash), tool calling, AI chat sidetab, Markdown/KaTeX/highlight rendering, streaming via SSE.

### ✅ Phase B.1 — RAG Pipeline (R130–R136)
Paper upload → Chandra OCR → section-aware chunking → Voyage embeddings (voyage-3-large) → Firestore vector search → frontend search UI.

### ✅ Phase B.2 — Hybrid Retrieval (R137a–R137c2)
- BM25 inverted index in Firestore
- Hybrid engine (vector + BM25 + RRF)
- Voyage rerank-2.5
- RAG evaluation framework (MRR, Precision@K, NDCG@K)
- LLM observability (distributed tracing, cost tracking)
- Frontend confidence badges + latency display

**Current baseline metrics** (10 seed queries, 3 papers, 678 chunks):
- Hybrid + rerank: MRR=1.0, P@10=0.95, NDCG=0.99
- Latency: 520ms warm, 3-4s cold

---

## Phase B remaining

### Phase B.3 — Hierarchical Retrieval (R138)
**Trigger**: corpus >500 papers, synthesis queries common.

- Paper-level summaries (1 vector/paper) for fast paper filtering
- Section-level summaries (5-15 vectors/paper) for mid-resolution
- Multi-resolution retrieval: paper → section → chunk
- Generated via Gemini Flash (~$0.50 for 5000 papers)

### Phase B.4 — Knowledge Graph (R139)
**Trigger**: lab needs citation network, cross-paper discovery.

- Citation extraction (regex + references parser + OpenAlex enrichment)
- Entity extraction (compounds, methods, conditions via Gemini Flash structured)
- Neo4j AuraDB Free (200K nodes, 400K edges — fits 5K papers)
- Graph-aware retrieval (multi-hop queries: "papers citing this method")

### Phase B.5 — Synthesis Layer (R140–R142)
**Trigger**: B.3 + B.4 stable.

- Query router (intent classification: factual / synthesis / discovery)
- Synthesis chain (gather → group → compare → summarize)
- Frontend synthesis report UI

---

## Phase C — Analyzers (deferred, post Phase B)
- XRD analyzer (Materials Project API integration)
- Raman analyzer
- EIS analyzer

---

## Phase D — Test & Polish (continuous)
- D1: Stress-test corpus (50-100 real papers) ← **CURRENT**
- D2: Ground truth expansion (10 → 50 queries) ← **CURRENT**
- D3: Production stability monitoring
- D4: Bug hunting via traces
- D5: Cost optimization (cache strategies, model selection)

---

## Fork point — when to start `labbook-saas`

Fork when ALL true:

1. ✅ Phase B.2 done (hybrid retrieval stable)
2. ✅ Eval framework stable, regression-free for 30+ days
3. ✅ Lab uses system daily without major bugs for 60+ days
4. ⏳ Real corpus indexed (500+ papers)
5. ⏳ At least 3 external interest signals (other labs, conferences, requests)

**Estimated**: 6-12 months from now (post-Phase B.5).

---

## SaaS Phase E — Multi-tenancy (post-fork)

### E1: Tenant data partition
- Add `tenantId` enforcement to all queries (already schema-ready in lab)
- Per-tenant Firestore collections OR `tenantId` field with strict rules
- Tenant context propagation through all Cloud Functions
- **Migration cost**: low — schema fields already exist

### E2: Authentication & onboarding
- Tenant signup flow (org creation)
- Per-tenant user invites
- Email verification, password reset, SSO (Google/Microsoft for enterprise)
- Tenant admin dashboard (manage members, roles, invitations)

### E3: Pricing tiers

| Tier | Papers | Queries/mo | Storage | Features | Price |
|------|--------|------------|---------|----------|-------|
| **Free** | 50 | 200 | 100MB | Hybrid search, basic UI | $0 |
| **Pro** | 500 | 2000 | 1GB | + Rerank, eval reports, advanced UI | $29/mo |
| **Team** | 5000 | 10K | 10GB | + Knowledge graph, synthesis, API access | $99/mo |
| **Enterprise** | unlimited | unlimited | unlimited | + SSO, SLA, custom integrations, dedicated support | Custom |

(Numbers are placeholders — calibrate from real cost data after lab phase.)

### E4: Billing infrastructure
- Stripe integration (subscriptions, metered billing, invoices)
- Usage tracking via existing observability traces (cost per tenant)
- Quota enforcement (rate limit, paper count, storage)
- Auto-downgrade on payment failure

### E5: Admin dashboard
- Tenant analytics (queries, papers, users, cost)
- Search analytics (top queries, low-result queries, satisfaction)
- A/B test framework (config experiments per tenant cohort)
- Customer support tools (impersonate tenant, debug traces)

---

## SaaS Phase F — Scale & Enterprise

### F1: Search infrastructure migration
**Trigger**: >50K chunks per tenant OR >100 paying tenants.

- Migrate from Firestore BM25 (Option A) to Typesense Cloud or Vertex AI Search
- Drop-in via existing `SearchEngine` interface — no code refactor at call sites
- Estimated cost: $19/mo Typesense free tier, $99/mo at scale

### F2: Observability migration
**Trigger**: >100K traces/month.

- Migrate from Firestore aiTraces (Option A) to Cloud Logging + BigQuery sink
- BigQuery analytics for cohort/funnel analysis
- Drop-in via existing `TraceSink` interface

### F3: Cache layer
**Trigger**: hot queries dominate (>30% of traffic).

- Migrate from in-memory LRU to Memorystore Redis
- Shared cache cross-instance, persistent
- Cost: $35/mo baseline, scale linearly

### F4: Multi-region deployment
**Trigger**: enterprise customer in different region.

- Cloud Run multi-region (asia-southeast1 + us-central1 + europe-west1)
- Firestore multi-region (already supported)
- CDN for frontend (already via Firebase Hosting)

### F5: Compliance & enterprise features
**Trigger**: first enterprise customer.

- SOC 2 Type II audit
- GDPR compliance (data export, right to delete)
- HIPAA (if medical/biology lab customers)
- Custom data residency
- SSO (SAML 2.0)
- Audit logs
- API access with rate limiting + key management

---

## SaaS Phase G — Growth

### G1: Self-serve onboarding
- Trial signup with sample papers (3 demo papers indexed automatically)
- Interactive tutorial / walkthrough
- Documentation site (Mintlify or similar)

### G2: Community & ecosystem
- Public dataset hosting (free for academic use)
- Integration marketplace (Zotero, Mendeley, Notion)
- API for third-party tools
- Developer docs + SDK (TypeScript, Python)

### G3: Advanced features (paid tier differentiators)
- Custom embedding models (fine-tune on customer corpus)
- Custom rerankers (cross-encoder trained on customer feedback)
- Hybrid graph + RAG queries
- Multi-modal RAG (images, equations, tables in search)
- Voice query interface

---

## Architecture decisions enabling commercial fork

The following were deliberately built as interfaces / abstractions / schema-ready fields during lab phase, even though lab doesn't need them:

### Already in place (lab phase)
- ✅ `SearchEngine` interface (vector/bm25/hybrid) — easy add Typesense/Vertex
- ✅ `Reranker` interface — easy swap to Cohere or cross-encoder
- ✅ `TraceSink` interface — easy migrate to BigQuery
- ✅ `tenantId` field in `aiChunks`, search queries — default `"default"` for lab
- ✅ Centralized `SearchConfig` — easy convert to per-tenant Firestore config
- ✅ Cost tracking via `tracer.recordCost()` — ready for usage-based billing
- ✅ Observability schema (traces, eval runs) — ready for analytics
- ✅ Firestore named DB `"labbook"` — ready for per-tenant DB if needed

### Required at fork (deferred to SaaS phase)
- ⏳ Tenant signup flow + auth context propagation
- ⏳ Stripe billing
- ⏳ Quota enforcement middleware
- ⏳ Admin dashboard
- ⏳ Customer support tooling

---

## Cost model

### Lab (current, ~50 users, 3 papers test):
- Firebase: <$5/mo (mostly free tier)
- Voyage embeddings: <$1/mo
- Voyage rerank: <$1/mo
- Gemini: <$5/mo
- Cloud Functions: <$1/mo
- **Total**: <$15/mo

### Lab (5000 trang projection):
- One-time ingest: ~$30 (Chandra + embeddings + entity extraction)
- Monthly: ~$10-30/mo (queries, rerank, LLM synthesis)

### SaaS (10 paying tenants Pro tier, ~500 papers each):
- Per-tenant infrastructure: ~$5-10/mo
- Customer support tooling: ~$50/mo
- **Total cost**: ~$100/mo  
- **Revenue**: 10 × $29 = $290/mo  
- **Margin**: ~65%

(Numbers are estimates — calibrate against real ops.)

---

## Open questions (for discussion when fork approaches)

1. **Compete vs partner with existing tools?**
   - Compete with: SciSpace, Elicit, Consensus, Scite
   - Partner with: Zotero, Mendeley, Overleaf
   
2. **Self-host vs managed for enterprise?**
   - On-prem deployment for high-security labs (pharma, defense)
   - Adds complexity but unlocks high-margin contracts

3. **Vertical specialization?**
   - Stay broad (any STEM lab)
   - Or specialize (chemistry-only, biology-only)
   - Specialization = better quality but smaller market

4. **Open source strategy?**
   - Open-source core engine, monetize hosted version
   - Closed source, classic SaaS
   - Hybrid (open eval framework, closed everything else)

5. **Distribution channels?**
   - Direct (lab leaders sign up)
   - University procurement (institutional licenses)
   - Conferences + papers (academic credibility)

---

## Tracking

This document is updated at each phase transition. Append revision history below.

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-08 | 1.0 | Initial draft post R137c2 |

---

*This is a planning document, not a commitment. Pivots happen.*
