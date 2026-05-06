// ─── Əsas Tətbiq Məntiqi ────────────────────────────────────────────────────

const state = {
  posts:              {},
  pageNames:          {},
  pagePhotos:         {},   // { pageId: photoUrl }
  pageTokens:         {},
  igIds:              {},
  igUsernames:        {},
  usernameToPageId:   {},
  managedPages:       [],
  adAccountIds:       [],
  userToken:          '',
  tableData:          [],
  tableSortCol:       'total',
  tableSortDir:       'desc',
  isLoading:          false,
  currentFrom:        null,
  currentTo:          null,
  bgPostIds:          {}
};

const el = id => document.getElementById(id);

const dom = {
  configPanel:         el('configPanel'),
  configToggle:        el('configToggle'),
  accessToken:         el('accessToken'),
  toggleToken:         el('toggleToken'),
  discoverPages:       el('discoverPages'),
  pagesList:           el('pagesList'),
  testConnection:      el('testConnection'),
  tokenSetupView:      el('tokenSetupView'),
  tokenConnectedView:  el('tokenConnectedView'),
  tokenConnectedSub:   el('tokenConnectedSub'),
  tokenStatusBadge:    el('tokenStatusBadge'),
  editToken:           el('editToken'),
  pageSelectorBar:     el('pageSelectorBar'),
  dateFrom:            el('dateFrom'),
  dateTo:              el('dateTo'),
  fetchData:           el('fetchData'),
  loadingOverlay:      el('loadingOverlay'),
  loadingText:         el('loadingText'),
  toastContainer:      el('toastContainer'),
  statTotalPosts:      el('statTotalPosts'),
  statActivePages:     el('statActivePages'),
  statTopPage:         el('statTopPage'),
  statDailyAvg:        el('statDailyAvg'),
  statCollab:          el('statCollab'),
  statsTableBody:      el('statsTableBody'),
  quickBtns:           document.querySelectorAll('.quick-btn'),
  tabs:                document.querySelectorAll('.tab'),
  panels:              document.querySelectorAll('.chart-panel'),
  tableHeaders:        document.querySelectorAll('.stats-table th.sortable')
};

const AZ_MONTHS  = ['Yan','Fev','Mar','Apr','May','İyn','İyl','Avq','Sen','Okt','Noy','Dek'];
const TYPE_ORDER = ['reels', 'carousel', 'photo', 'other'];

// Səhifə adına görə rəng — charts.js-dəki getPageColor ilə eynidir
// app.js da işlədir (cədvəldəki rəngli nöqtə üçün)
const _PAGE_COLOR_RULES = [
  { pattern: /yükdaş|yukdas/i,  color: '#FFD700' },
  { pattern: /global/i,         color: '#F59E0B' },
  { pattern: /təmizl|temizl/i,  color: '#38BDF8' },
  { pattern: /xalça|xalca/i,    color: '#1E40AF' },
  { pattern: /usta/i,           color: '#F97316' },
  { pattern: /transport/i,      color: '#7C3AED' },
  { pattern: /\btech\b/i,       color: '#1F2937' },
  { pattern: /avtocheck/i,      color: '#DC2626' },
  { pattern: /bağban|bagban/i,  color: '#16A34A' },
  { pattern: /evakuas/i,        color: '#2563EB' },
];
const _FALLBACK = ['#6366F1','#0EA5E9','#14B8A6','#F59E0B','#EF4444','#8B5CF6'];

function getPageColor(name, idx = 0) {
  for (const r of _PAGE_COLOR_RULES) { if (r.pattern.test(name)) return r.color; }
  return _FALLBACK[idx % _FALLBACK.length];
}

// ─── Server API Köməkçiləri ──────────────────────────────────────────────────
// Server işləyirsə /api/config istifadə et, yoxdursa localStorage fallback

async function serverGetConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function serverSaveConfig(data) {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch { /* server yoxdursa keç */ }
}

async function serverClearConfig() {
  try {
    await fetch('/api/config', { method: 'DELETE' });
  } catch { /* keç */ }
}

// ─── Başlanğıc ───────────────────────────────────────────────────────────────
async function init() {
  applyQuickRange(30);
  attachEventListeners();
  showTokenSetupView(); // default — server cavab verənə qədər

  // Server config-dən yüklə (bütün kompüterlərdə eyni məlumat)
  const serverCfg = await serverGetConfig();

  let token = null;
  let pages = null;

  const localToken = localStorage.getItem('meta_token');
  let localPages = null;
  try {
    const lp = localStorage.getItem('meta_managed_pages');
    if (lp) localPages = JSON.parse(lp);
  } catch { /* ignore */ }

  if (serverCfg && serverCfg.token) {
    // Server cavab verdi — server məlumatını istifadə et
    token = serverCfg.token;
    pages = serverCfg.pages || null;
    localStorage.setItem('meta_token', token);
    if (pages) localStorage.setItem('meta_managed_pages', JSON.stringify(pages));
  } else {
    // Server boşdur amma localStorage-da token var → serverə sinxronlaşdır
    token = localToken;
    pages = localPages;
    if (token) {
      // Bu brauzer əvvəllər token saxlayıb — onu serverə yazırıq ki
      // digər brauzerlər/kompüterlər də avtomatik oxusun
      serverSaveConfig({
        token,
        pages: pages || []
      });
    }
  }

  if (pages && pages.length) {
    state.managedPages = pages;
    pages.forEach(p => {
      if (p.ig_id)  state.igIds[p.id]     = p.ig_id;
      if (p.photo)  state.pagePhotos[p.id] = p.photo;
    });
    renderPagesList(pages, true);
    renderPageChips();
  }

  if (token) {
    state.userToken = token;
    showTokenConnectedView(token);
  }
}

function showTokenSetupView() {
  dom.tokenSetupView.style.display     = 'block';
  dom.tokenConnectedView.style.display = 'none';
  dom.tokenStatusBadge.style.display   = 'none';
  dom.configPanel.classList.remove('collapsed');
}

function showTokenConnectedView(token) {
  dom.tokenSetupView.style.display     = 'none';
  dom.tokenConnectedView.style.display = 'block';
  dom.tokenStatusBadge.style.display   = 'inline-flex';
  // Show first 8 chars of token for reference
  const preview = token.length > 12 ? token.slice(0, 8) + '…' + token.slice(-4) : token;
  if (dom.tokenConnectedSub) dom.tokenConnectedSub.textContent = `Token: ${preview}`;
  dom.configPanel.classList.add('collapsed');
}

