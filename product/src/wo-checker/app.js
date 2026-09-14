const STORAGE_KEY = 'wo-checker-v3';
const IDB_DB_NAME = 'checker-db';
const IDB_STORE = 'app-state';
const IDB_KEY = 'state';
const $ = (id) => document.getElementById(id);

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
const defaultData = {
  workspaces: [
    { id: uid(), title: '仕事', memo: 'ここにメモを入力できます。内容は自動的に保存されますのでご安心ください。', items: [
      { id: uid(), text: '資料を準備する', done: false },
      { id: uid(), text: '会議に出席する', done: true },
    ] },
    { id: uid(), title: '買い物', memo: '', items: [
      { id: uid(), text: '牛乳', done: false },
      { id: uid(), text: 'パン', done: false },
    ] },
    { id: uid(), title: '旅行', memo: '', items: [] }
  ],
  activeWorkspaceId: null
};
defaultData.activeWorkspaceId = defaultData.workspaces[0].id;

let state = structuredClone(defaultData);
let selectedTaskId = null;
let editingTaskId = null;
let selectedWorkspaceId = null;
let editingWorkspaceId = null;

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== 'object') return structuredClone(defaultData);
  if (!Array.isArray(parsed.workspaces) || !parsed.workspaces.length) return structuredClone(defaultData);
  parsed.workspaces.forEach(w => {
    if (w.links && Array.isArray(w.links)) {
      w.items = w.links.map(l => ({
        id: l.id || uid(),
        text: l.name || l.url || '',
        done: false
      }));
      delete w.links;
    } else if (!w.items || !Array.isArray(w.items)) {
      w.items = [];
    } else {
      w.items = w.items.map(it => ({
        id: it.id || uid(),
        text: it.text || it.name || '',
        done: !!it.done
      }));
    }
    w.memo ||= '';
  });
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
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('wo-checker-v1') || localStorage.getItem('wo-checker-v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      await idbSet(normalized);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('wo-checker-v1');
      localStorage.removeItem('wo-checker-v2');
      return normalized;
    }
  } catch {}
  return loaded;
}

function saveState() { idbSet(state); }
function activeWorkspace() { return state.workspaces.find(w => w.id === state.activeWorkspaceId) || state.workspaces[0]; }
function esc(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function render() {
  const active = activeWorkspace();
  state.activeWorkspaceId = active.id;

  $('workspaceList').innerHTML = state.workspaces.map(w => {
    const activeClass = w.id === active.id ? 'active' : '';
    const shell = w.id === active.id ? 'active-shell' : '';
    const doneCount = (w.items || []).filter(i => i.done).length;
    return `<div class="${shell}">
      <button class="workspace-tab ${activeClass}" type="button" data-workspace-id="${w.id}">
        <span class="tab-name">${esc(w.title)}</span>
        <span class="count">${doneCount}/${w.items.length}</span>
      </button>
    </div>`;
  }).join('');

  $('workspaceView').style.display = '';
  $('workspaceTitle').textContent = active.title;
  $('memo').value = active.memo || '';
  const total = active.items.length;
  const done = active.items.filter(i => i.done).length;
  $('taskCount').textContent = `${total}件中${done}件完了`;

  if (!active.items.length) {
    $('taskList').innerHTML = `
      <div class="empty">
        <div class="empty-icon"><span class="material-symbols-outlined">checklist</span></div>
        <strong>タスクを追加しましょう</strong>
        <p>持ち物ややることを登録して、チェックしていきましょう。</p>
        <md-filled-button id="emptyAddBtn">タスクを追加</md-filled-button>
      </div>`;
    $('emptyAddBtn').addEventListener('click', () => openTaskDialog());
  } else {
    $('taskList').innerHTML = active.items.map(task => `
      <div class="task-row ${task.done ? 'done' : ''}" data-task-id="${task.id}">
        <div class="task-check">
          <md-checkbox ${task.done ? 'checked' : ''} data-toggle="${task.id}" aria-label="タスクを切替"></md-checkbox>
        </div>
        <div class="task-main" data-edit="${task.id}" title="ダブルクリックで編集">
          <div class="task-text">${esc(task.text)}</div>
        </div>
        <div class="row-actions">
          <md-icon-button class="menu-button" data-menu="${task.id}" aria-label="その他">
            <span class="material-symbols-outlined">more_vert</span>
          </md-icon-button>
        </div>
      </div>
    `).join('');
    $('taskList').querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('change', () => toggleTask(el.dataset.toggle)));
    $('taskList').querySelectorAll('[data-edit]').forEach(el => el.addEventListener('dblclick', () => openTaskDialog(active.items.find(t => t.id === el.dataset.edit))));
    $('taskList').querySelectorAll('[data-menu]').forEach(el => el.addEventListener('click', e => openRowMenu(e, el.dataset.menu)));
  }

  document.querySelectorAll('[data-workspace-id]').forEach(el => {
    el.addEventListener('click', () => { state.activeWorkspaceId = el.dataset.workspaceId; render(); });
  });
  saveState();
}

