/**
 * labbook-extensions.js
 * Module mở rộng cho LabBook — thêm vào src/js/
 * Bao gồm:
 *   1. Xuất Excel (SheetJS CDN)
 *   2. Charts nâng cao Dashboard (Chart.js CDN)
 *   3. AI phân tích kết quả điện hóa (Claude API)
 *
 * Cách tích hợp:
 *   - Thêm vào index.html: <script type="module" src="/src/js/labbook-extensions.js"></script>
 *   - Hoặc import vào main.js: import './labbook-extensions.js'
 */


function chartOptions(extra = {}) {
  return {
    responsive: true,
    plugins: {
      legend: { display: true, position: 'top', labels: { font: { size: 12 }, color: '#475569', boxWidth: 12, usePointStyle: true } },
      ...extra
    },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } }, beginAtZero: true }
    },
    animation: { duration: 600 }
  };
}

function getLast12Months() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return `T${d.getMonth()+1}/${String(d.getFullYear()).slice(2)}`;
  });
}

function countByMonth(items, n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return items.filter(x => (x.date ?? '').startsWith(ym)).length;
  });
}

function injectChartContainer(id, title, height = 260) {
  // Tìm hoặc tạo container trong dashboard
  let wrap = document.getElementById(id + '-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = id + '-wrap';
    wrap.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06)';
    wrap.innerHTML = `<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:14px">${title}</div><canvas id="${id}" style="max-height:${height}px"></canvas>`;

    // Chèn vào dashboard section
    const dashMain = document.querySelector('#page-dashboard');
    if (dashMain) dashMain.appendChild(wrap);
  }
}


// ═══════════════════════════════════════════════════════════════
// 3. AI PHÂN TÍCH KẾT QUẢ ĐIỆN HÓA
// ═══════════════════════════════════════════════════════════════

/**
 * Phân tích một bản ghi điện hóa bằng Claude AI
 * @param {Object} ecData - object dữ liệu điện hóa
 */
const SUPERADMIN_EMAIL = 'nvhn.7202@gmail.com';

window.analyzeElectrochemAI = async function(ecData) {
  // Lấy email từ Firebase Auth trực tiếp qua window
  const currentUid = window.__currentUserUid || '';
  const superUid = window.__superAdminUid || '';
  if (!currentUid || !superUid || currentUid !== superUid) {
    showToast('Tính năng AI chỉ dành cho Superadmin!', 'danger');
    return;
  }
  ensureAIModal();
  openAIModal(ecData);
};

function ensureAIModal() {
  if (document.getElementById('modal-ai-analysis')) return;

  const html = `
  <div class="modal-overlay" id="modal-ai-analysis" style="z-index:10000">
    <div class="modal" style="max-width:780px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title" style="display:flex;align-items:center;gap:8px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span id="ai-modal-title">Phân tích AI</span>
        </div>
        <button class="modal-close" onclick="closeModal('modal-ai-analysis')">✕</button>
      </div>

      <div id="ai-data-summary" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px;font-size:13px"></div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="window.runAIAnalysis('standard')" style="gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Phân tích tổng quan
        </button>
        <button class="btn" onclick="window.runAIAnalysis('compare')" style="gap:6px">
          📊 So sánh tài liệu
        </button>
        <button class="btn" onclick="window.runAIAnalysis('suggest')" style="gap:6px">
          💡 Đề xuất cải thiện
        </button>
        <button class="btn" onclick="window.runAIAnalysis('report')" style="gap:6px">
          📄 Soạn đoạn kết quả
        </button>
      </div>

      <div id="ai-output" style="min-height:120px;background:var(--teal-light);border:1px solid var(--teal-3);border-radius:10px;padding:18px;font-size:13.5px;line-height:1.7;color:#0f172a;white-space:pre-wrap;font-family:'Inter',sans-serif">
        <span style="color:#64748b">Chọn loại phân tích ở trên để bắt đầu...</span>
      </div>

      <div id="ai-loading" style="display:none;padding:16px;text-align:center;color:var(--teal);font-size:13px">
        <div class="spinner" style="display:inline-block;margin-right:8px"></div>Claude đang phân tích...
      </div>

      <div class="modal-footer" style="margin-top:12px">
        <button class="btn" onclick="closeModal('modal-ai-analysis')">Đóng</button>
        <button class="btn btn-primary" onclick="window.copyAIOutput()" style="gap:6px">
          📋 Sao chép kết quả
        </button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('modal-ai-analysis').addEventListener('click', e => {
    if (e.target.id === 'modal-ai-analysis') window.closeModal('modal-ai-analysis');
  });
}

let _currentEcData = null;

function openAIModal(ecData) {
  _currentEcData = ecData;

  const title = document.getElementById('ai-modal-title');
  if (title) title.textContent = `Phân tích AI — ${ecData.code ?? 'Kết quả điện hóa'}`;

  // Hiển thị tóm tắt dữ liệu
  const summary = document.getElementById('ai-data-summary');
  if (summary) {
    summary.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${renderKV('Mã đo', ecData.code)}
        ${renderKV('Loại phép đo', ecData.type)}
        ${renderKV('Phản ứng', ecData.reaction)}
        ${renderKV('Điện cực', ecData.electrode)}
        ${renderKV('Dung dịch', ecData.electrolyte)}
        ${renderKV('η@10 mA/cm²', ecData.eta10 ? ecData.eta10 + ' mV' : '—')}
        ${renderKV('Tafel slope', ecData.tafel ? ecData.tafel + ' mV/dec' : '—')}
        ${renderKV('j₀', ecData.j0 ? ecData.j0 + ' mA/cm²' : '—')}
        ${renderKV('Rs / Rct', ecData.rs || ecData.rct ? `${ecData.rs??'—'}Ω / ${ecData.rct??'—'}Ω` : '—')}
        ${renderKV('ECSA', ecData.ecsa ? ecData.ecsa + ' cm²' : '—')}
      </div>`;
  }

  // Reset output
  const out = document.getElementById('ai-output');
  if (out) out.innerHTML = '<span style="color:#64748b">Chọn loại phân tích ở trên để bắt đầu...</span>';

  window.openModal('modal-ai-analysis');
}