// ─── Hadisə Dinləyiciləri ────────────────────────────────────────────────────
function attachEventListeners() {
  dom.configToggle.addEventListener('click', toggleConfigPanel);

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  dom.toggleToken.addEventListener('click', handleToggleToken);

  dom.testConnection.addEventListener('click', handleTestAndDiscover);
  dom.discoverPages.addEventListener('click', handleDiscoverPages);
  dom.editToken.addEventListener('click', async () => {
    await serverClearConfig();
    localStorage.removeItem('meta_token');
    localStorage.removeItem('meta_managed_pages');
    state.userToken = '';
    if (dom.accessToken) dom.accessToken.value = '';
    resetPagesList();
    renderPageChips();
    showTokenSetupView();
  });

  dom.quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.quickBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const r = btn.dataset.range;
      if      (r === 'this-month') applyThisMonth();
      else if (r === 'last-month') applyLastMonth();
      else applyQuickRange(parseInt(btn.dataset.days, 10));
    });
  });

  dom.dateFrom.addEventListener('change', clearQuickActive);
  dom.dateTo.addEventListener('change', clearQuickActive);

  dom.fetchData.addEventListener('click', handleFetchData);

  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  dom.tableHeaders.forEach(th => {
    th.addEventListener('click', () => handleTableSort(th.dataset.col));
  });
}

// ─── Light / Dark Tema ───────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Başlanğıcda əvvəlki temanı bərpa et
(function applyTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
})();

// ─── Konfiq Panel ────────────────────────────────────────────────────────────
function toggleConfigPanel() { dom.configPanel.classList.toggle('collapsed'); }
function handleToggleToken() {
  const inp = dom.accessToken;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── Tarix ───────────────────────────────────────────────────────────────────
function applyQuickRange(days) {
  const to = new Date(), from = new Date();
  from.setDate(from.getDate() - days + 1);
  dom.dateFrom.value = toDateString(from);
  dom.dateTo.value   = toDateString(to);
}

function applyThisMonth() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  dom.dateFrom.value = toDateString(from);
  dom.dateTo.value   = toDateString(to);
}

function applyLastMonth() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to   = new Date(now.getFullYear(), now.getMonth(), 0);
  dom.dateFrom.value = toDateString(from);
  dom.dateTo.value   = toDateString(to);
}

function clearQuickActive() { dom.quickBtns.forEach(b => b.classList.remove('active')); }

// LOCAL tarix — toISOString() UTC qaytarır, timezone fərqi səbəbindən +4 AZ-da
// gecə yarısı bir gün geri yazılır. getFullYear/Month/Date lokal dəyərlərdir.
function toDateString(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Tab Keçidi ──────────────────────────────────────────────────────────────
function switchTab(tabId) {
  dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));
}

// ─── Yükləmə ─────────────────────────────────────────────────────────────────
function setLoading(active, text = 'Məlumatlar yüklənir...') {
  state.isLoading = active;
  dom.loadingOverlay.style.display = active ? 'flex' : 'none';
  dom.loadingText.textContent      = text;
  dom.fetchData.disabled           = active;
  if (dom.testConnection) dom.testConnection.disabled = active;
  if (dom.discoverPages)  dom.discoverPages.disabled  = active;
}

