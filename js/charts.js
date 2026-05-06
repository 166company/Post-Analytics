// ─── Chart.js Qrafik Modulu ─────────────────────────────────────────────────

let chartByPage = null;
let perPageCharts = []; // Hər səhifə üçün ayrı chart instansiyaları

// ─── Rəng Paletləri ─────────────────────────────────────────────────────────

// ─── Səhifə Adına Görə Rəng Xəritəsi ───────────────────────────────────────
// İstifadəçinin təyin etdiyi rənglər — səhifə adında açar söz axtarılır
const PAGE_COLOR_RULES = [
  { pattern: /yükdaş|yukdas/i,        color: '#FFD700' },  // sarı
  { pattern: /global/i,               color: '#F59E0B' },  // sarı (tünd ton)
  { pattern: /təmizl|temizl/i,        color: '#38BDF8' },  // açıq göy
  { pattern: /xalça|xalca/i,          color: '#1E40AF' },  // tünd göy
  { pattern: /usta/i,                 color: '#F97316' },  // narıncı
  { pattern: /transport/i,            color: '#7C3AED' },  // bənövşəyi
  { pattern: /\btech\b/i,             color: '#1F2937' },  // qara (tünd boz)
  { pattern: /avtocheck/i,            color: '#DC2626' },  // qırmızı
  { pattern: /bağban|bagban/i,        color: '#16A34A' },  // yaşıl
  { pattern: /evakuas/i,              color: '#2563EB' },  // mavi
];

// Ehtiyat palet (adla uyğun gəlmədikdə)
const FALLBACK_COLORS = [
  '#6366F1','#0EA5E9','#14B8A6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#10B981'
];

function getPageColor(name, fallbackIndex = 0) {
  for (const rule of PAGE_COLOR_RULES) {
    if (rule.pattern.test(name)) return rule.color;
  }
  return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
}

// Sabit tip rəngləri (yalnız "Səhifələrə görə" globallegend üçün)
const TYPE_COLORS = {
  reels:    '#E6A000',
  carousel: '#D4740A',
  photo:    '#B85C1A',
  other:    '#c0c5cf'
};

const TYPE_LABELS = {
  reels:    'Reels',
  carousel: 'Carousel',
  photo:    'Single Photo',
  other:    'Digər'
};