function renderKV(k, v) {
  return `<div style="padding:8px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">
    <div style="font-size:11px;color:#64748b;margin-bottom:2px">${k}</div>
    <div style="font-size:13px;font-weight:600;color:#0f172a">${v ?? '—'}</div>
  </div>`;
}

const AI_PROMPTS = {
  standard: (d) => `Bạn là chuyên gia điện hóa học. Hãy phân tích kết quả thí nghiệm điện hóa sau đây bằng tiếng Việt, súc tích và chính xác về mặt khoa học:

**Thông tin thí nghiệm:**
- Mã đo: ${d.code ?? 'N/A'}
- Loại phép đo: ${d.type ?? 'N/A'} | Phản ứng: ${d.reaction ?? 'N/A'}
- Điện cực: ${d.electrode ?? 'N/A'} | Nền ĐC: ${d.substrate ?? 'N/A'}
- Dung dịch điện ly: ${d.electrolyte ?? 'N/A'} | Điện cực RE: ${d.re ?? 'N/A'}

**Kết quả đo:**
- Overpotential η@10 mA/cm²: ${d.eta10 ?? 'N/A'} mV
- Tafel slope: ${d.tafel ?? 'N/A'} mV/dec
- Exchange current density j₀: ${d.j0 ?? 'N/A'} mA/cm²
- Rs (điện trở dung dịch từ EIS): ${d.rs ?? 'N/A'} Ω
- Rct (điện trở chuyển điện tích): ${d.rct ?? 'N/A'} Ω
- ECSA: ${d.ecsa ?? 'N/A'} cm²
- iR compensation: ${d.ir ?? 'N/A'}%

Hãy phân tích:
1. **Đánh giá hoạt tính xúc tác**: η@10 có tốt không so với benchmark?
2. **Cơ chế phản ứng** từ Tafel slope (Volmer, Heyrovsky, Tafel?)?
3. **Tính ổn định và truyền khối** từ EIS (Rs, Rct)?
4. **ECSA** - diện tích hoạt động thực sự?
5. **Kết luận ngắn gọn** về chất lượng điện cực.`,

  compare: (d) => `Bạn là chuyên gia điện hóa học. Hãy so sánh kết quả sau với các giá trị benchmark trong tài liệu cho phản ứng ${d.reaction ?? 'HER'}:

**Kết quả của mẫu nghiên cứu:**
- η@10 mA/cm² = ${d.eta10 ?? 'N/A'} mV
- Tafel slope = ${d.tafel ?? 'N/A'} mV/dec  
- j₀ = ${d.j0 ?? 'N/A'} mA/cm²
- Rct = ${d.rct ?? 'N/A'} Ω
- ECSA = ${d.ecsa ?? 'N/A'} cm²
- Dung dịch: ${d.electrolyte ?? 'N/A'}

Hãy trả lời bằng tiếng Việt:
1. **So sánh với Pt/C** (vật liệu benchmark) về từng thông số
2. **Xếp hạng** (xuất sắc/tốt/trung bình/cần cải thiện) từng chỉ số
3. **3-5 bài báo tương tự** bạn biết và giá trị của họ (chỉ nêu giá trị, không bịa DOI)
4. **Vị trí** của mẫu này trong bức tranh nghiên cứu chung`,

  suggest: (d) => `Bạn là chuyên gia điện hóa học. Dựa trên kết quả điện hóa sau, hãy đề xuất hướng cải thiện:

**Kết quả hiện tại:**
- η@10 = ${d.eta10 ?? 'N/A'} mV | Tafel = ${d.tafel ?? 'N/A'} mV/dec
- Rct = ${d.rct ?? 'N/A'} Ω | ECSA = ${d.ecsa ?? 'N/A'} cm²
- Phản ứng: ${d.reaction ?? 'N/A'} | Điện cực: ${d.electrode ?? 'N/A'}
- Vật liệu: ${d.material ?? d.electrode ?? 'N/A'}

Trả lời bằng tiếng Việt, cho **5 đề xuất cụ thể và khả thi**:
1. Về **vật liệu và tổng hợp** (cải thiện hoạt tính)
2. Về **chế tạo điện cực** (nâng ECSA, giảm Rct)
3. Về **điều kiện đo** (tối ưu protocol)
4. Về **doping/biến đổi bề mặt** phù hợp với ${d.reaction ?? 'HER'}
5. Về **hướng nghiên cứu tiếp theo** để publish`,

  report: (d) => `Bạn là chuyên gia điện hóa học và viết bài khoa học. Hãy soạn một **đoạn kết quả** (Results section) bằng tiếng Anh theo phong cách bài báo khoa học, dựa trên dữ liệu sau:

**Dữ liệu:**
- Electrode material: ${d.material ?? d.electrode ?? 'the catalyst'}
- Reaction: ${d.reaction ?? 'HER'} in ${d.electrolyte ?? '0.5M H₂SO₄'}
- η@10 mA/cm² = ${d.eta10 ?? 'N/A'} mV (iR-corrected: ${d.ir ?? 'N/A'}%)
- Tafel slope = ${d.tafel ?? 'N/A'} mV/dec
- Exchange current density j₀ = ${d.j0 ?? 'N/A'} mA/cm²
- Rs = ${d.rs ?? 'N/A'} Ω, Rct = ${d.rct ?? 'N/A'} Ω (from EIS)
- ECSA = ${d.ecsa ?? 'N/A'} cm²
- Measurement type: ${d.type ?? 'LSV'}

Write 2-3 paragraphs (150-220 words total) in proper academic English:
- Paragraph 1: LSV/CV results and overpotential
- Paragraph 2: Kinetics from Tafel analysis
- Paragraph 3: EIS and ECSA interpretation

Use passive voice, past tense. Do not fabricate data not provided.`
};