// ─── Bağlantı + Aşkar Et ─────────────────────────────────────────────────────
async function handleTestAndDiscover() {
  const token = dom.accessToken.value.trim();
  if (!token) { showToast('Xəta', 'Token daxil edin', 'error'); return; }

  setLoading(true, 'Bağlantı yoxlanılır...');
  try {
    const me = await testApiConnection(token);
    // Token keçərlidir — server + localStorage-a saxla
    await serverSaveConfig({ token });
    localStorage.setItem('meta_token', token);
    state.userToken = token;
    showToast('Bağlantı Uğurlu', `Giriş edildi: ${me.name || me.id}`, 'success');
    await discoverAndRenderPages(token);
    showTokenConnectedView(token);
  } catch (err) {
    showToast('Bağlantı Xətası', err instanceof ApiError ? err.toUserMessage() : err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function handleDiscoverPages() {
  const token = state.userToken || localStorage.getItem('meta_token') || '';
  if (!token) { showToast('Xəta', 'Əvvəlcə token daxil edin', 'error'); return; }
  setLoading(true, 'Səhifələr aşkar edilir...');
  try {
    await discoverAndRenderPages(token);
  } catch (err) {
    showToast('Xəta', err instanceof ApiError ? err.toUserMessage() : err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function discoverAndRenderPages(token) {
  setLoading(true, 'Səhifələr + Instagram hesabları yüklənir...');
  const pages = await fetchManagedPages(token);

  pages.forEach(p => {
    if (p.access_token) state.pageTokens[p.id] = p.access_token;
    if (p.ig_id)        state.igIds[p.id]       = p.ig_id;
    // Səhifə foto URL-i — chip-lərdə kiçik loqo kimi istifadə edilir
    state.pagePhotos[p.id] = `https://graph.facebook.com/v20.0/${p.id}/picture?type=small&access_token=${token}`;
  });

  state.managedPages = pages;
  const pagesToSave = pages.map(({ id, name, ig_id }) => ({
    id, name, ig_id,
    photo: state.pagePhotos[id]
  }));
  localStorage.setItem('meta_managed_pages', JSON.stringify(pagesToSave));
  // Server-ə də saxla — bütün kompüterlər üçün sinxronizasiya
  await serverSaveConfig({ token, pages: pagesToSave });

  renderPagesList(pages);
  renderPageChips();

  const withIg    = pages.filter(p => p.ig_id).length;
  const withoutIg = pages.length - withIg;

  if (withIg > 0) {
    showToast('Uğurlu',
      `${pages.length} səhifə — ${withIg} Instagram bağlı` +
      (withoutIg ? `, ${withoutIg} bağlı deyil` : ''),
      'success');

    // Meta Ads hesablarını al — paid data üçün (ads_read icazəsi lazımdır)
    setLoading(true, 'Meta Ads hesabları yüklənir...');
    state.userToken    = token;
    state.adAccountIds = await fetchAdAccounts(token).catch(() => []);
    if (state.adAccountIds.length > 0) {
      showToast('Məlumat', `${state.adAccountIds.length} reklam hesabı tapıldı`, 'info');
    }

    // Collab cross-attribution üçün username-ləri al (paralel)
    setLoading(true, 'Instagram hesab adları yüklənir...');
    state.igUsernames      = {};
    state.usernameToPageId = {};

    await Promise.allSettled(
      pages.filter(p => p.ig_id).map(async p => {
        const token = state.pageTokens[p.id];
        if (!token) return;
        const username = await fetchIgUsername(p.ig_id, token);
        if (username) {
          state.igUsernames[p.id]                     = username;
          state.usernameToPageId[username.toLowerCase()] = p.id;
        }
      })
    );
  } else {
    showToast('İcazə Xətası',
      'Instagram hesabı tapılmadı. Graph API Explorer-də instagram_basic, pages_show_list, business_management icazələrini əlavə edin.',
      'error');
    _showPermissionGuide();
  }
}

// İcazə bələdçisini konfiq panelinin altında göstər
function _showPermissionGuide() {
  const existing = document.getElementById('permissionGuide');
  if (existing) return;

  const guide = document.createElement('div');
  guide.id = 'permissionGuide';
  guide.className = 'permission-guide';
  guide.innerHTML = `
    <div class="pg-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="currentColor"/>
      </svg>
      Instagram tapılmadı — Lazım olan icazələr
    </div>
    <p class="pg-text">Graph API Explorer-də token yaradarkən aşağıdakı icazələri əlavə edin:</p>
    <div class="pg-perms">
      <span class="pg-perm">instagram_basic</span>
      <span class="pg-perm">pages_show_list</span>
      <span class="pg-perm">pages_read_engagement</span>
      <span class="pg-perm">business_management</span>
    </div>
    <p class="pg-sub">
      <strong>Meta Business Suite istifadəçiləri:</strong> Əvvəlcə Instagram-ı Facebook Səhifəsinə bağlayın:
      Business Suite → Parametrlər → Instagram Hesabları → Əlavə et
    </p>
    <button class="pg-close" onclick="document.getElementById('permissionGuide').remove()">Bağla ×</button>
  `;
  dom.configPanel.after(guide);
}

// ─── Səhifə Siyahısı ─────────────────────────────────────────────────────────
function renderPagesList(pages, silent = false) {
  const container = dom.pagesList;

  if (!pages.length) {
    container.innerHTML = '<p class="pages-empty">Heç bir səhifə tapılmadı.</p>';
    container.style.display = 'block';
    return;
  }

  const withIg    = pages.filter(p => p.ig_id);
  const withoutIg = pages.filter(p => !p.ig_id);

  container.innerHTML = `
    <div class="pages-select-bar">
      <label class="cb-label cb-all">
        <input type="checkbox" id="selectAllPages" checked>
        <span>Hamısını seç</span>
        <span class="pages-count">${withIg.length} Instagram bağlı</span>
      </label>
    </div>
    <div class="pages-scroll">
      ${withIg.map(p => `
        <label class="cb-label">
          <input type="checkbox" class="page-check" value="${p.id}" checked>
          <span class="page-ig-icon">▷</span>
          <span class="page-name">${safeText(p.name)}</span>
          <span class="page-id">${p.ig_id}</span>
        </label>
      `).join('')}
      ${withoutIg.map(p => `
        <label class="cb-label cb-no-ig" title="Instagram hesabı bağlı deyil">
          <input type="checkbox" class="page-check" value="${p.id}" disabled>
          <span class="page-name">${safeText(p.name)}</span>
          <span class="page-id no-ig">Instagram yoxdur</span>
        </label>
      `).join('')}
    </div>
  `;
  container.style.display = 'block';

  const allCb = document.getElementById('selectAllPages');
  allCb.addEventListener('change', e => {
    container.querySelectorAll('.page-check:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
  });
  container.querySelectorAll('.page-check:not(:disabled)').forEach(cb => {
    cb.addEventListener('change', syncSelectAll);
  });

  if (!silent && withoutIg.length) {
    showToast('Məlumat',
      `${withoutIg.length} səhifə Instagram-a bağlı deyil — göstərilmir`,
      'info');
  }
}

function syncSelectAll() {
  const all  = document.querySelectorAll('.page-check:not(:disabled)');
  const chkd = document.querySelectorAll('.page-check:not(:disabled):checked');
  const allCb = document.getElementById('selectAllPages');
  if (!allCb) return;
  allCb.checked       = chkd.length === all.length;
  allCb.indeterminate = chkd.length > 0 && chkd.length < all.length;
}

// ─── Sticky Filterdəki Səhifə Chipləri ──────────────────────────────────────
function renderPageChips() {
  const bar = dom.pageSelectorBar;
  if (!bar) return;

  const pages = state.managedPages.filter(p => p.ig_id);
  if (!pages.length) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  bar.innerHTML = `
    <span class="page-chips-label">Səhifələr:</span>
    <div class="page-chips-scroll">
      ${pages.map(p => {
        const photo = state.pagePhotos[p.id] || '';
        const name  = safeText(p.name);
        return `
          <button class="page-chip active" data-page-id="${p.id}" type="button" title="${name}">
            ${photo
              ? `<img src="${photo}" class="page-chip-logo" alt="" onerror="this.style.display='none'">`
              : ''}
            <span class="page-chip-name">${name}</span>
          </button>`;
      }).join('')}
    </div>
  `;

  bar.querySelectorAll('.page-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      // Config panel-dəki checkbox-u da sinxronlaşdır
      const cb = document.querySelector(`.page-check[value="${chip.dataset.pageId}"]`);
      if (cb) { cb.checked = chip.classList.contains('active'); syncSelectAll(); }
    });
  });
}

function resetPagesList() {
  state.managedPages = [];
  state.pageTokens   = {};
  state.igIds        = {};
  state.pagePhotos   = {};
  dom.pagesList.innerHTML = '';
  dom.pagesList.style.display = 'none';
  if (dom.pageSelectorBar) dom.pageSelectorBar.style.display = 'none';
  localStorage.removeItem('meta_managed_pages');
}

function getSelectedPages() {
  // Sticky bar-da chip-lər varsa onların seçimini istifadə et
  const chips = document.querySelectorAll('.page-chip');
  if (chips.length) {
    return Array.from(chips).filter(c => c.classList.contains('active')).map(c => c.dataset.pageId);
  }
  // Fallback: config panel-dəki checkboxlar
  return Array.from(document.querySelectorAll('.page-check:not(:disabled):checked')).map(cb => cb.value);
}

function safeText(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Məlumat Yüklə (Instagram) ───────────────────────────────────────────────
async function handleFetchData() {
  const token = state.userToken || localStorage.getItem('meta_token') || '';
  if (!token) {
    showToast('Xəta', 'Token daxil edin', 'error');
    dom.configPanel.classList.remove('collapsed');
    return;
  }

  if (!state.managedPages.length) {
    showToast('Məlumat', '"Aşkar Et" düyməsinə basın', 'info');
    dom.configPanel.classList.remove('collapsed');
    setLoading(true);
    try { await discoverAndRenderPages(token); } catch (err) {
      showToast('Xəta', err instanceof ApiError ? err.toUserMessage() : err.message, 'error');
    } finally { setLoading(false); }
    return;
  }

  const selectedIds = getSelectedPages();
  if (!selectedIds.length) { showToast('Xəta', 'Ən az bir səhifə seçin', 'error'); return; }

  // T00:00:00 / T23:59:59 — timezone suffixsiz string LOCAL vaxt kimi parse edilir
  const from = new Date(dom.dateFrom.value + 'T00:00:00');
  const to   = new Date(dom.dateTo.value   + 'T23:59:59');
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    showToast('Xəta', 'Tarix aralığı düzgün deyil', 'error');
    return;
  }

  setLoading(true, 'Hazırlanır...');
  state.currentFrom = from;
  state.currentTo   = to;

  // Bütün Instagram-a bağlı hesablar (seçilmiş + seçilməmiş)
  const allIgPages = state.managedPages.filter(p => p.ig_id);

  // _allPosts: bütün hesabların mediaları (collab cross-attribution üçün)
  const _allPosts     = {};
  const _allPageNames = {};

  try {
    let selIdx = 0;
    for (const pageInfo of allIgPages) {
      const pageId    = pageInfo.id;
      const pageName  = pageInfo.name;
      const pageToken = state.pageTokens[pageId] || token || state.userToken;
      const igId      = state.igIds[pageId] || pageInfo.ig_id;
      const isSelected = selectedIds.includes(pageId);

      if (!pageToken || !igId) continue;

      if (isSelected) {
        selIdx++;
        setLoading(true, `${selIdx}/${selectedIds.length}: "${pageName}" yüklənir...`);
      } else {
        setLoading(true, `Collab üçün: "${pageName}" arxa planda yüklənir...`);
      }

      try {
        const posts = await fetchInstagramMedia(
          igId, pageToken, from, to,
          count => isSelected && setLoading(true, `"${pageName}": ${count} post tapıldı...`)
        );
        _allPosts[pageId]     = posts;
        _allPageNames[pageId] = pageName;
      } catch (err) {
        if (isSelected) throw err;  // seçilmiş hesab xətası → istifadəçiyə göstər
        // Seçilməmiş hesab xətası → səssizcə keç
      }
    }

    // igId → pageId xəritəsi — ID-based collab attribution üçün
    const igIdToPageId = {};
    Object.entries(state.igIds).forEach(([pid, igId]) => {
      igIdToPageId[igId] = pid;
    });

    // Collab cross-attribution — bütün data üzərində işlə
    setLoading(true, 'Collab postlar aşkar edilir...');
    crossAttributeCollabPosts(_allPosts, igIdToPageId);

    // Display üçün: yalnız seçilmiş hesabları state.posts-a köçür
    // Cross-attributed postlar (_cross_attributed: true) da daxildir
    state.posts     = {};
    state.pageNames = {};
    selectedIds.forEach(id => {
      if (_allPosts[id]) {
        state.posts[id]     = _allPosts[id];
        state.pageNames[id] = _allPageNames[id] || id;
      }
    });

    updateUI(from, to);
    const realTotal = Object.values(state.posts).flat().filter(p => !p._cross_attributed).length;
    showToast('Uğurlu', `${realTotal} Instagram post ${selectedIds.length} səhifədən yükləndi`);
    dom.configPanel.classList.add('collapsed');

  } catch (err) {
    showToast('Xəta', err instanceof ApiError ? err.toUserMessage() : err.message, 'error');
  } finally {
    setLoading(false);
  }
}


// ─── UI Yeniləmə ─────────────────────────────────────────────────────────────
function updateUI(from, to) {
  const allPosts     = Object.values(state.posts).flat();
  // _cross_attributed postlar display-da var amma real postlar deyil
  const realPosts    = allPosts.filter(p => !p._cross_attributed);
  const pageIds      = Object.keys(state.posts);
  const dayCount     = Math.max(1, Math.round((to - from) / 86_400_000));

  dom.statTotalPosts.textContent  = realPosts.length.toLocaleString();
  dom.statActivePages.textContent = pageIds.length;

  let topId = null, topCount = 0;
  pageIds.forEach(id => {
    const c = (state.posts[id] || []).length;
    if (c > topCount) { topCount = c; topId = id; }
  });
  if (topId) {
    const full = state.pageNames[topId] || topId;
    dom.statTopPage.textContent = full.length > 15 ? full.slice(0, 13) + '…' : full;
    dom.statTopPage.title       = `${full} (${topCount} post)`;
  } else {
    dom.statTopPage.textContent = '—';
    dom.statTopPage.title = '';
  }

  const avg = allPosts.length / dayCount;
  dom.statDailyAvg.textContent = avg >= 10 ? avg.toFixed(0) : avg.toFixed(1);

  // Collab stat kartı
  const collabTotal = allPosts.filter(p => p.is_collab).length;
  if (dom.statCollab) dom.statCollab.textContent = collabTotal;

  // Qrafiklər
  const labels      = buildMonthLabels(from, to);
  const pageData    = buildPageData(labels, pageIds);
  const perPageData = buildPerPageTypeData(labels, pageIds);

  renderChartByPage(labels, pageData);
  renderChartByType(labels, perPageData);

  buildTableData(pageIds);
  renderTable();
  _updateCollabHeader();

  // Engagement bölməsi
  renderEngagementTable();   // async — insights sonra gəlir
  _attachEngEvents();
}

// ─── Collab Cross-Attribution ────────────────────────────────────────────────
// allPosts: { pageId: [post, ...] } — bütün hesabların tam data-sı
// allPageNames: { pageId: name }
//
// Mexanizm A — ID matching:
//   Eyni post ID 2+ hesabda varsa → is_collab = true (collaborators field lazım deyil)
//
// Mexanizm B — collaborator_usernames push:
//   Postu atan hesabın collaborators field-i varsa: postu qəbul edən hesaba da əlavə et
// igIdToPageId: { igAccountId → pageId } — ID-based collab aşkarlama
function crossAttributeCollabPosts(allPosts, igIdToPageId) {
  const allPageIds = Object.keys(allPosts);
  if (!allPageIds.length) return;

  // ── Mexanizm A: eyni post ID-si 2+ hesabda → collab ─────────────────────
  const idMap = {};   // postId → [pageId, ...]
  allPageIds.forEach(pid => {
    (allPosts[pid] || []).forEach(p => {
      if (!idMap[p.id]) idMap[p.id] = [];
      if (!idMap[p.id].includes(pid)) idMap[p.id].push(pid);
    });
  });
  Object.entries(idMap).forEach(([postId, pages]) => {
    if (pages.length < 2) return;
    pages.forEach(pid => {
      const p = (allPosts[pid] || []).find(x => x.id === postId);
      if (p) p.is_collab = true;
    });
  });

  // ── Mexanizm B: collaborator ID/username ilə push ────────────────────────
  // Atanın postu qəbul edənin listinə əlavə edilir
  // snapshot — iterasiya zamanı yeni push-ların eyni dövrə girməsini önləyir
  const snapshot = {};
  allPageIds.forEach(pid => { snapshot[pid] = [...(allPosts[pid] || [])]; });

  Object.entries(snapshot).forEach(([pageId, posts]) => {
    posts.forEach(post => {
      const igIds    = post.collaborator_ig_ids    || [];
      const unames   = post.collaborator_usernames || [];
      if (!igIds.length && !unames.length) return;

      post.is_collab = true;

      // IG ID-ləri ilə axtarış (daha etibarlı)
      const targetPageIds = new Set();
      igIds.forEach(igId => {
        const pid = igIdToPageId[igId];
        if (pid && pid !== pageId) targetPageIds.add(pid);
      });
      // Fallback: username ilə axtarış
      unames.forEach(uname => {
        const pid = state.usernameToPageId?.[uname.toLowerCase()];
        if (pid && pid !== pageId) targetPageIds.add(pid);
      });

      targetPageIds.forEach(collabPageId => {
        if (!allPosts[collabPageId]) return;
        const exists = allPosts[collabPageId].find(p => p.id === post.id);
        if (exists) {
          exists.is_collab = true;
        } else {
          allPosts[collabPageId].push({
            ...post,
            is_collab:         true,
            _cross_attributed: true
          });
        }
      });
    });
  });
}

// ─── Ay Etiketləri ───────────────────────────────────────────────────────────
function buildMonthLabels(from, to) {
  const labels = [];
  let cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    labels.push(`${AZ_MONTHS[cur.getMonth()]} ${cur.getFullYear()}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return labels;
}

function getPostMonthLabel(post) {
  const d = new Date(post.created_time);
  return `${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function buildPageData(labels, pageIds) {
  return pageIds.map(id => {
    const monthly = Object.fromEntries(labels.map(l => [l, 0]));
    (state.posts[id] || []).forEach(p => {
      const lbl = getPostMonthLabel(p);
      if (lbl in monthly) monthly[lbl]++;
    });
    return { name: state.pageNames[id] || id, monthly };
  });
}

function buildPerPageTypeData(labels, pageIds) {
  return pageIds.map(id => {
    const posts        = state.posts[id] || [];
    const presentTypes = TYPE_ORDER.filter(t => posts.some(p => p.type === t));
    const types = presentTypes.map(type => {
      const monthly = Object.fromEntries(labels.map(l => [l, 0]));
      posts.filter(p => p.type === type).forEach(p => {
        const lbl = getPostMonthLabel(p);
        if (lbl in monthly) monthly[lbl]++;
      });
      return { type, monthly };
    });
    return { pageId: id, pageName: state.pageNames[id] || id, types };
  });
}

// ─── Cədvəl Data (Collab daxil) ──────────────────────────────────────────────
// Collab sayı: is_collab flag-ı İnstagram API-dan collaborators{username} field-i
// ilə gəlir. Əgər bu field icazəsiz dönürsə, is_collab = false olur.
// Tək səhifə seçiləndə cross-attribution işləmir amma own collab postlar sayılır.
function buildTableData(pageIds) {
  state.tableData = pageIds.map(id => {
    const posts = state.posts[id] || [];
    const counts = { reels: 0, carousel: 0, photo: 0, other: 0, collab: 0 };

    posts.forEach(p => {
      if      (p.type === 'reels')    counts.reels++;
      else if (p.type === 'carousel') counts.carousel++;
      else if (p.type === 'photo')    counts.photo++;
      else                            counts.other++;

      // is_collab = collaborators{username} API field-dən gəlir
      // Tək hesabda da collab postlar öz media listindən sayılır
      if (p.is_collab) counts.collab++;
    });

    // Yoxlama: type cəmi totalə bərabər olmalıdır
    const typeSum = counts.reels + counts.carousel + counts.photo + counts.other;
    if (typeSum !== posts.length) counts.other += posts.length - typeSum;

    return {
      name:     state.pageNames[id] || id,
      total:    posts.length,
      reels:    counts.reels,
      carousel: counts.carousel,
      photo:    counts.photo,
      collab:   counts.collab,
      other:    counts.other
    };
  });
}

// Collab sayı 0-dursa səbəb açıqlanır (cədvəl başlığında tooltip kimi)
function _updateCollabHeader() {
  const th = document.querySelector('th[data-col="collab"]');
  if (!th) return;
  const allPosts = Object.values(state.posts).flat();
  const hasCollabData = allPosts.some(p => p.collaborator_usernames && p.collaborator_usernames.length > 0);
  if (!hasCollabData) {
    th.title = 'Collab məlumatı yoxdur: Graph API Explorer-də "instagram_branded_content_ads_brand" icazəsini əlavə edin';
  } else {
    th.title = '';
  }
}

// ─── Cədvəl Sort ─────────────────────────────────────────────────────────────
function handleTableSort(col) {
  if (state.tableSortCol === col) {
    state.tableSortDir = state.tableSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.tableSortCol = col;
    state.tableSortDir = col === 'name' ? 'asc' : 'desc';
  }
  renderTable();
}

// Sayı hücrəsi: 0 → sönük, müsbət → rəngdə
function fmtCell(n, cls) {
  if (n === undefined || n === null) return `<span class="n-empty">—</span>`;
  if (n === 0) return `<span class="n-zero">0</span>`;
  return `<strong class="${cls}">${n}</strong>`;
}

function renderTable() {
  const tbody = dom.statsTableBody;
  if (!state.tableData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty-cell">Məlumat yoxdur — data yükləyin</td></tr>';
    return;
  }

  const sorted = [...state.tableData].sort((a, b) => {
    const dir = state.tableSortDir === 'asc' ? 1 : -1;
    if (state.tableSortCol === 'name') return a.name.localeCompare(b.name, 'az') * dir;
    return (a[state.tableSortCol] - b[state.tableSortCol]) * dir;
  });

  dom.tableHeaders.forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === state.tableSortCol)
      th.classList.add(state.tableSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });

  const totals = state.tableData.reduce((acc, r) => ({
    total:    acc.total    + r.total,
    reels:    acc.reels    + r.reels,
    carousel: acc.carousel + r.carousel,
    photo:    acc.photo    + r.photo,
    collab:   acc.collab   + r.collab,
    other:    acc.other    + r.other
  }), { total: 0, reels: 0, carousel: 0, photo: 0, collab: 0, other: 0 });

  // Hər sətirdəki color bar üçün səhifə rəngi
  tbody.innerHTML = sorted.map(row => `
    <tr>
      <td class="td-name">
        <span class="td-page-dot" style="background:${getPageColor(row.name, 0)}"></span>
        ${safeText(row.name)}
      </td>
      <td class="td-num col-num">${fmtCell(row.total,    'td-total')}</td>
      <td class="td-num col-num">${fmtCell(row.reels,    'td-reels')}</td>
      <td class="td-num col-num">${fmtCell(row.carousel, 'td-carousel')}</td>
      <td class="td-num col-num">${fmtCell(row.photo,    'td-photo')}</td>
      <td class="td-num col-num">${fmtCell(row.collab,   'td-collab')}</td>
    </tr>
  `).join('') + `
    <tr class="table-total-row">
      <td class="td-name">Cəmi</td>
      <td class="td-num col-num"><strong>${totals.total}</strong></td>
      <td class="td-num col-num"><strong class="td-reels">${totals.reels}</strong></td>
      <td class="td-num col-num"><strong class="td-carousel">${totals.carousel}</strong></td>
      <td class="td-num col-num"><strong class="td-photo">${totals.photo}</strong></td>
      <td class="td-num col-num"><strong class="td-collab">${totals.collab}</strong></td>
    </tr>
  `;
}

// ─── Toast ───────────────────────────────────────────────────────────────────
const TOAST_ICONS = {
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>`,
  error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c49b00" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#c49b00"/></svg>`
};

function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconEl = document.createElement('div');
  iconEl.className = 'toast-icon';
  iconEl.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

  const bodyEl  = document.createElement('div');
  bodyEl.className = 'toast-body';
  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;
  const msgEl   = document.createElement('div');
  msgEl.className = 'toast-msg';
  msgEl.textContent = message;
  bodyEl.append(titleEl, msgEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Bağla');
  closeBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener('click', () => dismissToast(toast));

  toast.append(iconEl, bodyEl, closeBtn);
  dom.toastContainer.appendChild(toast);
  setTimeout(() => dismissToast(toast), 6000);
}

function dismissToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 240);
}

// ─── Engagement Bölməsi ──────────────────────────────────────────────────────

const ENG_PAGE_SIZE = 5;  // Eyni anda göstərilən post sayı

const ENG = {
  all:      [],
  shown:    ENG_PAGE_SIZE,
  channel:  'total',
  insights: {}
};

const TYPE_ICON   = { reels: '🎬', carousel: '🖼️', photo: '📸', other: '📄' };
const TYPE_AZ     = { reels: 'Reels', carousel: 'Carousel', photo: 'Single Photo', other: 'Digər' };

// Bütün postları topla, sırala, görüntülə + insights çək
async function renderEngagementTable() {
  const section = document.getElementById('engagementSection');
  if (!section) return;

  // Bütün postları toplayaq
  ENG.all = [];
  ENG.shown   = ENG_PAGE_SIZE;
  ENG.channel = 'total';
  ENG.insights = {};

  Object.entries(state.posts).forEach(([pageId, posts]) => {
    posts.forEach(post => {
      ENG.all.push({
        ...post,
        _pageName:   state.pageNames[pageId] || pageId,
        _pageId:     pageId,
        _pageToken:  state.pageTokens[pageId] || null,
        _baseScore:  (post.like_count || 0) + (post.comments_count || 0)
      });
    });
  });

  if (!ENG.all.length) { section.style.display = 'none'; return; }

  // Engagement datlarını artırılmış şəkildə saxla
  ENG.all.sort((a, b) => b._baseScore - a._baseScore);

  // Tarix filtrini əsas filterlə eyni başlat
  const fromEl = document.getElementById('engDateFrom');
  const toEl   = document.getElementById('engDateTo');
  if (fromEl && !fromEl.value) fromEl.value = dom.dateFrom.value;
  if (toEl   && !toEl.value  ) toEl.value   = dom.dateTo.value;

  section.style.display = 'block';

  // Yüklənir vəziyyəti göstər — bütün data hazır olandan sonra render ediləcək
  const listEl = document.getElementById('engPostList');
  if (listEl) {
    listEl.innerHTML = `<div class="eng-loading-state">
      <div class="eng-spinner"></div>
      <span>Postlar yüklənir...</span>
    </div>`;
  }

  const top20  = ENG.all.slice(0, 20);
  const from   = new Date(dom.dateFrom.value + 'T00:00:00');
  const to     = new Date(dom.dateTo.value   + 'T23:59:59');
  const uToken = state.userToken || localStorage.getItem('meta_token') || '';

  // ── 1) Ads hesabları — boşdursa yenidən çək ─────────────────────────────
  if (state.adAccountIds.length === 0 && uToken) {
    state.adAccountIds = await fetchAdAccounts(uToken).catch(() => []);
  }

  // ── 2) Paid data — timeout ilə, loading overlay-siz ─────────────────────
  // setLoading istifadə etmirik — engagement section öz daxilindəki
  // "Yüklənir..." yazısını göstərəcək, loading overlay bağlı qalmayacaq
  let paidMap = {};

  // Maksimum gözləmə vaxtı: 20 saniyə
  const PAID_TIMEOUT = 20_000;

  // Mənbə 1: Facebook Page Post Insights (əsas mənbə)
  try {
    const pageInsightsPromise = buildPaidDataMapFromPageInsights(
      state.managedPages, state.pageTokens, state.igIds, from, to
    );
    const timeoutPromise = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), PAID_TIMEOUT)
    );
    paidMap = await Promise.race([pageInsightsPromise, timeoutPromise]);
  } catch { /* timeout və ya xəta — davam et */ }

  // Mənbə 2: Meta Ads Manager (əgər Page Insights-da engagement yoxdursa)
  if (state.adAccountIds.length > 0 && uToken) {
    try {
      const adsPromise = buildPaidDataMap(
        state.adAccountIds, uToken, from, to, state.pageTokens
      );
      const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), PAID_TIMEOUT)
      );
      const adsMap = await Promise.race([adsPromise, timeoutPromise]);
      Object.entries(adsMap).forEach(([igId, ads]) => {
        if (!paidMap[igId]) {
          paidMap[igId] = ads;
        } else {
          const pm = paidMap[igId];
          if (ads.paid_likes)      pm.paid_likes      = ads.paid_likes;
          if (ads.paid_comments)   pm.paid_comments   = ads.paid_comments;
          if (ads.paid_shares)     pm.paid_shares     = ads.paid_shares;
          if (ads.paid_saves)      pm.paid_saves      = ads.paid_saves;
          if (ads.paid_engagement) pm.paid_engagement = ads.paid_engagement;
          if (ads.paid_spend)      pm.paid_spend      = ads.paid_spend;
          if (ads.paid_impressions > (pm.paid_impressions || 0)) {
            pm.paid_impressions = ads.paid_impressions;
            pm.paid_reach       = ads.paid_reach;
          }
        }
      });
    } catch { /* timeout və ya xəta */ }
  }

  const paidCount = Object.keys(paidMap).length;
  if (paidCount > 0) {
    showToast('Ödənişli Data', `${paidCount} postda ödənişli data tapıldı`, 'success');
  }

  // ── 3) Instagram insights çək + paidMap ilə birləşdir ────────────────────
  const iMap = await fetchInsightsForTopPosts(top20, paidMap);
  ENG.insights = iMap;

  // Post obyektlərini insights ilə zənginləşdir
  ENG.all.forEach(p => {
    const ins = iMap[p.id] || {};

    // NaN-dən qoruyan köməkçi — ?? operatoru NaN-i qorumur, yalnız null/undefined
    const safeN = v => (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : 0;

    // ── 5 əsas metrik ────────────────────────────────────────────────────────
    p._likes    = safeN(ins.likes_total    ?? ins.likes    ?? p.like_count     ?? 0);
    p._comments = safeN(ins.comments_total ?? ins.comments ?? p.comments_count ?? 0);
    p._saves    = safeN(ins.saved_total    ?? ins.saved    ?? 0);
    p._shares   = safeN(ins.shares_total   ?? ins.shares   ?? 0);
    // Baxış sayı — ən yaxşı mövcud metrikin prioritet sırası:
    // Reels  → ig_reels_aggregated_all_plays_count → plays → impressions → reach
    // Video  → video_views → impressions → reach
    // Foto   → impressions → reach
    p._views = ins.plays               // Reels plays (yeni API)
            ?? ins.ig_reels_aggregated_all_plays_count  // alias
            ?? ins.video_views         // video
            ?? ins.impressions         // foto / universal
            ?? ins.reach              // son fallback — həmişə mövcuddur
            ?? 0;
    p._reach = ins.reach ?? 0;

    // Ümumi engagement = Likes + Comments + Saves + Shares + Baxış (5 metrik)
    p._totalScore = p._likes + p._comments + p._saves + p._shares + p._views;

    // ── Ödənişli ("from ads") dəyərlər — Business Suite ilə eyni mənbə ─────
    // Prioritet sırası:
    //   1) hər metrikin öz breakdown-u (likes_paid, comments_paid, ...)
    //   2) total_interactions_paid nisbəti
    //   3) impressions paid nisbəti (ratio)
    const ratio   = ins._paid_ratio             || 0;
    const tiPaid  = ins.total_interactions_paid  ?? null;
    const tiTotal = ins.total_interactions_total ?? 0;
    // total_interactions ratio — likes+comments+saves+shares-ın paid nisbəti
    const tiRatio = (tiPaid != null && tiTotal > 0) ? tiPaid / tiTotal : ratio;

    // Hər metrikin "from ads" dəyəri — safeN ilə NaN-dən qorun
    p._paidLikes    = safeN(ins.likes_paid    ?? (tiRatio > 0 ? Math.round(p._likes    * tiRatio) : 0));
    p._paidComments = safeN(ins.comments_paid ?? (tiRatio > 0 ? Math.round(p._comments * tiRatio) : 0));
    p._paidSaves    = safeN(ins.saved_paid    ?? (tiRatio > 0 ? Math.round(p._saves    * tiRatio) : 0));
    p._paidShares   = safeN(ins.shares_paid   ?? (tiRatio > 0 ? Math.round(p._shares   * tiRatio) : 0));
    p._paidViews    = safeN(ins.paid_impressions ?? (ratio > 0 ? Math.round(p._views * ratio) : 0));

    p._paidScore    = p._paidLikes + p._paidComments + p._paidSaves + p._paidShares + p._paidViews;
    p._organicScore = p._totalScore - p._paidScore;
    p._paidImpressions = safeN(ins.paid_impressions || p._paidScore);
  });

  // Yenidən sırala
  ENG.all.sort((a, b) => (b._totalScore || b._baseScore) - (a._totalScore || a._baseScore));

  const noteEl = document.getElementById('engInsightNote');
  if (noteEl) {
    const hasInsights = Object.keys(iMap).length > 0;
    noteEl.textContent = hasInsights
      ? `Saxlanma + Paylaşma məlumatı ${Object.keys(iMap).length} post üçün yükləndi`
      : 'Saxlanma/Paylaşma üçün instagram_manage_insights icazəsi lazımdır';
    noteEl.className = hasInsights ? 'eng-insights-note ok' : 'eng-insights-note warn';
  }

  _renderEngList();
  setLoading(false); // renderEngagementTable bitdi — loading overlay bağla
}

