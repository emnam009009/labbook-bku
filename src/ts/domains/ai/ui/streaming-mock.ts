/**
 * Mock Streaming — Round 110
 *
 * Fake streaming response để test UI. Sẽ thay bằng Gemini/Claude streaming
 * thật ở Round 111+.
 *
 * @see /AI_ARCHITECTURE.md Section 5
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

const MOCK_RESPONSES = [
  // Phổ XRD response
  `Đây là phân tích sơ bộ phổ XRD của mẫu **WS₂**:

**Các đỉnh chính phát hiện:**

| 2θ (°) | hkl  | d-spacing (Å) | Cường độ |
|--------|------|---------------|----------|
| 14.4   | (002) | 6.18         | 100%     |
| 28.8   | (004) | 3.10         | 22%      |
| 32.7   | (100) | 2.74         | 18%      |
| 39.5   | (103) | 2.28         | 35%      |
| 49.7   | (105) | 1.83         | 12%      |
| 58.4   | (110) | 1.58         | 25%      |

**Đặc điểm cấu trúc:**

- Pha **2H-WS₂** hexagonal (JCPDS 84-1398)
- Đỉnh (002) sắc nét → mẫu có độ kết tinh tốt
- Tỷ lệ I(002)/I(100) = $\\frac{100}{18} \\approx 5.5$ → định hướng ưu tiên theo trục c

**Kích thước hạt (Scherrer):**

$$D = \\frac{K \\lambda}{\\beta \\cos\\theta}$$

Với K=0.9, λ=1.5406 Å, β(FWHM)≈0.45° tại đỉnh (002):

$$D \\approx \\frac{0.9 \\times 1.5406}{0.0079 \\times 0.992} \\approx 17.7 \\text{ nm}$$

**Code Python để fit:**

\`\`\`python
import numpy as np
from scipy.optimize import curve_fit

def gaussian(x, a, x0, sigma, offset):
    return a * np.exp(-(x - x0)**2 / (2 * sigma**2)) + offset

# Fit peak (002)
popt, _ = curve_fit(gaussian, two_theta, intensity, p0=[100, 14.4, 0.2, 5])
fwhm = 2.355 * popt[2]
print(f"FWHM: {fwhm:.3f}°")
\`\`\`

Bạn có muốn tôi phân tích thêm phần nào không?`,

  // Tra cứu hóa chất
  `Đây là kết quả tra cứu cho **Na₂WO₄**:

**Tồn kho:**
- Vị trí: Tủ hóa chất số 2, ngăn B, kệ 3
- Khối lượng còn: **~85 g** (chai gốc 100g)
- Hạn dùng: 12/2027
- Lần dùng gần nhất: 30/04/2026 (5g cho hydrothermal)

**Lưu ý an toàn:**
- Có thể gây kích ứng da/mắt
- Bảo quản nơi khô ráo, kín
- KHÔNG để gần axit mạnh

Bạn cần dùng bao nhiêu? Tôi có thể giúp tính toán stoichiometry nếu cần.`,

  // Default
  `Đây là response mock từ Round 110.

Round 111+ sẽ thay bằng Gemini Flash thật. Hiện tại chỉ test UI rendering.

**Markdown features hỗ trợ:**

- **Bold**, *italic*, ~~strikethrough~~
- \`inline code\`
- [Link](https://example.com)
- Lists:
  - Item 1
  - Item 2
    - Nested
- Code blocks với syntax highlight
- Tables
- Math: $E = mc^2$ và $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

> Blockquote trông như này.

\`\`\`javascript
// Code block
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
\`\`\`

Hỏi gì khác không?`,
];

/** Pick mock response based on user input keywords */
function pickMockResponse(userText: string): string {
  const lower = userText.toLowerCase();
  if (lower.includes("xrd") || lower.includes("phổ") || lower.includes("ws") || lower.includes("đỉnh")) {
    return MOCK_RESPONSES[0];
  }
  if (lower.includes("hóa chất") || lower.includes("na2wo4") || lower.includes("na₂wo₄") || lower.includes("kho")) {
    return MOCK_RESPONSES[1];
  }
  return MOCK_RESPONSES[2];
}

export interface StreamingCallbacks {
  /** Called for each chunk of text */
  onChunk: (accumulated: string) => void;
  /** Called when stream completes */
  onComplete: (fullText: string) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Mock stream a response.
 * Simulates typewriter effect with random delays.
 */
export async function mockStream(
  userText: string,
  callbacks: StreamingCallbacks
): Promise<void> {
  const response = pickMockResponse(userText);

  // Initial delay (simulating LLM "thinking")
  await sleep(800 + Math.random() * 600);

  // Stream char-by-char or word-by-word
  let accumulated = "";
  const chunkSize = 3; // Chars per chunk
  const baseDelay = 15; // ms per chunk

  try {
    for (let i = 0; i < response.length; i += chunkSize) {
      const chunk = response.substring(i, i + chunkSize);
      accumulated += chunk;
      callbacks.onChunk(accumulated);

      // Variable delay (faster for code blocks, slower for math)
      const delay = baseDelay + Math.random() * 20;
      await sleep(delay);
    }

    callbacks.onComplete(accumulated);
  } catch (e) {
    callbacks.onError?.(e as Error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
