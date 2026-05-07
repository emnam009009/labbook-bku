# LabBook BKU — Design System

**Version**: 1.0
**Last updated**: 2026-05-07
**Status**: Foundation

---

## 1. Design Philosophy

LabBook BKU không phải một SaaS dashboard. Nó là **công cụ làm việc cho nhà khoa học vật liệu** — giống một thiết bị chính xác (precision instrument) hơn là một app marketing.

### Three Pillars

**1. Information Density**
Nhà nghiên cứu cần nhìn nhiều dữ liệu cùng lúc. Whitespace lãng phí = scroll nhiều = slow workflow. Mỗi pixel phải có ý nghĩa.

**2. Restraint over Decoration**
Một accent color, không phải bảy. Border 1px, không phải shadow lớn. Typography hierarchy mạnh, không phải gradient cards.

**3. Speed**
Command palette > navigation clicks. Keyboard shortcuts > mouse hunting. Inline edit > modal popup.

---

## 2. Color System

### 2.1 Base Palette (Dark Mode Default)

```css
/* Background scale */
--bg-base:       #0A0E14;  /* deep slate, gần đen nhưng không đen tuyền */
--bg-surface:    #11161D;  /* card/panel surface */
--bg-elevated:   #1A2028;  /* hover/active states */
--bg-overlay:    #232932;  /* modals, dropdowns */

/* Border scale */
--border-subtle: #1F252D;  /* hairline dividers */
--border-default:#2A3138;  /* default borders */
--border-strong: #3D454F;  /* focus, active borders */

/* Text scale (3 levels only) */
--text-primary:   rgba(255, 255, 255, 0.95);  /* headers, key data */
--text-secondary: rgba(255, 255, 255, 0.70);  /* body, labels */
--text-tertiary:  rgba(255, 255, 255, 0.45);  /* metadata, hints */
--text-disabled:  rgba(255, 255, 255, 0.25);  /* disabled */
```

### 2.2 Single Accent

```css
/* Cyan electroluminescent — vibe scientific instrument */
--accent:        #06B6D4;
--accent-hover:  #0891B2;
--accent-subtle: rgba(6, 182, 212, 0.10);  /* tint backgrounds */
--accent-border: rgba(6, 182, 212, 0.30);  /* subtle borders */
```

**Quy tắc**: Accent **chỉ dùng cho**:
- Primary CTA (1 button per screen tối đa)
- Active state navigation
- AI-related elements (chat icon, AI badge, AI suggestions)
- Selected items
- Focus rings

**Không dùng** cho: card backgrounds, decorative gradients, info icons.

### 2.3 Semantic Status (4 màu, dùng tối thiểu)

```css
--status-success: #10B981;  /* completed, in-stock, online */
--status-warning: #F59E0B;  /* low-stock, pending, attention */
--status-error:   #EF4444;  /* error, out-of-stock, danger */
--status-info:    #6366F1;  /* notification, neutral hint */
```

Status colors **chỉ làm border-left 2px hoặc dot indicator 6px**. Không fill background card.

### 2.4 Data Visualization Palette

Cho charts, plots — categorical 8 màu, dịu mắt trên dark mode:

```css
--chart-1: #06B6D4;  /* cyan (primary) */
--chart-2: #F59E0B;  /* amber */
--chart-3: #10B981;  /* emerald */
--chart-4: #EC4899;  /* pink */
--chart-5: #A855F7;  /* purple */
--chart-6: #84CC16;  /* lime */
--chart-7: #F97316;  /* orange */
--chart-8: #3B82F6;  /* blue */
```

---

## 3. Typography

### 3.1 Font Stack

```css
/* Body / UI */
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

/* Numerical / Technical data (KEY for scientific feel) */
--font-mono: "JetBrains Mono", "SF Mono", "Geist Mono", Menlo, monospace;

/* Headers (slightly tighter) */
--font-display: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
```