// ─── Hex rəng açılması (tonal palitra üçün) ─────────────────────────────────
function _hexToRgb(hex) {
  const h = hex.replace('#','');
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16)
  };
}
function _blend(hex, ratio) {
  const { r, g, b } = _hexToRgb(hex);
  const rr = Math.round(r + (255-r)*ratio);
  const rg = Math.round(g + (255-g)*ratio);
  const rb = Math.round(b + (255-b)*ratio);
  return `#${[rr,rg,rb].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}

// Səhifənin baza rənginə əsasən 3 ton yaradan
// reels = baza, carousel = 30% açıq, photo = 55% açıq
function getPageTypeTones(pageName) {
  const base = getPageColor(pageName, 0);
  return {
    reels:    base,
    carousel: _blend(base, 0.30),
    photo:    _blend(base, 0.55),
    other:    _blend(base, 0.75)
  };
}

// ─── Ümumi Chart Seçimləri (ağ tema) ────────────────────────────────────────
function buildChartOptions(stacked, small = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 550, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e5eb',
        borderWidth: 1,
        titleColor: '#c49b00',
        bodyColor: '#333333',
        padding: 11,
        boxPadding: 5,
        cornerRadius: 8,
        mode: stacked ? 'index' : 'nearest',
        intersect: !stacked,
        callbacks: {
          title: items => items[0] ? items[0].label : '',
          label: item => {
            const v = item.parsed.y;
            if (!v) return null;
            return `  ${item.dataset.label}: ${v} post`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked,
        grid: { color: 'rgba(0,0,0,.06)', drawBorder: false },
        border: { color: '#e2e5eb' },
        ticks: {
          color: '#6b7280',
          font: { family: 'Manrope', size: small ? 10 : 11, weight: '600' },
          maxRotation: 45
        }
      },
      y: {
        stacked,
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,.06)', drawBorder: false },
        border: { color: '#e2e5eb' },
        ticks: {
          color: '#6b7280',
          font: { family: 'JetBrains Mono', size: small ? 10 : 11 },
          stepSize: 1,
          callback: v => Number.isInteger(v) ? v : null
        }
      }
    }
  };
}

// ─── Səhifələrə Görə Qrafik (Grouped Bar) ───────────────────────────────────
// pageData: [{ name, monthly: { "Yan 2025": 5, ... } }]
function renderChartByPage(labels, pageData) {
  const canvas = document.getElementById('chartByPage');
  const empty  = document.getElementById('emptyByPage');

  if (!labels.length || !pageData.length) {
    canvas.style.display = 'none';
    empty.style.display  = 'flex';
    renderLegend('legendByPage', []);
    return;
  }

  canvas.style.display = 'block';
  empty.style.display  = 'none';

  const datasets = pageData.map((pd, i) => {
    const color = getPageColor(pd.name, i);
    return {
      label: pd.name,
      data: labels.map(l => pd.monthly[l] || 0),
      backgroundColor: color + 'bb',
      hoverBackgroundColor: color,
      borderRadius: 5,
      borderSkipped: false,
      borderWidth: 0
    };
  });

  if (chartByPage) { chartByPage.destroy(); chartByPage = null; }

  chartByPage = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: buildChartOptions(false)
  });

  renderLegend('legendByPage', pageData.map((pd, i) => ({
    label: pd.name,
    color: getPageColor(pd.name, i)
  })));
}

// ─── Post Tipinə Görə — Hər Səhifə Üçün Ayrıca ──────────────────────────────
// perPageData: [{ pageId, pageName, types: [{ type, monthly }] }]
function renderChartByType(labels, perPageData) {
  const grid  = document.getElementById('perPageGrid');
  const empty = document.getElementById('emptyByType');

  // Köhnə chartları məhv et
  perPageCharts.forEach(c => c.destroy());
  perPageCharts = [];

  if (!labels.length || !perPageData.length) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    renderLegend('legendByType', []);
    return;
  }

  empty.style.display = 'none';
  grid.style.display  = 'grid';
  grid.innerHTML      = '';

  // Ümumi legend — tip adları, həmin səhifənin tonlarında deyil, sabit rəngdə göstər
  const allTypes = [...new Set(perPageData.flatMap(p => p.types.map(t => t.type)))];
  renderLegend('legendByType', allTypes.map(t => ({
    label: TYPE_LABELS[t] || t,
    color: TYPE_COLORS[t] || '#ccc'
  })));

  // Hər səhifə üçün ayrı kart + chart
  perPageData.forEach(pd => {
    const tones = getPageTypeTones(pd.pageName);
    const pageColor = getPageColor(pd.pageName, 0);

    const card = document.createElement('div');
    card.className = 'page-chart-card';
    card.style.borderTopColor = pageColor;

    const canvasId = `chart-pp-${pd.pageId.replace(/\W/g, '_')}`;

    card.innerHTML = `
      <div class="page-chart-name">${escapeHtml(pd.pageName)}</div>
      <div class="page-chart-canvas-wrap">
        <canvas id="${canvasId}"></canvas>
      </div>
      <div class="page-chart-legend" id="legend-${canvasId}"></div>
    `;
    grid.appendChild(card);

    // Hər tip üçün həmin səhifənin tonal rəngini istifadə et
    const datasets = pd.types.map(td => {
      const color = tones[td.type] || pageColor;
      return {
        label: TYPE_LABELS[td.type] || td.type,
        data: labels.map(l => td.monthly[l] || 0),
        backgroundColor: color + 'dd',
        hoverBackgroundColor: color,
        borderRadius: 3,
        borderSkipped: false,
        borderWidth: 0
      };
    });

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: buildChartOptions(true, true)
    });
    perPageCharts.push(chart);

    // Mini legend — həmin səhifənin tonları ilə
    const legendContainer = document.getElementById(`legend-${canvasId}`);
    if (legendContainer) {
      legendContainer.innerHTML = pd.types.map(td => `
        <div class="legend-item">
          <div class="legend-dot" style="background:${tones[td.type] || pageColor}"></div>
          <span>${TYPE_LABELS[td.type] || td.type}</span>
        </div>
      `).join('');
    }
  });
}

// ─── Legend Render ───────────────────────────────────────────────────────────
function renderLegend(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(item => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${item.color}"></div>
      <span>${escapeHtml(item.label)}</span>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