function toggleTask(id) {
  const task = activeWorkspace().items.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveState();
  render();
}

function openRowMenu(event, id) {
  event.stopPropagation();
  selectedTaskId = id;
  const menu = $('rowMenu');
  menu.anchorElement = event.currentTarget;
  menu.show();
}

$('menuEdit').addEventListener('click', () => {
  const task = activeWorkspace().items.find(t => t.id === selectedTaskId);
  if (task) openTaskDialog(task);
  $('rowMenu').close();
});
$('menuDelete').addEventListener('click', () => {
  const active = activeWorkspace();
  active.items = active.items.filter(t => t.id !== selectedTaskId);
  selectedTaskId = null;
  saveState();
  render();
  $('rowMenu').close();
});

function openTaskDialog(task = null) {
  editingTaskId = task ? task.id : null;
  $('taskDialogTitle').textContent = task ? 'タスクを編集' : 'タスクを追加';
  $('taskTextField').value = task?.text || '';
  showDialog($('taskDialog'));
  setTimeout(() => $('taskTextField').focus(), 80);
}

$('taskSaveBtn').addEventListener('click', () => {
  const text = String($('taskTextField').value || '').trim();
  if (!text) return;
  const active = activeWorkspace();
  if (editingTaskId) {
    const task = active.items.find(t => t.id === editingTaskId);
    if (task) { task.text = text; }
  } else {
    active.items.push({ id: uid(), text, done: false });
  }
  saveState();
  closeDialog($('taskDialog'));
  render();
});
$('taskCancelBtn').addEventListener('click', () => closeDialog($('taskDialog')));

function quickAdd() {
  const text = String($('quickAddField').value || '').trim();
  if (!text) return;
  activeWorkspace().items.push({ id: uid(), text, done: false });
  $('quickAddField').value = '';
  saveState();
  render();
  $('quickAddField').focus();
}
$('quickAddBtn').addEventListener('click', quickAdd);
$('quickAddField').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } });

$('addWorkspaceBtn').addEventListener('click', () => {
  editingWorkspaceId = null;
  $('workspaceDialogHeadline').textContent = '新しいボード';
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
    const workspace = { id: uid(), title, memo: '', items: [] };
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

$('clearDoneBtn').addEventListener('click', () => {
  activeWorkspace().items = activeWorkspace().items.filter(t => !t.done);
  saveState();
  render();
});
$('memo').addEventListener('input', () => {
  activeWorkspace().memo = $('memo').value;
  saveState();
});

async function showDialog(dialog) { if (dialog.updateComplete) await dialog.updateComplete; dialog.show(); }
function closeDialog(dialog) { dialog.close(); }

(async () => {
  state = await loadState();
  render();
})();