**Quy tắc Mono**: Mọi **số liệu khoa học** dùng monospace:
- Eg = `3.05 eV` (mono)
- Stock: `2.3 g` (mono)
- Tafel: `120 mV/dec` (mono)
- Date/time, IDs, formulas → mono

Lý do: Mắt scan dễ, alignment đẹp, "feel" technical.

### 3.2 Type Scale (modular 1.250 ratio)

```css
--text-xs:    0.75rem;   /* 12px - metadata, captions */
--text-sm:    0.875rem;  /* 14px - body small, table */
--text-base:  1rem;      /* 16px - body default */
--text-lg:    1.125rem;  /* 18px - large body */
--text-xl:    1.25rem;   /* 20px - h4 */
--text-2xl:   1.5rem;    /* 24px - h3 */
--text-3xl:   1.875rem;  /* 30px - h2 */
--text-4xl:   2.25rem;   /* 36px - h1 page */
--text-5xl:   3rem;      /* 48px - display */
```

### 3.3 Font Weights

```css
--weight-normal:   400;
--weight-medium:   500;
--weight-semibold: 600;
--weight-bold:     700;
```

**Hiếm dùng bold**. Hierarchy bằng size + color tertiary, không phải bold mọi chỗ.

### 3.4 Line Height

```css
--leading-tight:   1.25;  /* headers */
--leading-snug:    1.375; /* short body */
--leading-normal:  1.5;   /* default body */
--leading-relaxed: 1.625; /* long-form reading */
```

### 3.5 Letter Spacing

```css
--tracking-tight:  -0.02em;  /* large headers */
--tracking-normal: 0;
--tracking-wide:   0.05em;   /* uppercase labels */
```

---

## 4. Spacing & Grid

### 4.1 Spacing Scale (8px base, half-step at small)

```css
--space-0:   0;
--space-1:   0.25rem;  /* 4px */
--space-2:   0.5rem;   /* 8px */
--space-3:   0.75rem;  /* 12px */
--space-4:   1rem;     /* 16px */
--space-5:   1.25rem;  /* 20px */
--space-6:   1.5rem;   /* 24px */
--space-8:   2rem;     /* 32px */
--space-10:  2.5rem;   /* 40px */
--space-12:  3rem;     /* 48px */
--space-16:  4rem;     /* 64px */
--space-20:  5rem;     /* 80px */
```

### 4.2 Layout Grid

```css
--container-max: 1440px;
--sidebar-width: 240px;  /* left nav */
--rightbar-width: 380px; /* AI chat sidetab */
--content-padding: var(--space-6);
```

### 4.3 Component Sizes

```css
/* Heights (consistent across UI) */
--h-input:   2.25rem;  /* 36px */
--h-button:  2.25rem;  /* 36px */
--h-row:     2.75rem;  /* 44px */
--h-header:  3.5rem;   /* 56px */

/* Border radius */
--radius-sm:  0.25rem;  /* 4px */
--radius-md:  0.375rem; /* 6px */
--radius-lg:  0.5rem;   /* 8px */
--radius-xl:  0.75rem;  /* 12px */
--radius-full: 9999px;
```

---

## 5. Layout Principles

### 5.1 Anti-Card Doctrine

**Bỏ card mọi nơi**. Thay bằng:

```
TRƯỚC (card-based):
┌──────────────┐  ┌──────────────┐
│ [shadow]     │  │ [shadow]     │
│ Chemicals    │  │ Equipment    │
│              │  │              │
│ 24 active    │  │ 8 available  │
└──────────────┘  └──────────────┘

SAU (grid-based):
CHEMICALS              EQUIPMENT
─────────              ─────────
24 active              8 available
3 low stock            1 maintenance
```

Phân chia bằng **hairline dividers** (1px `--border-subtle`), không shadow.

### 5.2 Information Hierarchy

3 mức từ ngoài vào trong:

1. **Page level**: Title (text-3xl) + meta (text-sm tertiary)
2. **Section level**: Label uppercase (text-xs wide tracking) + content
3. **Item level**: Primary data (mono lg) + supporting (sm secondary)

