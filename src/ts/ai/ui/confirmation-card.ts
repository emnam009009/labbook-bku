/**
 * Confirmation Card — Round 115b
 *
 * Renders a UI card cho action draft (createExperiment, updateChemicalStock,
 * createBooking) inline trong assistant bubble.
 *
 * Workflow:
 *   1. AI tool returns draft JSON
 *   2. gemini-client embeds <!--AI_DRAFT:base64--> marker trong stream text
 *   3. message-bubble pre-processes marker → renders <div class="ai-confirm-card">
 *   4. After bubble mount, hydrateConfirmationCards() upgrades placeholders với full UI
 *   5. User clicks "Xác nhận" → POST /confirmAction → update card state
 */
// @ts-nocheck

interface DraftPreview {
  code?: string;
  date?: string;
  person?: string;
  fields?: Record<string, any>;
  // Chemical-specific
  chemicalName?: string;
  field?: string;
  oldValue?: number;
  newValue?: number;
  delta?: number;
  unit?: string;
  reason?: string;
  // Booking-specific
  equipmentName?: string;
  startTime?: string;
  endTime?: string;
  purpose?: string;
  userName?: string;
}

interface ActionDraft {
  type: "experiment-draft" | "chemical-stock-draft" | "booking-draft";
  draftId: string;
  category?: "hydro" | "electrochem";
  preview: DraftPreview;
  payload: Record<string, any>;
  targetPath: string;
}

const CONFIRM_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/confirmAction";

/**
 * Render confirmation card HTML từ draft data.
 * This is a STATIC initial render — interactive behavior added by hydrate().
 */