// Aktiv channel filterinə uyğun postları filterlə
// Tarix → əsas date-filter-dən oxunur (sticky), ayrı input yoxdur
function _getFilteredPosts() {
  let posts = [...ENG.all];

  if (ENG.channel === 'paid') {
    // Ödənişli: paid data olan postları göstər
    // Paid data Ads API-dan gəlir (paidMap vasitəsilə)
    // Əgər heç bir postda paid data yoxdursa — hamısını göstər, amma qeyd et
    const withPaid = posts.filter(p => (p._paidImpressions || 0) > 0 || (p._paidScore || 0) > 0);
    posts = withPaid.length > 0 ? withPaid : posts; // Paid tap edilmədisə hamısını göstər
    posts.sort((a, b) => {
      const aP = (a._paidImpressions || 0) + (a._paidScore || 0);
      const bP = (b._paidImpressions || 0) + (b._paidScore || 0);
      return bP - aP || (b._totalScore || b._baseScore) - (a._totalScore || a._baseScore);
    });
  } else if (ENG.channel === 'organic') {
    // Organik: ödənişli çıxılmış engagement-ə görə sırala
    posts.sort((a, b) => (b._organicScore || b._totalScore || b._baseScore) -
                         (a._organicScore || a._totalScore || a._baseScore));
  } else {
    // Ümumi: tam engagement
    posts.sort((a, b) => (b._totalScore || b._baseScore) - (a._totalScore || a._baseScore));
  }

  return posts;
}