### 5.3 Density Modes

User toggle `Compact` / `Comfortable`:
- **Compact**: row height 36px, font sm
- **Comfortable** (default): row height 44px, font base

### 5.4 White Space Discipline

White space là tool, không phải decoration. Quy tắc:
- Giữa sections: `space-8` (32px)
- Giữa items: `space-3` (12px)
- Trong item: `space-2` (8px)
- **Không** dùng `space-12+` trừ landing/empty states

---

## 6. Components

### 6.1 Buttons

**Primary** (1 trên screen):
```css
background: var(--accent);
color: white;
height: var(--h-button);
padding: 0 var(--space-4);
border-radius: var(--radius-md);
font-weight: var(--weight-medium);
```

**Secondary**:
```css
background: var(--bg-elevated);
color: var(--text-primary);
border: 1px solid var(--border-default);
```

**Ghost** (most common):
```css
background: transparent;
color: var(--text-secondary);
hover: background var(--bg-elevated);
```

**No "outline" button**. No "rounded-full" button trừ avatar.

### 6.2 Inputs

```css
background: var(--bg-surface);
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
height: var(--h-input);
focus-border: var(--accent);
focus-ring: 2px var(--accent-subtle);
```

Label trên input, không inline placeholder cho field quan trọng.

### 6.3 Tables

Dense table (info-first):
- Row height: 44px
- Cell padding: `var(--space-3) var(--space-4)`
- Hover row: `var(--bg-elevated)`
- Sort indicator: subtle arrow (text-tertiary)
- Column resize: drag handle 4px wide, hidden until hover
- Sticky header on scroll

### 6.4 Cards (rare use cases only)

Khi nào dùng card:
- ✅ Empty states
- ✅ Stat groupings có border-left status
- ❌ Container của tất cả mọi thứ

### 6.5 Sidebar (left nav)

```
┌─────────────────────┐
│  LabBook BKU   [⚡]  │ ← logo + role badge
├─────────────────────┤
│  ⌘K  Search...      │ ← command palette trigger
├─────────────────────┤
│ MAIN                │ ← uppercase wide label
│  · Dashboard        │
│  · Experiments      │
│  · Chemicals        │
│  · Equipment        │
│  · Bookings         │
│                     │
│ DATA                │
│  · Members          │
│  · History          │
│                     │
│ AI [superadmin]     │ ← role-gated section
│  · Chat             │
│  · Workbench        │
│    · Spectrum       │
│    · Papers         │
│    · Materials      │
│    · DFT            │
│    · Writer         │
└─────────────────────┘
```

### 6.6 Right Sidetab (AI Chat — slide-out)

```
┌──────────────────────────┐
│ AI Assistant     [─][×]  │
├──────────────────────────┤
│ Mode: ⚡Tier 1  ⚙️Tier 2  │
│       🧠Tier 3           │
├──────────────────────────┤
│  [conversation flow]     │
│                          │
│  💬 You: ...             │
│                          │
│  🤖 AI: ...              │
│     [citation: chunk_42] │
│     [👍 👎 📋 🔗]         │
│                          │
├──────────────────────────┤
│ [📎] [🎙] Type message... │
└──────────────────────────┘
```

Width: 380px desktop, 100vw mobile.
Slide animation: 200ms ease-out.
Toggle key: `⌘ + Shift + A` (or `⌘J` like Cursor).

---

## 7. Iconography

### 7.1 Icon Library

**Lucide Icons** — open source, consistent stroke 1.5px, scientific-friendly.

Replace current icons với Lucide variants:
- Dashboard → `LayoutDashboard`
- Experiments → `FlaskConical`
- Chemicals → `TestTube2`
- Equipment → `CircuitBoard`
- Bookings → `CalendarRange`
- Members → `Users`
- History → `History`
- AI Chat → `Sparkles` (subtle, không quá flashy)
- Spectrum → `LineChart`
- Papers → `BookOpen`
- Materials DB → `Atom`
- DFT → `Boxes`
- Writer → `PenTool`

