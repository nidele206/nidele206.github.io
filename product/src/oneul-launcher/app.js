const STORAGE_KEY = 'launchboard-v2';
const IDB_DB_NAME = 'oneul-launcher-db';
const IDB_STORE = 'app-state';
const IDB_KEY = 'state';
const $ = (id) => document.getElementById(id);

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
const defaultData = {
  workspaces: [
    { id: uid(), title: '仕事', memo: '', links: [
      { id: uid(), name: 'Google', url: 'https://www.google.com/' },
      { id: uid(), name: 'Gmail', url: 'https://mail.google.com/' },
      { id: uid(), name: 'Nideleについて', url: 'https://nidele206.github.io/' },
      { id: uid(), name: 'Sentaroについて', url: 'https://search3958.github.io/' },
    ] },
    { id: uid(), title: '開発', memo: '', links: [
      { id: uid(), name: 'GitHub', url: 'https://github.com/' },
      { id: uid(), name: 'MDN Web Docs', url: 'https://developer.mozilla.org/' }
    ] },
    { id: uid(), title: '参考資料', memo: '', links: [] }
  ],
  activeWorkspaceId: null
};
defaultData.activeWorkspaceId = defaultData.workspaces[0].id;

let state = structuredClone(defaultData);
let selectedLinkId = null;
let editingLinkId = null;
let selectedWorkspaceId = null;
let editingWorkspaceId = null;
let currentView = 'links';

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== 'object') return structuredClone(defaultData);
  if (!Array.isArray(parsed.workspaces) || !parsed.workspaces.length) return structuredClone(defaultData);
  parsed.workspaces.forEach(w => { w.links ||= []; w.memo ||= ''; (w.links || []).forEach(l => { l.accessCount ||= 0; }); });
  parsed.activeWorkspaceId ||= parsed.workspaces[0].id;
  return parsed;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(normalizeState(req.result));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return structuredClone(defaultData);
  }
}

async function idbSet(value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(value, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

async function loadState() {
  const loaded = await idbGet();
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('launchboard-v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      await idbSet(normalized);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('launchboard-v1');
      return normalized;
    }
  } catch {}
  return loaded;
}
function saveState() { idbSet(state); }
function activeWorkspace() { return state.workspaces.find(w => w.id === state.activeWorkspaceId) || state.workspaces[0]; }
function esc(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function favicon(url) {
  try { return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(new URL(url).hostname) + '&sz=64'; }
  catch { return ''; }
}
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'おはようございます';
  if (h >= 11 && h < 18) return 'こんにちは';
  return 'こんばんは';
}
function topLinks(limit = 5) {
  const all = [];
  state.workspaces.forEach(w => {
    (w.links || []).forEach(l => all.push({ ...l, count: l.accessCount || 0 }));
  });
  all.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
  return all.slice(0, limit);
}
function renderOverview() {
  const links = topLinks(5);
  $('overviewGreeting').textContent = greeting();
  $('overviewContent').innerHTML = links.map(l => `
    <div class="link-row" data-open="${l.id}">
      <div class="link-icon"><img src="${esc(favicon(l.url))}" alt="" width="22" height="22" loading="lazy" onerror="this.style.display='none'"></div>
      <div class="link-main" data-open="${l.id}" title="新しいタブで開く">
        <div class="link-title">${esc(l.name)}</div>
        <div class="link-url">${esc(l.url)}</div>
      </div>
    </div>
  `).join('');
  $('overviewContent').querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => openLink(el.dataset.open)));
}
function findLinkById(id) {
  for (const w of state.workspaces) {
    const l = w.links.find(x => x.id === id);
    if (l) return l;
  }
  return null;
}
function openLink(id) {
  const link = findLinkById(id);
  if (!link) return;
  link.accessCount = (link.accessCount || 0) + 1;
  saveState();
  window.open(normalizeUrl(link.url), '_blank', 'noopener,noreferrer');
}

