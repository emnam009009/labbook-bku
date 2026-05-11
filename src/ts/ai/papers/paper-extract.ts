/**
 * Paper Extract Trigger — Round 133b
 *
 * Gọi Cloud Function chandraProxy để OCR PDF.
 * Auto-trigger sau upload xong (paper-upload.ts).
 * Cũng có thể manual re-trigger từ row action.
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

import { auth } from "../../firebase";
import { showToast } from "../../ui/toast";

const CHANDRA_PROXY_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/chandraProxy";

/**
 * Trigger Chandra extraction cho paperId.
 * Backend tự update RTDB status → frontend listener re-render row.
 *
 * Returns true nếu submit thành công (không phải đợi extract xong).
 */
export async function triggerExtraction(paperId: string, opts?: { silent?: boolean }): Promise<boolean> {
  if (!auth.currentUser) {
    if (!opts?.silent) showToast("Cần đăng nhập để trích xuất", "warn");
    return false;
  }

  try {
    const token = await auth.currentUser.getIdToken();
    if (!opts?.silent) showToast("Đang gửi yêu cầu OCR...", "info");

    // Fire-and-forget pattern: KHÔNG await response
    // (Cloud Function chạy 30s-5min, không nên block UI)
    fetch(CHANDRA_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ paperId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Unknown error" }));
          if (!opts?.silent) {
            showToast(`OCR thất bại: ${errData.error || res.status}`, "danger");
          }
          return;
        }
        const data = await res.json();
        if (data.success) {
          if (!opts?.silent) {
            showToast(`OCR xong: ${data.numPages} trang, ${(data.costCents / 100).toFixed(2)}\u00a2`, "success");
          }
        }
      })
      .catch((e: any) => {
        if (!opts?.silent) {
          showToast(`OCR network error: ${e.message}`, "danger");
        }
      });

    return true;
  } catch (e: any) {
    if (!opts?.silent) showToast(`Auth error: ${e.message}`, "danger");
    return false;
  }
}

/**
 * Re-trigger extraction (từ row action, khi failed)
 */
export async function onPaperReExtract(target: HTMLElement): Promise<void> {
  const paperId = target.dataset.paperId;
  if (!paperId) return;
  if (!confirm("Trích xuất lại paper này?")) return;
  await triggerExtraction(paperId);
}