### 7.2 Icon Sizes

```css
--icon-xs: 14px;  /* inline với text-sm */
--icon-sm: 16px;  /* default UI */
--icon-md: 20px;  /* primary actions */
--icon-lg: 24px;  /* page headers */
--icon-xl: 32px;  /* feature highlights */
```

Stroke width: **1.5px** (Lucide default) — không 2px (quá đậm), không 1px (quá mỏng).

### 7.3 Status Icons

Status không icon riêng — dùng dot indicator 6px:
```
● Active (success)
● Pending (warning)
● Error
○ Disabled
```

---

## 8. Motion & Animation

### 8.1 Duration Scale

```css
--duration-instant: 100ms;  /* hover, focus */
--duration-fast:    200ms;  /* slide-out, modal */
--duration-normal:  300ms;  /* page transition */
--duration-slow:    500ms;  /* loading, complex */
```

### 8.2 Easing

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);     /* default */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);    /* symmetric */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* playful */
```

### 8.3 Loading States — "Spectrum Wave"

Replace generic spinner bằng **animated wave** giống Raman/IR scan:

```
∿∿∿∿∿∿∿∿∿
```

SVG path animation, accent color, 1500ms loop. **Identity riêng cho lab vật liệu**.

### 8.4 No Bounce, No Flashy

- ❌ Bounce easing
- ❌ Pulse rings around buttons
- ❌ Confetti success
- ✅ Subtle fade + slight slide
- ✅ Functional micro-feedback (button press 100ms scale 0.98)

---

## 9. Special Patterns

### 9.1 Command Palette (⌘K)

Press anywhere → modal at top:

```
┌─────────────────────────────────────┐
│  ⌘K  Search anything...             │
├─────────────────────────────────────┤
│  RECENT                             │
│  · Exp #042 (WS₂ QDs)               │
│  · L-Cysteine                       │
│                                     │
│  ACTIONS                            │
│  · New experiment    ⌘N             │
│  · Book equipment    ⌘B             │
│  · Ask AI            ⌘J             │
│                                     │
│  PAGES                              │
│  · Dashboard                        │
│  · Chemicals                        │
└─────────────────────────────────────┘
```

Fuzzy search across: pages, experiments, chemicals, equipment, members, AI history.

### 9.2 Lab Mode (F key fullscreen)

Press `F` → enter Lab Mode:
- Hide all nav
- Single experiment focus
- Voice button always visible
- ESC to exit

Use case: đang đeo găng trong lab, dùng voice + minimal click.

### 9.3 Inline Editing

Mọi field có thể edit inline (click → type → Enter to save). Không modal cho 80% cases.

Example:
```
Stock: [2.3 g]  ← click number directly to edit
       ▲ click here, type 2.5, Enter
```

### 9.4 Smart Empty States

Empty state phải **actionable**:

```
TRƯỚC:
"No experiments yet"

SAU:
"No experiments yet"
[+ Create first experiment]   [Import from Excel]   [Watch tutorial]
```

### 9.5 Provenance Display (AI-specific)

Khi AI trả lời, show chain dưới message:

```
🤖 Eg = 3.05 eV của WS₂/WO₃ chủ yếu từ WO₃...

──────────────────────────────────
Reasoning chain (5 steps · 2.3s)  [▼ expand]
Sources:
  📄 Park 2023, p.4    [view]
  📄 Liu 2021, p.7     [view]
  🧪 Lab Exp #042      [open]