function render() {
  const active = activeWorkspace();
  state.activeWorkspaceId = active.id;

  const overviewClass = currentView === 'overview' ? 'active' : '';
  const overviewShell = currentView === 'overview' ? 'active-shell' : '';
  const overviewTab = `<div class="${overviewShell}">
    <button class="workspace-tab ${overviewClass}" type="button" data-view="overview">
      <span class="tab-name">概要</span>
    </button>
  </div>`;

  $('workspaceList').innerHTML = overviewTab + state.workspaces.map(w => {
    const activeClass = w.id === active.id && currentView !== 'overview' ? 'active' : '';
    const shell = w.id === active.id && currentView !== 'overview' ? 'active-shell' : '';
    return `<div class="${shell}">
      <button class="workspace-tab ${activeClass}" type="button" data-workspace-id="${w.id}">
        <span class="tab-name">${esc(w.title)}</span>
        <span class="count">${w.links.length}</span>
      </button>
    </div>`;
  }).join('');

  if (currentView === 'overview') {
    $('workspaceView').style.display = 'none';
    $('overviewView').style.display = '';
    renderOverview();
  } else {
    $('overviewView').style.display = 'none';
    $('workspaceView').style.display = '';
    $('workspaceTitle').textContent = active.title;
    $('memo').value = active.memo || '';
    $('linkCount').textContent = `${active.links.length}件`;

    if (!active.links.length) {
      $('linkList').innerHTML = `
        <div class="empty">
          <div class="empty-icon"><span class="material-symbols-outlined">link</span></div>
          <strong>リンクを追加しましょう</strong>
          <p>毎日開くサイトやダッシュボードを登録すると、ここからまとめて起動できます。</p>
          <md-filled-button id="emptyAddBtn">リンクを追加</md-filled-button>
        </div>`;
      $('emptyAddBtn').addEventListener('click', () => openLinkDialog());
    } else {
      $('linkList').innerHTML = active.links.map(link => `
        <div class="link-row" data-link-id="${link.id}">
          <div class="link-icon"><img src="${esc(favicon(link.url))}" alt="" width="22" height="22" loading="lazy" onerror="this.style.display='none'"></div>
          <div class="link-main" data-open="${link.id}" title="新しいタブで開く">
            <div class="link-title">${esc(link.name)}</div>
            <div class="link-url">${esc(link.url)}</div>
          </div>
          <div class="row-actions">
            <md-icon-button class="menu-button" data-menu="${link.id}" aria-label="その他">
              <span class="material-symbols-outlined">more_vert</span>
            </md-icon-button>
          </div>
        </div>
      `).join('');
      $('linkList').querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => openLink(el.dataset.open)));
      $('linkList').querySelectorAll('[data-menu]').forEach(el => el.addEventListener('click', e => openRowMenu(e, el.dataset.menu)));
    }
  }

  document.querySelectorAll('[data-workspace-id]').forEach(el => {
    el.addEventListener('click', () => { state.activeWorkspaceId = el.dataset.workspaceId; currentView = 'links'; render(); });
  });
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => { currentView = el.dataset.view; render(); });
  });
  saveState();
}