// Postları siyahıya render et
function _renderEngList() {
  const listEl   = document.getElementById('engPostList');
  const footerEl = document.getElementById('engFooter');
  const remainEl = document.getElementById('engRemain');
  if (!listEl) return;

  const filtered = _getFilteredPosts();
  const visible  = filtered.slice(0, ENG.shown);

  if (!filtered.length) {
    const msg = ENG.channel === 'paid'
      ? 'Reklam datası tapılmadı. Yenidən "Bağlantını Yoxla + Aşkar Et" basıb, sonra "Yüklə" basın.'
      : 'Bu filterlə heç bir post tapılmadı.';
    listEl.innerHTML = `<div class="eng-empty-state"><p>Nəticə yoxdur</p><span>${msg}</span></div>`;
    if (footerEl) footerEl.style.display = 'none';
    return;
  }

  // Ödənişli tabda paid data tapılmadığına dair xəbərdarlıq
  const noPaidData = ENG.channel === 'paid' &&
    filtered.every(p => !(p._paidImpressions > 0) && !(p._paidScore > 0));
  const paidNote = noPaidData
    ? `<div class="eng-paid-note">⚠️ Reklam datası tapılmadı — postlar ümumi engagement-ə görə göstərilir. Ads API üçün "Bağlantını Yoxla + Aşkar Et" yenidən basın.</div>`
    : '';

  listEl.innerHTML = paidNote + visible.map((post, i) => _postCardHTML(post, i)).join('');

  const remaining = filtered.length - ENG.shown;
  if (footerEl) footerEl.style.display = remaining > 0 ? 'flex' : 'none';
  if (remainEl) remainEl.textContent = remaining > 0 ? `+${remaining} post qalıb` : '';
}