export function renderConfirmationCardHTML(draft: ActionDraft): string {
  const draftB64 = btoa(unescape(encodeURIComponent(JSON.stringify(draft))));

  let title = "Xác nhận hành động";
  let icon = "📝";

  if (draft.type === "experiment-draft") {
    if (draft.category === "hydro") {
      title = "Tạo thí nghiệm Thủy nhiệt";
      icon = "🧪";
    } else {
      title = "Tạo phép đo Điện hóa";
      icon = "⚡";
    }
  } else if (draft.type === "chemical-stock-draft") {
    title = "Cập nhật tồn kho hóa chất";
    icon = "📦";
  } else if (draft.type === "booking-draft") {
    title = "Đặt lịch thiết bị";
    icon = "📅";
  }

  // Build body content based on draft type
  let bodyHtml = "";

  if (draft.type === "experiment-draft") {
    const meta = [
      draft.preview.code && `<div><strong>Mã:</strong> ${esc(draft.preview.code)}</div>`,
      draft.preview.date && `<div><strong>Ngày:</strong> ${esc(draft.preview.date)}</div>`,
      draft.preview.person && `<div><strong>Người làm:</strong> ${esc(draft.preview.person)}</div>`,
    ]
      .filter(Boolean)
      .join("");

    const fields = Object.entries(draft.preview.fields || {})
      .map(
        ([k, v]) =>
          `<div class="ai-confirm-card__field">
             <span class="ai-confirm-card__label">${esc(k)}:</span>
             <span class="ai-confirm-card__value">${esc(String(v))}</span>
           </div>`
      )
      .join("");

    bodyHtml = `
      <div class="ai-confirm-card__meta">${meta}</div>
      <div class="ai-confirm-card__fields">${fields}</div>
    `;
  } else if (draft.type === "chemical-stock-draft") {
    const p = draft.preview;
    const sign = (p.delta || 0) >= 0 ? "+" : "";
    bodyHtml = `
      <div class="ai-confirm-card__meta">
        <div><strong>Hóa chất:</strong> ${esc(p.chemicalName || "")}</div>
        <div><strong>Field:</strong> ${esc(p.field || "stock")}</div>
      </div>
      <div class="ai-confirm-card__stock-change">
        <span class="ai-confirm-card__old">${p.oldValue ?? 0} ${esc(p.unit || "")}</span>
        <span class="ai-confirm-card__arrow">→</span>
        <span class="ai-confirm-card__new">${p.newValue ?? 0} ${esc(p.unit || "")}</span>
        <span class="ai-confirm-card__delta">(${sign}${p.delta ?? 0})</span>
      </div>
      ${p.reason ? `<div class="ai-confirm-card__reason"><em>Lý do: ${esc(p.reason)}</em></div>` : ""}
    `;
  } else if (draft.type === "booking-draft") {
    const p = draft.preview;
    bodyHtml = `
      <div class="ai-confirm-card__meta">
        <div><strong>Mã:</strong> ${esc(p.code || "")}</div>
        <div><strong>Người đặt:</strong> ${esc(p.userName || "")}</div>
      </div>
      <div class="ai-confirm-card__fields">
        <div class="ai-confirm-card__field">
          <span class="ai-confirm-card__label">Thiết bị:</span>
          <span class="ai-confirm-card__value">${esc(p.equipmentName || "")}</span>
        </div>
        <div class="ai-confirm-card__field">
          <span class="ai-confirm-card__label">Ngày:</span>
          <span class="ai-confirm-card__value">${esc(p.date || "")}</span>
        </div>
        <div class="ai-confirm-card__field">
          <span class="ai-confirm-card__label">Thời gian:</span>
          <span class="ai-confirm-card__value">${esc(p.startTime || "")} - ${esc(p.endTime || "")}</span>
        </div>
        ${p.purpose ? `<div class="ai-confirm-card__field">
          <span class="ai-confirm-card__label">Mục đích:</span>
          <span class="ai-confirm-card__value">${esc(p.purpose)}</span>
        </div>` : ""}
      </div>
    `;
  }

  return `
    <div class="ai-confirm-card" data-draft-id="${esc(draft.draftId)}" data-draft-b64="${draftB64}" data-state="pending">
      <div class="ai-confirm-card__header">
        <span class="ai-confirm-card__icon">${icon}</span>
        <span class="ai-confirm-card__title">${esc(title)}</span>
      </div>
      <div class="ai-confirm-card__body">
        ${bodyHtml}
      </div>
      <div class="ai-confirm-card__actions">
        <button type="button" class="ai-confirm-card__btn ai-confirm-card__btn--cancel" data-action="ai-cancel-action" data-draft-id="${esc(draft.draftId)}">
          ✗ Hủy
        </button>
        <button type="button" class="ai-confirm-card__btn ai-confirm-card__btn--confirm" data-action="ai-confirm-action" data-draft-id="${esc(draft.draftId)}">
          ✓ Xác nhận
        </button>
      </div>
      <div class="ai-confirm-card__result" style="display:none;"></div>
    </div>
  `;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pre-process text: replace <!--AI_DRAFT:base64--> markers với confirmation card HTML.
 * Called BEFORE markdown render trong message-bubble.
 */
export function preprocessDraftMarkers(text: string): string {
  if (!text || !text.includes("AI_DRAFT:")) return text;

  return text.replace(/<!--AI_DRAFT:([A-Za-z0-9+/=]+)-->/g, (_match, b64) => {
    try {
      const json = decodeURIComponent(escape(atob(b64)));
      const draft = JSON.parse(json) as ActionDraft;
      return renderConfirmationCardHTML(draft);
    } catch (e) {
      console.warn("[confirm-card] Failed to parse draft marker:", e);
      return "";
    }
  });
}

/**
 * Handler: User clicks "Xác nhận" — POST to /confirmAction.
 */
export async function onConfirmAction(target: HTMLElement): Promise<void> {
  const card = target.closest(".ai-confirm-card") as HTMLElement | null;
  if (!card) return;

  // Already confirmed/cancelled?
  const state = card.dataset.state;
  if (state !== "pending") return;

  const b64 = card.dataset.draftB64;
  if (!b64) {
    showResult(card, "error", "Thiếu draft data");
    return;
  }

  let draft: ActionDraft;
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    draft = JSON.parse(json);
  } catch (e) {
    showResult(card, "error", "Draft data không hợp lệ");
    return;
  }

  // Disable buttons + show loading
  setLoading(card, true);

  try {
    const auth = (window as any).currentAuth;
    if (!auth?.user?.getIdToken) {
      throw new Error("Chưa đăng nhập");
    }
    const idToken = await auth.user.getIdToken();

    const response = await fetch(CONFIRM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(draft),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    // Success
    card.dataset.state = "confirmed";
    showResult(card, "success", data.message || "Đã thực hiện thành công");
  } catch (e: any) {
    console.error("[confirm-action] Error:", e);
    setLoading(card, false);
    showResult(card, "error", e.message || "Lỗi xác nhận");
  }
}

/**
 * Handler: User clicks "Hủy".
 */
export function onCancelAction(target: HTMLElement): void {
  const card = target.closest(".ai-confirm-card") as HTMLElement | null;
  if (!card) return;

  const state = card.dataset.state;
  if (state !== "pending") return;

  card.dataset.state = "cancelled";
  showResult(card, "cancelled", "Đã hủy");
}

function setLoading(card: HTMLElement, loading: boolean): void {
  const buttons = card.querySelectorAll(
    ".ai-confirm-card__btn"
  ) as NodeListOf<HTMLButtonElement>;
  buttons.forEach((b) => (b.disabled = loading));
  if (loading) {
    card.classList.add("ai-confirm-card--loading");
  } else {
    card.classList.remove("ai-confirm-card--loading");
  }
}

function showResult(
  card: HTMLElement,
  type: "success" | "error" | "cancelled",
  message: string
): void {
  // Hide actions buttons (except keep visible for cancelled state to allow re-trigger? No, keep simple)
  const actions = card.querySelector(".ai-confirm-card__actions") as HTMLElement;
  if (actions) actions.style.display = "none";

  const result = card.querySelector(".ai-confirm-card__result") as HTMLElement;
  if (!result) return;

  result.style.display = "block";
  result.className = `ai-confirm-card__result ai-confirm-card__result--${type}`;

  const icon =
    type === "success" ? "✅" : type === "error" ? "⚠️" : "✗";

  result.innerHTML = `<span class="ai-confirm-card__result-icon">${icon}</span> <span>${esc(message)}</span>`;
}

// Expose to window for global delegation
if (typeof window !== "undefined") {
  (window as any).onConfirmAction = onConfirmAction;
  (window as any).onCancelAction = onCancelAction;
}