function normalizeUrl(v) { return /^https?:\/\//i.test(v) ? v : `https://${v}`; }
function openLink(id) {
  const link = findLinkById(id);
  if (!link) return;
  link.accessCount = (link.accessCount || 0) + 1;
  saveState();
  window.open(normalizeUrl(link.url), '_blank', 'noopener,noreferrer');
}
async function showDialog(dialog) { if (dialog.updateComplete) await dialog.updateComplete; dialog.show(); }
function closeDialog(dialog) { dialog.close(); }

function openRowMenu(event, id) {
  event.stopPropagation();
  selectedLinkId = id;
  const menu = $('rowMenu');
  menu.anchorElement = event.currentTarget;
  menu.show();
}

$('menuEdit').addEventListener('click', () => {
  const link = activeWorkspace().links.find(l => l.id === selectedLinkId);
  if (link) openLinkDialog(link);
  $('rowMenu').close();
});
$('menuDelete').addEventListener('click', () => {
  const active = activeWorkspace();
  active.links = active.links.filter(l => l.id !== selectedLinkId);
  selectedLinkId = null;
  saveState();
  render();
  $('rowMenu').close();
});

function openLinkDialog(link = null) {
  editingLinkId = link ? link.id : null;
  $('linkDialogTitle').textContent = link ? 'リンクを編集' : 'リンクを追加';
  $('nameField').value = link?.name || '';
  $('urlField').value = link?.url || '';
  showDialog($('linkDialog'));
  setTimeout(() => $('nameField').focus(), 80);
}

$('linkSaveBtn').addEventListener('click', () => {
  const name = String($('nameField').value || '').trim();
  const urlInput = String($('urlField').value || '').trim();
  if (!name || !urlInput) return;
  const url = normalizeUrl(urlInput);
  const active = activeWorkspace();
  if (editingLinkId) {
    const link = active.links.find(l => l.id === editingLinkId);
    if (link) { link.name = name; link.url = url; }
  } else {
    active.links.push({ id: uid(), name, url });
  }
  saveState();
  closeDialog($('linkDialog'));
  render();
});
$('linkCancelBtn').addEventListener('click', () => closeDialog($('linkDialog')));
$('addLinkBtn').addEventListener('click', () => openLinkDialog());

$('addWorkspaceBtn').addEventListener('click', () => {
  editingWorkspaceId = null;
  $('workspaceDialogHeadline').textContent = '新しい起動ボード';
  $('workspaceNameField').value = '';
  $('workspaceSaveBtn').textContent = '追加';
  showDialog($('workspaceDialog'));
  setTimeout(() => $('workspaceNameField').focus(), 80);
});
$('workspaceCancelBtn').addEventListener('click', () => closeDialog($('workspaceDialog')));
$('workspaceSaveBtn').addEventListener('click', () => {
  const title = String($('workspaceNameField').value || '').trim();
  if (!title) return;
  if (editingWorkspaceId) {
    const workspace = state.workspaces.find(w => w.id === editingWorkspaceId);
    if (workspace) workspace.title = title;
  } else {
    const workspace = { id: uid(), title, memo: '', links: [] };
    state.workspaces.push(workspace);
    state.activeWorkspaceId = workspace.id;
  }
  editingWorkspaceId = null;
  saveState();
  closeDialog($('workspaceDialog'));
  render();
});

function openWorkspaceMenu(event) {
  event.stopPropagation();
  const menu = $('workspaceMenu');
  menu.anchorElement = event.currentTarget;
  menu.show();
}

$('workspaceMenuBtn').addEventListener('click', openWorkspaceMenu);

$('menuWorkspaceEdit').addEventListener('click', () => {
  const active = activeWorkspace();
  editingWorkspaceId = active.id;
  $('workspaceDialogHeadline').textContent = '名前を編集';
  $('workspaceNameField').value = active.title;
  $('workspaceSaveBtn').textContent = '保存';
  showDialog($('workspaceDialog'));
  setTimeout(() => $('workspaceNameField').focus(), 80);
  $('workspaceMenu').close();
});

$('menuWorkspaceDelete').addEventListener('click', () => {
  showDialog($('deleteWorkspaceDialog'));
  $('workspaceMenu').close();
});

$('deleteWorkspaceCancelBtn').addEventListener('click', () => closeDialog($('deleteWorkspaceDialog')));
$('deleteWorkspaceConfirmBtn').addEventListener('click', () => {
  const active = activeWorkspace();
  const idx = state.workspaces.findIndex(w => w.id === active.id);
  if (idx === -1) return;
  state.workspaces.splice(idx, 1);
  state.activeWorkspaceId = state.workspaces[0]?.id || null;
  saveState();
  closeDialog($('deleteWorkspaceDialog'));
  render();
});

$('launchAllBtn').addEventListener('click', () => {
  activeWorkspace().links.forEach((link, index) => setTimeout(() => openLink(link.id), index * 80));
});
$('memo').addEventListener('input', () => {
  activeWorkspace().memo = $('memo').value;
  saveState();
});

(async () => {
  state = await loadState();
  render();
})();