// Tək post kartı HTML — channel-a görə fərqli statistika göstərir
function _postCardHTML(post, i) {
  const d        = new Date(post.created_time);
  const dateStr  = `${d.getDate()} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const pcolor   = getPageColor(post._pageName, 0);
  // ── 5 metrikin dəyərləri ────────────────────────────────────────────
  // Şəkildəki məntiq:
  //   Ümumi   = üst rəqəm          (məs. 29)
  //   Paid    = "from ads" rəqəmi  (məs. 22)
  //   Organik = ümumi − paid       (məs. 29 − 22 = 7)
  const T = {   // Total (ümumi) — şəkildəki üst rəqəmlər
    likes:    post._likes    || post.like_count     || 0,
    comments: post._comments || post.comments_count || 0,
    saves:    post._saves    || 0,
    shares:   post._shares   || 0,
    views:    post._views    || 0,   // reach = neçə unikal hesab gördü
  };
  const P = {   // Paid ("from ads")
    likes:    post._paidLikes    || 0,
    comments: post._paidComments || 0,
    saves:    post._paidSaves    || 0,
    shares:   post._paidShares   || 0,
    views:    post._paidViews    || 0,
  };
  const O = {   // Organic = T − P
    likes:    T.likes    - P.likes,
    comments: T.comments - P.comments,
    saves:    T.saves    - P.saves,
    shares:   T.shares   - P.shares,
    views:    T.views    - P.views,
  };

  const V = T; // Həmişə ümumi dəyərləri göstər

  const scoreVal   = post._totalScore || post._baseScore;
  const scoreLabel = 'Engagement';

  const mkChip = (cls, icon, val) => {
    const z = val === 0 ? ' data-zero="1"' : '';
    return `<span class="eng-chip ${cls}"${z}>${icon} ${val.toLocaleString()}</span>`;
  };

  const chipsHtml = [
    mkChip('likes',      '❤️',  V.likes),
    mkChip('cmts',       '💬',  V.comments),
    mkChip('saves',      '🔖',  V.saves),
    mkChip('shares',     '📤',  V.shares),
    mkChip('views-chip', '👁',  V.views),
  ].join('');

  // Hover-da görünən formula: 5 metrikin cəmi
  const formulaHtml = `
    <div class="eng-formula">
      ❤️&nbsp;${V.likes.toLocaleString()} +
      💬&nbsp;${V.comments.toLocaleString()} +
      🔖&nbsp;${V.saves.toLocaleString()} +
      📤&nbsp;${V.shares.toLocaleString()} +
      👁&nbsp;${V.views.toLocaleString()}
      = <strong>${scoreVal.toLocaleString()}</strong>
    </div>
  `;

  // Vizual
  const thumbHtml = post.thumb
    ? `<img src="${post.thumb}" class="eng-thumb" loading="lazy" alt=""
            onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex'"
       ><div class="eng-thumb-fallback" style="display:none">${TYPE_ICON[post.type] || '📄'}</div>`
    : `<div class="eng-thumb-fallback">${TYPE_ICON[post.type] || '📄'}</div>`;

  return `
    <div class="eng-post-card">
      <div class="eng-thumb-wrap">
        ${thumbHtml}
        ${post.is_collab ? '<span class="eng-collab-pip">Collab</span>' : ''}
      </div>
      <div class="eng-post-body">
        <div class="eng-post-head">
          <span class="eng-page-dot" style="background:${pcolor}"></span>
          <span class="eng-page-name" style="color:${pcolor}">${safeText(post._pageName)}</span>
          <span class="eng-type-chip">${TYPE_AZ[post.type] || post.type}</span>
        </div>
        <div class="eng-post-date">${dateStr}</div>

        <div class="eng-metrics-row">
          <div class="eng-total-score">
            <strong>${scoreVal.toLocaleString()}</strong>
            <span>${scoreLabel}</span>
            ${formulaHtml}
          </div>
          <div class="eng-metric-chips">${chipsHtml}</div>
        </div>

        ${post.permalink
          ? `<a href="${post.permalink}" target="_blank" rel="noopener" class="eng-perm-link">Posta bax →</a>`
          : ''}
      </div>
    </div>
  `;
}

// Event listenerlər — engagement bölməsi üçün
function _attachEngEvents() {
  const moreBtn = document.getElementById('engLoadMore');
  if (moreBtn) moreBtn.addEventListener('click', () => {
    ENG.shown += ENG_PAGE_SIZE;
    _renderEngList();
  });
}

init();