window.runAIAnalysis = async function(mode) {
  if (!_currentEcData) return;

  const out = document.getElementById('ai-output');
  const loading = document.getElementById('ai-loading');
  if (out) out.innerHTML = '';
  if (loading) loading.style.display = 'block';

  const prompt = AI_PROMPTS[mode]?.(_currentEcData) ?? AI_PROMPTS.standard(_currentEcData);

  try {
    const apiKey = import.meta.env?.VITE_ANTHROPIC_KEY || '';
    if (!apiKey) {
      throw new Error('Chưa cấu hình VITE_ANTHROPIC_KEY trong file .env');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (loading) loading.style.display = 'none';

    if (data.content?.[0]?.text) {
      const text = data.content[0].text;
      if (out) {
        out.innerHTML = formatAIOutput(text);
      }
      showToast('Phân tích hoàn tất!', 'success');
    } else {
      throw new Error(data.error?.message ?? 'Lỗi API');
    }
  } catch(err) {
    if (loading) loading.style.display = 'none';
    if (out) out.innerHTML = `<span style="color:#dc2626">❌ Lỗi: ${err.message}</span>`;
    showToast('Lỗi phân tích AI: ' + err.message, 'danger');
  }
};

function formatAIOutput(text) {
  // Chuyển markdown cơ bản thành HTML
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;color:var(--teal);margin:16px 0 6px">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;color:#0f172a;margin:12px 0 4px">$1</h4>')
    .replace(/^\d+\. (.+)$/gm, '<div style="margin:5px 0;padding-left:4px">$&</div>')
    .replace(/^- (.+)$/gm, '<div style="margin:4px 0;padding-left:12px">• $1</div>')
    .replace(/\n\n/g, '<br><br>');
}

window.copyAIOutput = function() {
  const out = document.getElementById('ai-output');
  if (!out) return;
  const text = out.innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Đã sao chép!', 'success'));
};


// ═══════════════════════════════════════════════════════════════
// 4. INJECT BUTTONS VÀO UI HIỆN CÓ
// ═══════════════════════════════════════════════════════════════

/**
 * Thêm nút xuất Excel vào từng trang khi DOM sẵn sàng
 */
function injectExportButtons() {
  // Nút đã được thêm tĩnh vào index.html — không inject động nữa
}

function createExportBtn(id, label, onClick) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = 'btn';
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-weight:500';
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Xuất Excel`;
  btn.onclick = onClick;
  return btn;
}

/**
 * Thêm nút AI vào mỗi row trong bảng điện hóa
 * Gọi sau khi render bảng
 */
window.injectAIButtonsToElectrochemTable = function(cache) {
  const tbody = document.getElementById('electrochem-tbody');
  if (!tbody) return;
  tbody.querySelectorAll('tr[data-key]').forEach(tr => {
    const key = tr.dataset.key;
    if (!key || tr.querySelector('.btn-ai')) return;
    const ecData = (cache.electrochem ?? {})[key];
    if (!ecData) return;

    // Tìm td action cuối
    const lastTd = tr.querySelector('td:last-child');
    if (!lastTd) return;

    const aiBtn = document.createElement('button');
    aiBtn.className = 'btn btn-xs btn-ai';
    aiBtn.title = 'Phân tích AI';
    aiBtn.style.cssText = 'background:linear-gradient(135deg,var(--teal),var(--teal-2));color:white;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;margin-left:4px';
    aiBtn.innerHTML = '🤖 AI';
    aiBtn.onclick = (e) => { e.stopPropagation(); window.analyzeElectrochemAI({ ...ecData, _key: key }); };
    lastTd.appendChild(aiBtn);
  });
};

// ═══════════════════════════════════════════════════════════════
// 5. HOOK VÀO RENDER CYCLE HIỆN CÓ
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 5. HOOK — chờ renderAll sẵn sàng rồi mới override
// ═══════════════════════════════════════════════════════════════

function _extOnRender() {
  // Sync cache từ window.cache (được define trong main.js)
  if (window.cache) {
    window.__labCache = window.cache;
    window.__eqGroups = window.cacheEqGroups ?? {};
  }

  // Inject nút Export
  injectExportButtons();

  // Render charts nếu đang ở Dashboard
  const dashPage = document.getElementById('page-dashboard');
  if (dashPage?.classList.contains('active') && window.__labCache) {
    clearTimeout(window._chartDebounce);
    window._chartDebounce = setTimeout(() => {
      window.renderDashboardCharts(window.__labCache);
    }, 400);
  }

  // Inject nút AI vào bảng điện hóa
  if (window.__labCache) {
    setTimeout(() => window.injectAIButtonsToElectrochemTable(window.__labCache), 200);
  }
}

// Dùng Object.defineProperty để bắt được khi window.renderAll được gán
let _hooked = false;
function _tryHook() {
  if (_hooked) return;
  if (typeof window.renderAll === 'function') {
    _hooked = true;
    const _orig = window.renderAll;
    window.renderAll = function(...args) {
      _orig(...args);
      _extOnRender();
    };

    // Hook showPage
    if (typeof window.showPage === 'function') {
      const _origShow = window.showPage;
      window.showPage = function(id, el) {
        _origShow(id, el);
        if (id === 'dashboard' && window.__labCache) {
          clearTimeout(window._chartDebounce);
          window._chartDebounce = setTimeout(() => {
            window.renderDashboardCharts(window.__labCache);
          }, 300);
        }
        // Inject buttons khi chuyển trang
        setTimeout(injectExportButtons, 100);
      };
    }

    console.log('[LabBook Extensions] ✅ Hook thành công vào renderAll');

    // Chạy ngay lần đầu nếu cache đã có sẵn
    setTimeout(_extOnRender, 300);
  }
}

// Thử hook ngay, nếu chưa được thì poll mỗi 200ms tối đa 15 giây
_tryHook();
const _hookInterval = setInterval(() => {
  _tryHook();
  if (_hooked) clearInterval(_hookInterval);
}, 200);
setTimeout(() => clearInterval(_hookInterval), 15000);

console.log('[LabBook Extensions] ✅ Module loaded — Excel Export + Charts + AI Analysis');