Confidence: ●●●●○ High
──────────────────────────────────
[👍] [👎]  [📋 copy]  [🔗 share]  [✓ verify]
```

---

## 10. Accessibility

### 10.1 Color Contrast

- Text on bg-base: ≥ 7:1 (WCAG AAA)
- Text on bg-surface: ≥ 4.5:1 (WCAG AA)
- Accent on bg: ≥ 4.5:1
- Focus rings: ≥ 3:1 against adjacent

### 10.2 Keyboard

- All interactions keyboard accessible
- Tab order logical
- Focus visible (2px ring accent-subtle)
- Skip-to-main link
- Escape closes modals/drawers

### 10.3 Screen Reader

- Semantic HTML (no div-soup)
- ARIA labels for icon-only buttons
- Live regions for AI streaming responses
- Announce loading/error states

### 10.4 Reduced Motion

Respect `prefers-reduced-motion`:
- Disable spectrum-wave loaders → static dots
- Disable slide animations → instant
- Keep functional micro-feedback (button press)

---

## 11. Light Mode (Phase 2)

Dark mode **default**. Light mode added later:

```css
[data-theme="light"] {
  --bg-base:       #FAFAFA;
  --bg-surface:    #FFFFFF;
  --bg-elevated:   #F4F4F5;
  --bg-overlay:    #FFFFFF;

  --border-subtle: #E4E4E7;
  --border-default:#D4D4D8;
  --border-strong: #A1A1AA;

  --text-primary:   rgba(0, 0, 0, 0.95);
  --text-secondary: rgba(0, 0, 0, 0.70);
  --text-tertiary:  rgba(0, 0, 0, 0.45);

  --accent:        #0891B2;  /* slightly darker for contrast */
  --accent-subtle: rgba(8, 145, 178, 0.08);
}
```

---

## 12. Anti-patterns (Things We DON'T Do)

❌ **Gradient backgrounds on cards** — flashy, dates quickly
❌ **Icon for every label** — visual noise
❌ **More than 3 font weights per page** — chaos
❌ **Drop shadows for separation** — use borders
❌ **Card-in-card-in-card** — flat hierarchy preferred
❌ **Modal for everything** — inline edit when possible
❌ **Toast spam** — only confirm important async actions
❌ **Loading overlay for entire screen** — partial loaders only
❌ **"Glassmorphism" / blur** — performance + clarity issues
❌ **Auto-playing animations** — distraction, accessibility issue

---

## 13. Implementation Priority

### Phase 1 — Tokens & Foundation (3-5 rounds)
- [ ] CSS custom properties cho all tokens
- [ ] Typography — Inter + JetBrains Mono setup
- [ ] Refactor existing colors to use tokens
- [ ] Spacing audit + fix inconsistencies

### Phase 2 — Layout Restructure (5-7 rounds)
- [ ] Dashboard: card grid → divided sections
- [ ] Sidebar: redesign with sections
- [ ] Command palette implementation
- [ ] Right sidetab AI shell

### Phase 3 — Polish (3-5 rounds)
- [ ] Lab Mode (F key)
- [ ] Spectrum-wave loader
- [ ] Lucide icons migration
- [ ] Empty states refresh
- [ ] Inline editing patterns

### Phase 4 — Light Mode (2-3 rounds)
- [ ] Light mode tokens
- [ ] Theme toggle UX
- [ ] Test contrast all components

---

## 14. References & Inspiration

- **Linear** ([linear.app](https://linear.app)) — density, command palette, keyboard-first
- **GitHub Primer** ([primer.style](https://primer.style)) — functional, accessible
- **Vercel Design** ([vercel.com](https://vercel.com)) — restraint, typography
- **Arc browser** — clever interactions, command-driven
- **Origin Lab / MATLAB** — chart-first scientific feel

---

## 15. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-07 | Cyan #06B6D4 as accent | Vibe scientific instrument; tương phản dark mode |
| 2026-05-07 | JetBrains Mono cho numerical | Mắt scan dễ, alignment, technical feel |
| 2026-05-07 | Anti-card doctrine | Information density priority |
| 2026-05-07 | Lucide icon library | Consistent stroke, scientific-friendly |
| 2026-05-07 | Dark mode default | Lab work often low-light; eye fatigue |

---

*This is a living document. Update with each design decision.*
