// Material Webは単一エントリポイントから一度だけ読み込みます。
// 個別コンポーネントのCDNモジュールを複数URLから混在させると、
// md-focus-ringなどのCustom Elementが二重defineされる可能性があるためです。
import 'https://esm.run/@material/web@2.5.0/all.js';

const STRINGS = window.STRINGS;

const APP_PREFIX = '[FilesTaco]';
const DRIVE_SESSION_KEY = 'filesTaco.driveSession.v8';
const UI_STATE_KEY = 'filesTaco.ui.v3';
const THUMBNAIL_CONCURRENCY = 4;
const NOTE_SAVE_DELAY = 5000;
const DRIVE_SESSION_TTL_MS = 55 * 60 * 1000;
const BUSY_FADE_MS = 220;
const DRIVE_OAUTH_CLIENT_ID = '446332406390-pak3i9q72sefb2k57q9hhv4ovt4sebfq.apps.googleusercontent.com';
const DRIVE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/forms.body',
].join(' ');
const DRIVE_GRANT_KEY = 'filesTaco.driveGrant.v1';
const DRIVE_GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';


const FT_CONFIG = Object.freeze({
  workerBaseUrl: 'https://files-taco.takesen2278.workers.dev',
});

const dom = {
  homeView: document.getElementById('ft-home-view'),
  dashboardView: document.getElementById('ft-dashboard-view'),
  managerView: document.getElementById('ft-project-manager-view'),
  publicView: document.getElementById('ft-public-view'),
  publicProject: document.getElementById('ft-public-project'),
  managerContent: document.getElementById('ft-manager-content'),
  authStatus: document.getElementById('ft-auth-status'),
  homeDriveConnectButton: document.getElementById('ft-home-login-button'),
  logoutButton: document.getElementById('ft-logout-button'),
  driveConnectButton: document.getElementById('ft-drive-connect-button'),
  createProjectButton: document.getElementById('ft-create-project-button'),
  projectCreateDialog: document.getElementById('ft-project-create-dialog'),
  projectCreateName: document.getElementById('ft-project-create-name'),
  projectCreateCancel: document.getElementById('ft-project-create-cancel'),
  projectCreateConfirm: document.getElementById('ft-project-create-confirm'),
  projectList: document.getElementById('ft-project-list'),
  snackbar: document.getElementById('ft-snackbar'),
  snackbarMessage: document.getElementById('ft-snackbar-message'),
  nameDialog: document.getElementById('ft-name-dialog'),
  nameDialogInput: document.getElementById('ft-name-dialog-input'),
  nameDialogTitle: document.getElementById('ft-name-dialog-title'),
  nameDialogCancel: document.getElementById('ft-name-dialog-cancel'),
  nameDialogConfirm: document.getElementById('ft-name-dialog-confirm'),
  deleteDialog: document.getElementById('ft-delete-dialog'),
  deleteDialogContent: document.getElementById('ft-delete-dialog-content'),
  deleteDialogCancel: document.getElementById('ft-delete-dialog-cancel'),
  deleteDialogConfirm: document.getElementById('ft-delete-dialog-confirm'),
  createDialog: document.getElementById('ft-create-dialog'),
  createDialogTitle: document.getElementById('ft-create-dialog-title'),
  createDialogName: document.getElementById('ft-create-dialog-name'),
  createDialogUrl: document.getElementById('ft-create-dialog-url'),
  createDialogContent: document.getElementById('ft-create-dialog-content-input'),
  createDialogCancel: document.getElementById('ft-create-dialog-cancel'),
  createDialogConfirm: document.getElementById('ft-create-dialog-confirm'),
  shareDialog: document.getElementById('ft-share-dialog'),
  shareEmail: document.getElementById('ft-share-email'),
  shareAddButton: document.getElementById('ft-share-add-button'),
  shareCloseButton: document.getElementById('ft-share-close-button'),
  shareList: document.getElementById('ft-share-list'),
  shareLinkDialog: document.getElementById('ft-share-link-dialog'),
  shareLinkInput: document.getElementById('ft-share-link-input'),
  shareLinkCopyButton: document.getElementById('ft-share-link-copy-button'),
  shareLinkCloseButton: document.getElementById('ft-share-link-close-button'),
  busyOverlay: document.getElementById('ft-busy-overlay'),
  busyLabel: document.getElementById('ft-busy-label'),
};

function validateDom() {
  let valid = true;
  for (const [key, element] of Object.entries(dom)) {
    if (!element) {
      console.error(`${APP_PREFIX} ❌ 必須DOMがありません: ${key}`);
      valid = false;
    }
  }
  if (valid) console.log(`${APP_PREFIX} ✅ DOM初期化完了`);
  return valid;
}

if (!validateDom()) {
  throw new Error(`${APP_PREFIX} DOM初期化に失敗しました`);
}


let currentDriveUser = null;
let driveAccessToken = null;
let driveTokenClient = null;
let driveGisPromise = null;
let driveTokenRequestPromise = null;
let driveTokenExpiresAt = 0;
let driveConnectionRequired = false;
let currentRouteKey = '';
let activeManagerProject = null;
let publicProject = null;
let noteTimers = new Map();
let memoTimers = new Map();
let thumbnailQueue = [];
let thumbnailActive = 0;
let thumbnailObserver = null;
let pendingDialogAction = null;
let pendingDelete = null;
let createDialogMode = null;
let mutationQueue = Promise.resolve();
const projectCache = new Map();
const objectUrls = new Set();

function logSuccess(message, data = undefined) {
  if (data === undefined) console.log(`${APP_PREFIX} ✅ ${message}`);
  else console.log(`${APP_PREFIX} ✅ ${message}`, data);
}
function logInfo(message, data = undefined) {
  if (data === undefined) console.log(`${APP_PREFIX} ℹ️ ${message}`);
  else console.log(`${APP_PREFIX} ℹ️ ${message}`, data);
}
function logError(message, error = undefined) {
  if (error === undefined) console.error(`${APP_PREFIX} ❌ ${message}`);
  else console.error(`${APP_PREFIX} ❌ ${message}`, error);
}

let snackbarTimer = null;
function showSnackbar(message, { error = false, duration = 3600 } = {}) {
  if (!dom.snackbar || !dom.snackbarMessage) {
    console.error(`${APP_PREFIX} ❌ SnackbarのDOMがありません`);
    return;
  }

  const icon = dom.snackbar.querySelector('[data-snackbar-icon]');
  if (!icon) {
    console.error(`${APP_PREFIX} ❌ Snackbarアイコンがありません`);
  } else {
    icon.textContent = error ? 'error' : 'check_circle';
  }

  dom.snackbarMessage.textContent = String(message ?? '');
  dom.snackbar.classList.toggle('is-error', error);
  dom.snackbar.classList.remove('is-visible');
  void dom.snackbar.offsetWidth;
  dom.snackbar.classList.add('is-visible');

  if (snackbarTimer) clearTimeout(snackbarTimer);
  snackbarTimer = window.setTimeout(() => {
    dom.snackbar.classList.remove('is-visible');
    snackbarTimer = null;
  }, Math.max(1000, Number(duration) || 3600));

  console.log(`${APP_PREFIX} ${error ? '❌' : '✅'} Snackbar: ${message}`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeCssEscape(value) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getProjectIdFromUrl() {
  const id = new URLSearchParams(window.location.search).get('project');
  return id && /^[A-Za-z0-9_-]{10,220}$/.test(id) ? id : null;
}

function getProjectUrl(projectId) {
  return `${window.location.origin}${window.location.pathname}?project=${encodeURIComponent(projectId)}`;
}

function clearProjectQueryParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('project')) return;
    url.searchParams.delete('project');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    logSuccess(STRINGS.publicUrlCleared);
  } catch (error) {
    logError(STRINGS.urlUpdateFailed, error);
  }
}

function setView(name) {
  const views = { home: dom.homeView, dashboard: dom.dashboardView, manager: dom.managerView, public: dom.publicView };
  for (const [key, element] of Object.entries(views)) {
    if (!element) {
      console.error(`${APP_PREFIX} ❌ ビューがありません: ${key}`);
      continue;
    }
    element.classList.toggle('is-hidden', key !== name);
  }
  logInfo(`表示ビュー: ${name}`);
}

let busyDepth = 0;
let busyHideTimer = null;

function showBusy(message = STRINGS.busyDefault) {
  busyDepth += 1;

  if (!dom.busyOverlay) {
    console.error(`${APP_PREFIX} ❌ 処理オーバーレイがありません`);
    return;
  }

  if (busyHideTimer) {
    window.clearTimeout(busyHideTimer);
    busyHideTimer = null;
  }

  if (dom.busyLabel) dom.busyLabel.textContent = message;
  dom.busyOverlay.classList.add('is-visible');
  dom.busyOverlay.setAttribute('aria-hidden', 'false');
  console.log(`${APP_PREFIX} ℹ️ Progress表示: ${message}`);
}

function hideBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
  if (busyDepth > 0 || !dom.busyOverlay) return;

  dom.busyOverlay.classList.remove('is-visible');
  dom.busyOverlay.setAttribute('aria-hidden', 'true');

  busyHideTimer = window.setTimeout(() => {
    busyHideTimer = null;
    console.log(`${APP_PREFIX} ✅ Progressフェードアウト完了`);
  }, BUSY_FADE_MS);
}
async function withBusy(task, message = STRINGS.busyDefault) {
  showBusy(message);
  try { return await task(); } finally { hideBusy(); }
}


function isDriveTokenValid() {
  return Boolean(driveAccessToken && driveTokenExpiresAt > Date.now() + 60_000);
}

function hasStoredDriveGrant() {
  try {
    return localStorage.getItem(DRIVE_GRANT_KEY) === 'true';
  } catch (error) {
    console.error(`${APP_PREFIX} ❌ Drive認可状態の読み込み失敗`, error);
    return false;
  }
}

function markDriveGrantEstablished() {
  try {
    localStorage.setItem(DRIVE_GRANT_KEY, 'true');
    console.log(`${APP_PREFIX} ✅ Google Drive認可済み状態を保存しました`);
  } catch (error) {
    console.error(`${APP_PREFIX} ❌ Drive認可状態の保存失敗`, error);
  }
}

function updateHeader() {
  const driveReady = isDriveTokenValid();
  const driveNeedsConnection = Boolean(driveConnectionRequired || !driveReady);
  dom.authStatus.textContent = driveReady
    ? (currentDriveUser?.emailAddress || currentDriveUser?.displayName || STRINGS.driveConnected)
    : '';
  dom.logoutButton.textContent = STRINGS.logout;
  dom.logoutButton.classList.toggle('is-hidden', !driveReady);
  dom.createProjectButton.classList.toggle('is-hidden', !driveReady);
  dom.driveConnectButton.classList.toggle('is-hidden', !driveNeedsConnection);
  dom.driveConnectButton.setAttribute('aria-disabled', String(!driveNeedsConnection));
  dom.homeDriveConnectButton?.classList.toggle('is-hidden', driveReady);
  console.log(`${APP_PREFIX} ℹ️ ヘッダー更新: driveReady=${driveReady}, driveNeedsConnection=${driveNeedsConnection}, email=${currentDriveUser?.emailAddress || ''}`);
}

function readDriveSession() {
  try {
    const raw = localStorage.getItem(DRIVE_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() + 60_000) {
      localStorage.removeItem(DRIVE_SESSION_KEY);
      return null;
    }
    return data;
  } catch (error) {
    console.error(`${APP_PREFIX} ❌ Driveセッション読み込み失敗`, error);
    try { localStorage.removeItem(DRIVE_SESSION_KEY); } catch (removeError) { console.error(`${APP_PREFIX} ❌ Driveセッション削除失敗`, removeError); }
    return null;
  }
}

function saveDriveSession(token, expiresAt) {
  try {
    localStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({ token, expiresAt }));
    driveConnectionRequired = false;
    console.log(`${APP_PREFIX} ✅ Driveセッションを保存しました`);
  } catch (error) {
    console.error(`${APP_PREFIX} ❌ Driveセッション保存失敗`, error);
  }
}

function clearDriveSession({ required = false } = {}) {
  driveAccessToken = null;
  driveTokenExpiresAt = 0;
  currentDriveUser = null;
  driveConnectionRequired = Boolean(required);
  try {
    localStorage.removeItem(DRIVE_SESSION_KEY);
  } catch (error) {
    console.error(`${APP_PREFIX} ❌ Driveセッション削除失敗`, error);
  }
  updateHeader();
  console.log(`${APP_PREFIX} ✅ Driveセッションを解除しました`);
}

function restoreDriveSession() {
  const saved = readDriveSession();
  if (!saved) {
    updateHeader();
    return false;
  }
  driveAccessToken = saved.token;
  driveTokenExpiresAt = saved.expiresAt;
  driveConnectionRequired = false;
  updateHeader();
  logSuccess(STRINGS.driveSessionRestored);
  return true;
}

function waitForDriveGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (driveGisPromise) return driveGisPromise;

  driveGisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${DRIVE_GIS_SCRIPT_URL}"]`);
    const script = existing || document.createElement('script');
    let settled = false;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (error) {
        console.error(`${APP_PREFIX} ❌ Google Identity Services読み込み失敗`, error);
        driveGisPromise = null;
        reject(error);
        return;
      }
      if (!window.google?.accounts?.oauth2) {
        const err = new Error(STRINGS.driveGisApiUnavailable);
        console.error(`${APP_PREFIX} ❌ ${err.message}`);
        driveGisPromise = null;
        reject(err);
        return;
      }
      logSuccess(STRINGS.driveGisLoaded);
      resolve();
    };

    script.addEventListener('load', () => finish(), { once: true });
    script.addEventListener('error', () => finish(new Error('Google Identity Services script load error')), { once: true });

    if (!existing) {
      script.src = DRIVE_GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    if (window.google?.accounts?.oauth2) finish();
  });

  return driveGisPromise;
}

async function initializeDriveTokenClient() {
  await waitForDriveGis();
  if (driveTokenClient) return driveTokenClient;
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error(STRINGS.driveGisTokenClientUnavailable);
  }

  driveTokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_OAUTH_CLIENT_ID,
    scope: DRIVE_OAUTH_SCOPES,
    include_granted_scopes: true,
    callback: (response) => {
      const pending = driveTokenRequestPromise;
      driveTokenRequestPromise = null;
      if (!response || response.error || !response.access_token) {
        const error = new Error(response?.error_description || response?.error || STRINGS.driveTokenMissing);
        logError(STRINGS.driveTokenError, response || error);
        pending?.reject(error);
        return;
      }
      const expiresIn = Number(response.expires_in);
      const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 60 ? expiresIn : 3600;
      driveAccessToken = response.access_token;
      driveTokenExpiresAt = Date.now() + (safeExpiresIn * 1000);
      driveConnectionRequired = false;
      saveDriveSession(driveAccessToken, driveTokenExpiresAt);
      markDriveGrantEstablished();
      updateHeader();
      logSuccess(STRINGS.driveTokenSuccess, { expiresIn: safeExpiresIn });
      pending?.resolve(true);
    },
  });
  logSuccess(STRINGS.driveTokenClientInit);
  return driveTokenClient;
}

async function requestDriveAccessToken({ interactive = false, force = false } = {}) {
  if (!force && isDriveTokenValid()) return true;
  if (driveTokenRequestPromise) return driveTokenRequestPromise;

  const client = await initializeDriveTokenClient();
  driveTokenRequestPromise = new Promise((resolve, reject) => {
    // Never open an OAuth popup during bootstrap/automatic processing.
    // A popup is allowed only from the explicit Drive-connect button action.
    const prompt = interactive && !hasStoredDriveGrant() ? 'select_account' : '';
    try {
      client.requestAccessToken({ prompt });
      console.log(`${APP_PREFIX} ℹ️ Driveアクセストークン要求: interactive=${Boolean(interactive)}, prompt=${prompt || 'silent'}`);
    } catch (error) {
      driveTokenRequestPromise = null;
      logError(STRINGS.driveTokenRequestFailed, error);
      reject(error);
    }
  });
  return driveTokenRequestPromise;
}

async function refreshDriveUser() {
  if (!isDriveTokenValid()) {
    console.error(`${APP_PREFIX} ❌ Driveユーザー情報取得時のアクセストークンがありません`);
    return false;
  }
  try {
    const data = await readApiResponse(await apiFetch('/api/drive/me', {}, { retry401: false }));
    currentDriveUser = data.user || null;
    updateHeader();
    logSuccess(STRINGS.driveUserSuccess, currentDriveUser);
    return true;
  } catch (error) {
    logError(STRINGS.driveUserFailed, error);
    return false;
  }
}

async function connectDrive({ force = false, quiet = false, interactive = true } = {}) {
  const userInitiated = Boolean(interactive) && !quiet;
  try {
    if (!force && restoreDriveSession()) {
      if (await refreshDriveUser()) {
        driveConnectionRequired = false;
        updateHeader();
        logSuccess(STRINGS.driveSessionValidated);
        if (userInitiated && !getProjectIdFromUrl()) {
          const loaded = await loadProjects({ initial: !dom.projectList.children.length });
          if (loaded) {
            publicProject = null;
            activeManagerProject = null;
            currentRouteKey = 'dashboard';
            clearProjectQueryParam();
            setView('dashboard');
            logSuccess(STRINGS.driveRedirectToProjects);
          }
        }
        return true;
      }
      clearDriveSession({ required: true });
    }

    dom.driveConnectButton.disabled = true;
    dom.homeDriveConnectButton && (dom.homeDriveConnectButton.disabled = true);
    const tokenInteractive = userInitiated;
    logInfo(`Google Drive接続開始: interactive=${tokenInteractive}, force=${force}`);
    await requestDriveAccessToken({ interactive: tokenInteractive, force: true });
    if (!await refreshDriveUser()) throw new Error(STRINGS.driveUserMissing);
    driveConnectionRequired = false;
    updateHeader();
    if (!quiet) showSnackbar(STRINGS.connectDrive);

    const publicId = getProjectIdFromUrl();
    if (publicId) {
      await hydratePublicProjectMetadata(publicId);
      const publicItems = dom.publicProject?.querySelector('#ft-public-items');
      if (!publicItems) console.error(`${APP_PREFIX} ❌ 公開アイテムコンテナが見つかりません`);
      if (publicItems) scheduleAllThumbnails(publicItems, publicId);
    } else {
      // Registration/authorization is complete here. Always move the user to the project list.
      const loaded = await loadProjects({ initial: !dom.projectList.children.length });
      if (!loaded) throw new Error(STRINGS.driveFetchFailed);
      publicProject = null;
      activeManagerProject = null;
      currentRouteKey = 'dashboard';
      clearProjectQueryParam();
      setView('dashboard');
      logSuccess(STRINGS.driveAutoRedirect);
    }
    return true;
  } catch (error) {
    logError(STRINGS.driveConnectFailed, error);
    driveConnectionRequired = true;
    updateHeader();
    if (!quiet) showSnackbar(`Driveに接続できませんでした: ${error?.message || '不明なエラー'}`, { error: true, duration: 5200 });
    return false;
  } finally {
    dom.driveConnectButton.disabled = false;
    if (dom.homeDriveConnectButton) dom.homeDriveConnectButton.disabled = false;
  }
}

async function disconnectDrive() {
  clearDriveSession({ required: false });
  activeManagerProject = null;
  publicProject = null;
  projectCache.clear();
  currentRouteKey = 'home';
  setView('home');
  showSnackbar(STRINGS.disconnectDrive);
  logSuccess(STRINGS.driveDisconnectSuccess);
}

async function ensureDriveConnected({ interactive = false } = {}) {
  if (isDriveTokenValid()) return true;
  if (restoreDriveSession() && isDriveTokenValid()) {
    if (await refreshDriveUser()) return true;
    clearDriveSession({ required: true });
  }

  driveConnectionRequired = true;
  updateHeader();

  if (!interactive) {
    logInfo(STRINGS.noAutoOAuth);
    return false;
  }

  try {
    logInfo(STRINGS.driveConnectUserStart);
    await requestDriveAccessToken({ interactive: true, force: true });
    if (!await refreshDriveUser()) throw new Error(STRINGS.driveUserMissing);
    driveConnectionRequired = false;
    updateHeader();
    logSuccess(STRINGS.driveConnectUserSuccess);
    return true;
  } catch (error) {
    driveConnectionRequired = true;
    updateHeader();
    logError(STRINGS.driveConnectUserFailed, error);
    showSnackbar(STRINGS.allowDriveAccess, { error: true, duration: 5200 });
    return false;
  }
}

async function apiFetch(path, options = {}, { authRequired = true, retry401 = true } = {}) {
  const url = new URL(path, `${FT_CONFIG.workerBaseUrl}/`);
  const headers = new Headers(options.headers || {});

  if (authRequired) {
    if (!isDriveTokenValid()) {
      if (!restoreDriveSession() || !isDriveTokenValid()) {
        driveConnectionRequired = true;
        updateHeader();
        throw new Error(STRINGS.driveConnectionRequired);
      }
    }
    headers.set('X-Drive-Access-Token', driveAccessToken);
  }

  let response = await fetch(url, { ...options, headers, mode: 'cors' });

  if (response.status === 401 && authRequired && retry401) {
    clearDriveSession({ required: true });
    updateHeader();
    logInfo(STRINGS.api401NoAutoOAuth);
  }

  if (response.status === 401 && authRequired) {
    driveConnectionRequired = true;
    updateHeader();
    logInfo(STRINGS.driveAuthRequired);
  }
  return response;
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let payload = {};
  if (contentType.includes('application/json')) {
    try { payload = await response.json(); } catch (error) { console.error(`${APP_PREFIX} ❌ JSONレスポンス解析失敗`, error); }
  } else {
    const text = await response.text().catch(() => '');
    payload = text ? { error: text } : {};
  }
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || `API Error (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function showDashboardSkeleton() {
  if (!dom.projectList.children.length) {
    dom.projectList.innerHTML = '<div class="ft-skeleton"></div><div class="ft-skeleton"></div><div class="ft-skeleton"></div><div class="ft-skeleton"></div>';
  }
}

function renderProjectList(projects) {
  dom.projectList.replaceChildren();
  const sorted = [...projects].sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  if (!sorted.length) {
    dom.projectList.innerHTML = '<div class="ft-public-empty">プロジェクトはありません。</div>';
    logSuccess(STRINGS.projectListEmpty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const project of sorted) {
    const card = document.createElement('article');
    card.className = 'ft-project-card';
    card.dataset.projectCardId = project.projectId;
    const title = document.createElement('div');
    title.innerHTML = `<h3>${escapeHtml(project.name || STRINGS.projectNameFallback)}</h3><div class="ft-project-card-meta">${formatModifiedTime(project.modifiedTime)}</div>`;
    const actions = document.createElement('div');
    actions.className = 'ft-project-card-actions';
    actions.innerHTML = '<md-text-button data-project-view>閲覧</md-text-button><md-filled-button data-project-edit has-icon><md-icon slot="icon">edit</md-icon>編集</md-filled-button>';
    const viewButton = actions.querySelector('[data-project-view]');
    const editButton = actions.querySelector('[data-project-edit]');
    if (!viewButton || !editButton) console.error(`${APP_PREFIX} ❌ プロジェクト操作ボタン生成失敗`);
    viewButton?.addEventListener('click', () => { window.location.href = getProjectUrl(project.projectId); });
    editButton?.addEventListener('click', () => void openManagerProject(project.projectId));
    card.append(title, actions);
    fragment.appendChild(card);
    projectCache.set(project.projectId, structuredClone(project));
  }
  dom.projectList.appendChild(fragment);
  logSuccess(`プロジェクト一覧表示: ${sorted.length}件`);
}

function formatModifiedTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function loadProjects({ initial = false } = {}) {
  if (!await ensureDriveConnected()) return false;
  if (initial && !dom.projectList.children.length) showDashboardSkeleton();
  try {
    const data = await readApiResponse(await apiFetch('/api/projects'));
    const projects = Array.isArray(data.projects) ? data.projects : [];
    renderProjectList(projects);
    logSuccess(`プロジェクト一覧取得: ${projects.length}件`);
    return true;
  } catch (error) {
    logError(STRINGS.projectFetchFailed, error);
    showSnackbar(`プロジェクトを取得できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
    return false;
  } finally {
  }
}

function openProjectCreateDialog() {
  dom.projectCreateName.value = '';
  dom.projectCreateName.error = false;
  void dom.projectCreateDialog.show();
}

async function confirmProjectCreate() {
  const name = String(dom.projectCreateName.value ?? '').trim();
  if (!name) {
    dom.projectCreateName.error = true;
    dom.projectCreateName.errorText = STRINGS.projectNameRequired;
    return;
  }
  dom.projectCreateName.error = false;
  await dom.projectCreateDialog.close('create');
  if (!await ensureDriveConnected()) return;
  await withBusy(async () => {
    try {
      dom.createProjectButton.disabled = true;
      const data = await readApiResponse(await apiFetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      }));
      showSnackbar(STRINGS.projectCreateSuccess);
      logSuccess(STRINGS.projectCreateSuccess, data.project);
      await loadProjects({ initial: false });
      await openManagerProject(data.project.projectId, { project: data.project, force: true, manageBusy: false });
    } catch (error) {
      logError(STRINGS.projectCreateFailed, error);
      showSnackbar(`作成できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
    } finally {
      dom.createProjectButton.disabled = false;
    }
  }, STRINGS.projectCreating);
}


function itemKindLabel(item) {
  return {
    file: 'Drive', document: 'Docs', spreadsheet: 'Sheets', presentation: 'Slides', form: 'Forms', memo: STRINGS.addMemo, web: STRINGS.addWeb,
  }[item?.type] || 'Drive';
}

function itemIcon(item) {
  return {
    file: 'insert_drive_file', document: 'description', spreadsheet: 'table_chart', presentation: 'slideshow', form: 'checklist', memo: 'notes', web: 'language',
  }[item?.type] || 'insert_drive_file';
}

function getWebFavicon(url) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(parsed.hostname)}`;
  } catch {
    return '';
  }
}

function setThumbnailPlaceholder(img, visible) {
  if (!img) {
    console.error(`${APP_PREFIX} ❌ サムネイル対象画像がありません`);
    return false;
  }
  const preview = img.closest('.ft-item-preview');
  if (!preview) {
    console.error(`${APP_PREFIX} ❌ サムネイルプレビュー領域がありません`, img);
    return false;
  }
  const placeholder = preview.querySelector('.ft-thumb-placeholder');
  if (!placeholder) {
    console.error(`${APP_PREFIX} ❌ サムネイルプレースホルダーがありません`, img);
    return false;
  }
  placeholder.classList.toggle('is-hidden', !visible);
  return true;
}

async function downloadDriveItem(projectId, item) {
  if (!projectId || !item?.id) {
    logError(STRINGS.downloadInvalidTarget, { projectId, item });
    showSnackbar(STRINGS.downloadNotFound, { error: true });
    return;
  }
  if (item.type !== 'file') {
    logError(STRINGS.downloadNotFile, { projectId, itemId: item.id, type: item.type });
    showSnackbar(STRINGS.downloadNotAvailable, { error: true });
    return;
  }

  const button = document.querySelector(`[data-item-download="${safeCssEscape(item.id)}"]`);
  if (button) button.disabled = true;
  try {
    logInfo(STRINGS.downloadStart, { projectId, itemId: item.id, name: item.name });
    const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}/download/${encodeURIComponent(item.id)}`);
    if (!response.ok) {
      throw new Error(`download HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob || blob.size <= 0) throw new Error(STRINGS.emptyFile);

    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.name || 'download';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      try {
        if (objectUrls.has(url)) objectUrls.delete(url);
        URL.revokeObjectURL(url);
        logSuccess(STRINGS.downloadComplete, { itemId: item.id, name: item.name, bytes: blob.size });
      } catch (error) {
        logError(STRINGS.downloadUrlReleaseFailed, error);
      }
    }, 1000);
    showSnackbar(STRINGS.downloadStarted);
  } catch (error) {
    logError(STRINGS.downloadFailed, { itemId: item.id, error });
    showSnackbar(`ダウンロードできませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  } finally {
    if (button) button.disabled = false;
  }
}

function buildItemCard(project, item, { manager }) {
  const card = document.createElement('article');
  card.className = `ft-item-card${item.pending ? ' is-pending' : ''}${item.type === 'memo' ? ' ft-item-card-memo' : ''}`;
  card.dataset.itemCardId = item.id;
  card.dataset.orderId = String(item.order ?? 0);
  if (manager) {
    card.draggable = true;
    card.classList.add('ft-item-draggable');
  }

  const isWeb = item.type === 'web';
  const isMemo = item.type === 'memo';
  const title = item.name || (isWeb ? STRINGS.itemKindWeb : `${itemKindLabel(item)}ファイル`);
  const link = item.url || '#';
  let preview;
  if (isWeb) {
    const favicon = getWebFavicon(item.url);
    let host = '';
    try { host = new URL(item.url).hostname; } catch { host = ''; }
    preview = `<div class="ft-item-preview ft-web-preview"><img src="${escapeHtml(favicon)}" alt="" loading="lazy"><span class="ft-web-host">${escapeHtml(host)}</span></div>`;
  } else if (isMemo) {
    // メモにはサムネイル用プレビューを置かず、その高さを本文領域へ回します。
    preview = '';
  } else if (item.pending) {
    preview = `<div class="ft-item-preview"><md-circular-progress indeterminate></md-circular-progress></div>`;
  } else {
    const directThumbnail = typeof item.thumbnailLink === 'string' ? item.thumbnailLink.trim() : '';
    preview = `<div class="ft-item-preview"><img class="ft-item-thumbnail is-hidden" data-thumbnail-item-id="${escapeHtml(item.id)}" data-thumbnail-direct-url="${escapeHtml(directThumbnail)}" alt="${escapeHtml(title)}" loading="eager" decoding="async"><span class="ft-thumb-placeholder material-symbols-rounded">${itemIcon(item)}</span></div>`;
  }

  const note = manager ? `<textarea class="ft-item-note" data-note-id="${escapeHtml(item.id)}" rows="2" placeholder="メモ">${escapeHtml(item.note || '')}</textarea>` : (item.note ? `<div class="ft-item-note-view">${escapeHtml(item.note).replaceAll('\n', '<br>')}</div>` : '');

  const actions = manager && !item.pending ? `
    <div class="ft-item-actions">
      <md-icon-button data-item-open aria-label="開く"><md-icon>open_in_new</md-icon></md-icon-button>
      ${item.type === 'file' ? `<md-icon-button data-item-download="${escapeHtml(item.id)}" aria-label="ダウンロード"><md-icon>download</md-icon></md-icon-button>` : ''}
      <md-icon-button data-item-rename aria-label="名前変更"><md-icon>edit</md-icon></md-icon-button>
      <md-icon-button data-item-delete aria-label="削除"><md-icon>delete</md-icon></md-icon-button>
    </div>` : (!manager && !item.pending && item.url ? `<div class="ft-item-actions"><md-text-button data-item-open>開く</md-text-button></div>` : '');

  if (isMemo && manager && !item.pending) {
    card.innerHTML = `${preview}<div class="ft-item-kind">${escapeHtml(itemKindLabel(item))}</div><h3 class="ft-item-title">${escapeHtml(title)}</h3><textarea class="ft-item-memo" data-memo-id="${escapeHtml(item.id)}" rows="7" placeholder="メモ内容">${escapeHtml(item.content || '')}</textarea>${actions}`;
  } else if (isMemo && !manager && !item.pending) {
    card.innerHTML = `${preview}<div class="ft-item-kind">${escapeHtml(itemKindLabel(item))}</div><h3 class="ft-item-title">${escapeHtml(title)}</h3><div class="ft-public-memo" data-public-memo-id="${escapeHtml(item.id)}">メモを読み込んでいます…</div>${note}${actions}`;
  } else {
    card.innerHTML = `${preview}<div class="ft-item-kind">${escapeHtml(itemKindLabel(item))}</div><h3 class="ft-item-title">${escapeHtml(title)}</h3>${note}${actions}`;
  }

  const openButton = card.querySelector('[data-item-open]');
  if (openButton) {
    openButton.addEventListener('click', (event) => {
      event.preventDefault();
      if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
      else showSnackbar(STRINGS.itemOpenNoLink, { error: true });
    });
  }
  const downloadButton = card.querySelector('[data-item-download]');
  if (downloadButton) {
    downloadButton.addEventListener('click', (event) => {
      event.preventDefault();
      void downloadDriveItem(project.projectId, item);
    });
  }
  if (manager) {
    card.querySelector('[data-item-rename]')?.addEventListener('click', () => void openNameDialog('item', item.id, item.name || ''));
    card.querySelector('[data-item-delete]')?.addEventListener('click', () => openDeleteDialog('item', item.id, item.name || STRINGS.itemNameFallback));
    const noteInput = card.querySelector('[data-note-id]');
    if (noteInput) bindNoteAutosave(noteInput, project.projectId, item.id);
    const memoInput = card.querySelector('[data-memo-id]');
    if (memoInput) bindMemoAutosave(memoInput, project.projectId, item.id);
  }
  return card;
}

function renderManagerItems(project) {
  const container = document.getElementById('ft-manager-items');
  if (!container) {
    console.error(`${APP_PREFIX} ❌ アイテムコンテナがありません`);
    return;
  }
  container.replaceChildren();
  const items = [...(project.items || [])].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  if (!items.length) {
    container.innerHTML = '<div class="ft-public-empty">まだアイテムがありません。</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.appendChild(buildItemCard(project, item, { manager: true }));
  container.appendChild(fragment);
  bindDragSort(container, project);
  bindThumbnailFallbacks(container);
  scheduleAllThumbnails(container, project.projectId);
  logSuccess(`アイテム表示: ${items.length}件`);
}

async function hydrateManagerMemos(projectId) {
  const memoFields = [...dom.managerContent.querySelectorAll('[data-memo-id]')];
  if (!memoFields.length) return;
  await Promise.allSettled(memoFields.map(async (field) => {
    const itemId = field.getAttribute('data-memo-id');
    if (!itemId) {
      console.error(`${APP_PREFIX} ❌ メモIDがありません`);
      return;
    }
    try {
      const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(projectId)}/memo/${encodeURIComponent(itemId)}`));
      if (field instanceof HTMLTextAreaElement) {
        field.value = data.content || '';
        const item = activeManagerProject?.items?.find((entry) => entry.id === itemId);
        if (item) item.content = field.value;
      }
    } catch (error) {
      logError(STRINGS.memoFetchFailed, { itemId, error });
      showSnackbar(`メモを読み込めませんでした: ${error?.message || '不明なエラー'}`, { error: true });
    }
  }));
  logSuccess(`メモ本文取得完了: ${memoFields.length}件`);
}

function renderManager(project) {
  activeManagerProject = structuredClone(project);
  projectCache.set(project.projectId, structuredClone(project));
  dom.managerContent.innerHTML = `
    <div class="ft-manager-header ft-m3-top-app-bar">
      <div class="ft-manager-leading">
        <md-icon-button id="ft-manager-back" aria-label="プロジェクト一覧へ戻る">
          <md-icon>arrow_back</md-icon>
        </md-icon-button>
      </div>
      <div class="ft-manager-heading">
        <h1 id="ft-manager-title">${escapeHtml(project.name || STRINGS.projectNameFallback)}</h1>
        <p class="ft-manager-sub" id="ft-manager-sub">${escapeHtml(String(project.items?.length || 0))} 件</p>
      </div>
      <div class="ft-manager-actions">
        <md-text-button id="ft-manager-view" has-icon>
          <md-icon slot="icon">visibility</md-icon>閲覧モード
        </md-text-button>
        <md-text-button id="ft-manager-share-link" has-icon>
          <md-icon slot="icon">link</md-icon>共有リンク
        </md-text-button>
        <md-text-button id="ft-manager-rename" has-icon>
          <md-icon slot="icon">edit</md-icon>名前を変更
        </md-text-button>
        <md-filled-button id="ft-manager-share" has-icon>
          <md-icon slot="icon">group</md-icon>共有
        </md-filled-button>
      </div>
    </div>
    <div class="ft-add-toolbar">
      <md-outlined-button id="ft-add-file" has-icon><md-icon slot="icon">attach_file</md-icon>ファイル</md-outlined-button>
      <md-outlined-button data-create-workspace="document" has-icon><md-icon slot="icon">description</md-icon>Document</md-outlined-button>
      <md-outlined-button data-create-workspace="spreadsheet" has-icon><md-icon slot="icon">table_chart</md-icon>Sheets</md-outlined-button>
      <md-outlined-button data-create-workspace="presentation" has-icon><md-icon slot="icon">slideshow</md-icon>Slides</md-outlined-button>
      <md-outlined-button data-create-workspace="form" has-icon><md-icon slot="icon">checklist</md-icon>Forms</md-outlined-button>
      <md-outlined-button id="ft-add-memo" has-icon><md-icon slot="icon">notes</md-icon>メモ</md-outlined-button>
      <md-outlined-button id="ft-add-web" has-icon><md-icon slot="icon">language</md-icon>Web</md-outlined-button>
      <input id="ft-file-input" class="is-hidden" type="file" multiple>
    </div>
    <div id="ft-manager-items" class="ft-item-grid"></div>
  `;
  document.getElementById('ft-manager-back')?.addEventListener('click', () => void navigateToDashboard());
  document.getElementById('ft-manager-rename')?.addEventListener('click', () => void openNameDialog('project', project.projectId, project.name || ''));
  document.getElementById('ft-manager-share')?.addEventListener('click', () => void openShareDialog(project.projectId));
  document.getElementById('ft-manager-share-link')?.addEventListener('click', () => void openShareLinkDialog(project.projectId));
  document.getElementById('ft-manager-view')?.addEventListener('click', () => void openPublicProjectInPlace(project.projectId));
  document.getElementById('ft-add-file')?.addEventListener('click', () => document.getElementById('ft-file-input')?.click());
  document.getElementById('ft-file-input')?.addEventListener('change', (event) => void uploadFiles(project, event.target.files));
  document.getElementById('ft-add-memo')?.addEventListener('click', () => openCreateDialog('memo'));
  document.getElementById('ft-add-web')?.addEventListener('click', () => openCreateDialog('web'));
  dom.managerContent.querySelectorAll('[data-create-workspace]').forEach((button) => {
    button.addEventListener('click', () => openCreateDialog(button.getAttribute('data-create-workspace')));
  });
  renderManagerItems(activeManagerProject);
  bindThumbnailFallbacks(dom.managerContent);
  void hydrateManagerMemos(project.projectId);
}

async function openManagerProject(projectId, { project: suppliedProject = null, force = false, manageBusy = true } = {}) {
  if (!isDriveTokenValid() && !await ensureDriveConnected({ interactive: true })) return false;

  const task = async () => {
    const key = `manager:${projectId}`;
    if (!force && currentRouteKey === key && activeManagerProject) return true;
    const cached = suppliedProject || projectCache.get(projectId) || null;
    try {
      const response = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(projectId)}`));
      if (!response.project?.isOwner) throw new Error(STRINGS.notProjectOwner);
      activeManagerProject = structuredClone(response.project);
      currentRouteKey = key;
      clearProjectQueryParam();
      renderManager(activeManagerProject);
      setView('manager');
      logSuccess(STRINGS.managerFetchSuccess, projectId);
      return true;
    } catch (error) {
      if (cached && force) {
        activeManagerProject = structuredClone(cached);
        currentRouteKey = key;
        clearProjectQueryParam();
        renderManager(activeManagerProject);
        setView('manager');
        logInfo(STRINGS.managerCacheFallback, error);
        showSnackbar(STRINGS.managerCacheFallbackMsg, { error: true });
      } else {
        logError(STRINGS.managerFetchFailed, error);
        showSnackbar(`プロジェクトを開けませんでした: ${error?.message || '不明なエラー'}`, { error: true });
      }
      return false;
    }
  };

  return manageBusy ? withBusy(task) : task();
}

function openNameDialog(kind, id, currentName) {
  pendingDialogAction = { kind, id };
  dom.nameDialogTitle.textContent = kind === 'project' ? STRINGS.nameDialogTitleProject : STRINGS.managerRename;
  dom.nameDialogInput.value = currentName || '';
  dom.nameDialogInput.error = false;
  void dom.nameDialog.show();
}

async function confirmNameDialog() {
  const value = String(dom.nameDialogInput.value ?? '').trim();
  if (!value || !pendingDialogAction) {
    dom.nameDialogInput.error = true;
    dom.nameDialogInput.errorText = STRINGS.nameInputRequired;
    return;
  }
  const action = pendingDialogAction;
  pendingDialogAction = null;
  await dom.nameDialog.close();
  try {
    if (action.kind === 'project') {
      const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(action.id)}/name`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value }),
      }));
      activeManagerProject = data.project;
      projectCache.set(action.id, structuredClone(data.project));
      renderManager(data.project);
      showSnackbar(STRINGS.renameSuccess);
    } else {
      const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(activeManagerProject.projectId)}/item/${encodeURIComponent(action.id)}/name`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value }),
      }));
      activeManagerProject = data.project;
      projectCache.set(activeManagerProject.projectId, structuredClone(activeManagerProject));
      renderManagerItems(activeManagerProject);
      showSnackbar(STRINGS.renameItemSuccess);
    }
    logSuccess(STRINGS.renameSuccessLog, { kind: action.kind, id: action.id });
  } catch (error) {
    logError(STRINGS.renameFailedLog, error);
    showSnackbar(`名前を変更できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

function openDeleteDialog(kind, id, label) {
  pendingDelete = { kind, id };
  dom.deleteDialogContent.textContent = `「${label || STRINGS.itemNameFallback}」を削除します。Google Drive上でもゴミ箱へ移動します。`;
  void dom.deleteDialog.show();
}

async function confirmDelete() {
  if (!pendingDelete || !activeManagerProject) return;
  const target = pendingDelete;
  pendingDelete = null;
  await dom.deleteDialog.close();
  if (target.kind !== 'item') return;
  const card = document.querySelector(`[data-item-card-id="${safeCssEscape(target.id)}"]`);
  const oldProject = structuredClone(activeManagerProject);
  const index = activeManagerProject.items.findIndex((item) => item.id === target.id);
  if (index < 0) return;
  activeManagerProject.items.splice(index, 1);
  card?.remove();
  try {
    await enqueueMutation(() => apiFetch(`/api/project/${encodeURIComponent(activeManagerProject.projectId)}/item/${encodeURIComponent(target.id)}`, { method: 'DELETE' }));
    showSnackbar(STRINGS.deleteItem);
    logSuccess(STRINGS.deleteSuccess, target.id);
    projectCache.set(activeManagerProject.projectId, structuredClone(activeManagerProject));
    if (!activeManagerProject.items.length) renderManagerItems(activeManagerProject);
  } catch (error) {
    activeManagerProject = oldProject;
    projectCache.set(activeManagerProject.projectId, structuredClone(activeManagerProject));
    renderManagerItems(activeManagerProject);
    logError(STRINGS.deleteFailed, error);
    showSnackbar(`削除できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

function openCreateDialog(mode) {
  createDialogMode = mode;
  dom.createDialogName.value = '';
  dom.createDialogUrl.value = '';
  dom.createDialogContent.value = '';
  dom.createDialogUrl.classList.toggle('is-hidden', mode !== 'web');
  dom.createDialogContent.classList.toggle('is-hidden', mode !== 'memo');
  const titles = { document: STRINGS.createDialogTitleDocument, spreadsheet: STRINGS.createDialogTitleSpreadsheet, presentation: STRINGS.createDialogTitlePresentation, form: STRINGS.createDialogTitleForm, memo: STRINGS.createDialogTitleMemo, web: STRINGS.createDialogTitleWeb };
  dom.createDialogTitle.textContent = titles[mode] || STRINGS.createDialogConfirmAdd;
  dom.createDialogConfirm.textContent = mode === 'web' || mode === 'memo' ? STRINGS.createDialogConfirmAdd : STRINGS.createDialogConfirmCreate;
  void dom.createDialog.show();
}

async function confirmCreateDialog() {
  if (!activeManagerProject || !createDialogMode) return;
  const mode = createDialogMode;
  const name = String(dom.createDialogName.value ?? '').trim();
  if (!name) {
    dom.createDialogName.error = true;
    dom.createDialogName.errorText = STRINGS.nameInputRequired;
    return;
  }
  dom.createDialogName.error = false;
  await dom.createDialog.close();
  createDialogMode = null;
  if (mode === 'web') {
    const url = String(dom.createDialogUrl.value ?? '').trim();
    try { if (!/^https?:\/\//i.test(url)) throw new Error(STRINGS.urlProtocolRequired); } catch (error) { showSnackbar(error.message, { error: true }); return; }
    await addOptimisticWeb(activeManagerProject, name, url);
    return;
  }
  if (mode === 'memo') {
    await addOptimisticMemo(activeManagerProject, name, String(dom.createDialogContent.value ?? ''));
    return;
  }
  await addOptimisticWorkspace(activeManagerProject, mode, name);
}

function prependLocalItem(project, item) {
  const normalized = { ...item, order: 0 };
  project.items = [normalized, ...(project.items || []).map((entry) => ({ ...entry, order: Number(entry.order ?? 0) + 1 }))];
  return normalized;
}

function insertPendingItem(project, pending) {
  prependLocalItem(project, pending);
  projectCache.set(project.projectId, structuredClone(project));
  renderManagerItems(project);
  return pending;
}

async function uploadFiles(project, filesLike) {
  const files = Array.from(filesLike || []);
  if (!files.length) return;
  const container = document.getElementById('ft-manager-items');
  if (!container) {
    console.error(`${APP_PREFIX} ❌ アップロード先コンテナがありません`);
    return;
  }
  for (const file of files) {
    const pendingId = `pending-${crypto.randomUUID()}`;
    const pending = { id: pendingId, type: 'file', name: file.name, note: '', order: 0, pending: true };
    insertPendingItem(project, pending);
    try {
      const params = new URLSearchParams({ name: file.name, mime: file.type || 'application/octet-stream' });
      const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(project.projectId)}/upload?${params}`, {
        method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
      }));
      project.items = project.items.filter((item) => item.id !== pendingId);
      prependLocalItem(project, data.item);
      activeManagerProject = project;
      projectCache.set(project.projectId, structuredClone(project));
      renderManagerItems(project);
      showSnackbar(`${file.name} を追加しました`);
      logSuccess(STRINGS.fileAddSuccess, file.name);
    } catch (error) {
      project.items = project.items.filter((item) => item.id !== pendingId);
      renderManagerItems(project);
      logError(STRINGS.fileAddError, error);
      showSnackbar(`${file.name} を追加できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
    }
  }
}

async function addOptimisticWorkspace(project, type, name) {
  const pending = { id: `pending-${crypto.randomUUID()}`, type, name, note: '', order: 0, pending: true };
  insertPendingItem(project, pending);
  try {
    const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(project.projectId)}/workspace`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name }),
    }));
    project.items = project.items.filter((item) => item.id !== pending.id);
    prependLocalItem(project, data.item);
    activeManagerProject = project;
    projectCache.set(project.projectId, structuredClone(project));
    renderManagerItems(project);
    showSnackbar(`${itemKindLabel(data.item)}を追加しました`);
    logSuccess(STRINGS.workspaceCreateSuccess, { type, name });
  } catch (error) {
    project.items = project.items.filter((item) => item.id !== pending.id);
    renderManagerItems(project);
    logError(STRINGS.workspaceCreateFailed, error);
    showSnackbar(`作成できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

async function addOptimisticMemo(project, name, content) {
  const pending = { id: `pending-${crypto.randomUUID()}`, type: 'memo', name, content, note: '', order: 0, pending: true };
  insertPendingItem(project, pending);
  try {
    const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(project.projectId)}/memo?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: content,
    }));
    project.items = project.items.filter((item) => item.id !== pending.id);
    prependLocalItem(project, { ...data.item, content });
    activeManagerProject = project;
    projectCache.set(project.projectId, structuredClone(project));
    renderManagerItems(project);
    showSnackbar(STRINGS.memoAdded);
    logSuccess(STRINGS.memoCreateSuccess, name);
  } catch (error) {
    project.items = project.items.filter((item) => item.id !== pending.id);
    renderManagerItems(project);
    logError(STRINGS.memoCreateFailed, error);
    showSnackbar(`メモを作成できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

async function addOptimisticWeb(project, name, url) {
  const pending = { id: `pending-${crypto.randomUUID()}`, type: 'web', name, url, note: '', order: 0, pending: true };
  insertPendingItem(project, pending);
  try {
    const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(project.projectId)}/web`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url }),
    }));
    project.items = project.items.filter((item) => item.id !== pending.id);
    prependLocalItem(project, data.item);
    activeManagerProject = project;
    projectCache.set(project.projectId, structuredClone(project));
    renderManagerItems(project);
    showSnackbar(STRINGS.webAdded);
    logSuccess(STRINGS.webAddSuccess, url);
  } catch (error) {
    project.items = project.items.filter((item) => item.id !== pending.id);
    renderManagerItems(project);
    logError(STRINGS.webAddFailed, error);
    showSnackbar(`追加できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

function bindNoteAutosave(textarea, projectId, itemId) {
  const schedule = () => {
    if (noteTimers.has(itemId)) clearTimeout(noteTimers.get(itemId));
    noteTimers.set(itemId, window.setTimeout(() => void saveNote(textarea, projectId, itemId), NOTE_SAVE_DELAY));
  };
  textarea.addEventListener('input', schedule);
  textarea.addEventListener('blur', () => void saveNote(textarea, projectId, itemId));
}

async function saveNote(textarea, projectId, itemId) {
  if (!textarea || !activeManagerProject) return;
  if (noteTimers.has(itemId)) clearTimeout(noteTimers.get(itemId));
  noteTimers.delete(itemId);
  const note = String(textarea.value ?? '').replaceAll('\r\n', '\n');
  const model = activeManagerProject.items.find((item) => item.id === itemId);
  if (model?.note === note) return;
  if (model) model.note = note;
  try {
    await enqueueMutation(async () => {
      const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}/item/${encodeURIComponent(itemId)}/note`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      await readApiResponse(response);
    });
    projectCache.set(projectId, structuredClone(activeManagerProject));
    logSuccess(STRINGS.noteAutoSaved, itemId);
  } catch (error) {
    logError(STRINGS.noteSaveFailed, error);
    showSnackbar(`メモを保存できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

function bindMemoAutosave(textarea, projectId, itemId) {
  const schedule = () => {
    if (memoTimers.has(itemId)) clearTimeout(memoTimers.get(itemId));
    memoTimers.set(itemId, window.setTimeout(() => void saveMemo(textarea, projectId, itemId), NOTE_SAVE_DELAY));
  };
  textarea.addEventListener('input', schedule);
  textarea.addEventListener('blur', () => void saveMemo(textarea, projectId, itemId));
}

async function saveMemo(textarea, projectId, itemId) {
  if (!textarea || !activeManagerProject) return;
  if (memoTimers.has(itemId)) clearTimeout(memoTimers.get(itemId));
  memoTimers.delete(itemId);
  const content = String(textarea.value ?? '');
  const model = activeManagerProject.items.find((item) => item.id === itemId);
  if (model?.content === content) return;
  if (model) model.content = content;
  try {
    await enqueueMutation(async () => {
      const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}/memo/${encodeURIComponent(itemId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: content,
      });
      await readApiResponse(response);
    });
    logSuccess(STRINGS.memoAutoSaved, itemId);
  } catch (error) {
    logError(STRINGS.memoSaveFailed, error);
    showSnackbar(`メモを保存できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

function bindDragSort(container, project) {
  const cards = [...container.querySelectorAll('[data-item-card-id]')];
  cards.forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('is-dragging'));
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      void persistOrderFromDom(container, project);
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      const dragging = container.querySelector('.is-dragging');
      if (!dragging || dragging === card) return;
      const rect = card.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      container.insertBefore(dragging, before ? card : card.nextSibling);
    });
  });
}

async function persistOrderFromDom(container, project) {
  const itemIds = [...container.querySelectorAll('[data-item-card-id]')].map((card) => card.dataset.itemCardId).filter(Boolean);
  if (itemIds.length !== project.items.length) return;
  const previous = structuredClone(project.items);
  const indexMap = new Map(itemIds.map((id, index) => [id, index]));
  project.items = project.items.map((item) => ({ ...item, order: indexMap.get(item.id) ?? item.order }));
  try {
    await enqueueMutation(async () => {
      const response = await apiFetch(`/api/project/${encodeURIComponent(project.projectId)}/order`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds }),
      });
      await readApiResponse(response);
    });
    projectCache.set(project.projectId, structuredClone(project));
    logSuccess(STRINGS.orderSaved);
  } catch (error) {
    project.items = previous;
    renderManagerItems(project);
    logError(STRINGS.orderSaveFailed, error);
    showSnackbar(`並び順を保存できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

function enqueueMutation(task) {
  mutationQueue = mutationQueue.then(task, task);
  return mutationQueue;
}

async function openShareDialog(projectId) {
  if (!isDriveTokenValid() || !activeManagerProject) return;
  dom.shareEmail.value = '';
  dom.shareList.innerHTML = '<div class="ft-share-loading">共有設定を取得中…</div>';
  await dom.shareDialog.show();
  try {
    await loadShareList(projectId);
  } catch (error) {
    logError(STRINGS.shareFetchFailed, error);
    showSnackbar(`共有設定を取得できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

async function loadShareList(projectId) {
  const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(projectId)}/permissions`));
  const permissions = Array.isArray(data.permissions) ? data.permissions.filter((permission) => permission.type !== 'owner' && permission.type !== 'anyone') : [];
  dom.shareList.replaceChildren();
  if (!permissions.length) {
    dom.shareList.innerHTML = '<div class="ft-share-empty">まだ共有していません。</div>';
    return;
  }
  for (const permission of permissions) {
    const row = document.createElement('div');
    row.className = 'ft-share-row';
    row.innerHTML = `<div class="ft-share-user"><div>${escapeHtml(permission.emailAddress || permission.displayName || STRINGS.shareUser)}</div><div class="ft-share-role">閲覧者</div></div><md-icon-button data-share-remove aria-label="共有を解除"><md-icon>person_remove</md-icon></md-icon-button>`;
    const remove = row.querySelector('[data-share-remove]');
    if (!remove) console.error(`${APP_PREFIX} ❌ 共有解除ボタン生成失敗`);
    remove?.addEventListener('click', () => openDeleteShareDialog(projectId, permission.id, permission.emailAddress || STRINGS.shareUser));
    dom.shareList.appendChild(row);
  }
}

function openDeleteShareDialog(projectId, permissionId, email) {
  pendingDelete = { kind: 'share', projectId, permissionId, label: email };
  dom.deleteDialogContent.textContent = `「${email}」の閲覧権限を解除します。`;
  void dom.deleteDialog.show();
}

async function confirmShareDelete(projectId, permissionId) {
  try {
    await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(projectId)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'DELETE' }));
    showSnackbar(STRINGS.shareRemoved);
    await loadShareList(projectId);
    logSuccess(STRINGS.shareRemoveSuccess, permissionId);
  } catch (error) {
    logError(STRINGS.shareRemoveFailed, error);
    showSnackbar(`共有を解除できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

async function addShare() {
  if (!activeManagerProject) return;
  const email = String(dom.shareEmail.value ?? '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    showSnackbar(STRINGS.shareEmailRequired, { error: true });
    return;
  }
  try {
    dom.shareAddButton.disabled = true;
    await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(activeManagerProject.projectId)}/permissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }));
    dom.shareEmail.value = '';
    await loadShareList(activeManagerProject.projectId);
    showSnackbar(`${email} に共有しました`);
    logSuccess(STRINGS.shareSuccess, email);
  } catch (error) {
    logError(STRINGS.shareFailed, error);
    showSnackbar(`共有できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  } finally {
    dom.shareAddButton.disabled = false;
  }
}

async function copyProjectUrl(projectId) {
  const url = getProjectUrl(projectId);
  try {
    await navigator.clipboard.writeText(url);
    showSnackbar(STRINGS.shareUrlCopied);
    logSuccess('共有リンクコピー成功');
  } catch (error) {
    logError('共有リンクコピー失敗', error);
    showSnackbar(url, { duration: 7000 });
  }
}

async function openShareLinkDialog(projectId) {
  if (!projectId) {
    console.error(`${APP_PREFIX} ❌ 共有リンク表示対象のプロジェクトIDがありません`);
    return;
  }
  if (!dom.shareLinkDialog || !dom.shareLinkInput || !dom.shareLinkCopyButton || !dom.shareLinkCloseButton) {
    console.error(`${APP_PREFIX} ❌ 共有リンクダイアログの必須DOMがありません`);
    return;
  }
  const url = getProjectUrl(projectId);
  dom.shareLinkInput.value = url;
  dom.shareLinkCopyButton.disabled = false;
  try {
    await dom.shareLinkDialog.show();
    requestAnimationFrame(() => {
      try {
        dom.shareLinkInput.focus();
        dom.shareLinkInput.select();
      } catch (error) {
        console.error(`${APP_PREFIX} ❌ 共有リンク入力欄の選択に失敗しました`, error);
      }
    });
    logSuccess(STRINGS.shareLinkDialogShown, projectId);
  } catch (error) {
    logError('共有リンクダイアログ表示失敗', error);
    showSnackbar(STRINGS.shareLinkDisplayFailed, { error: true });
  }
}

async function copyShareLinkFromDialog() {
  if (!dom.shareLinkInput || !dom.shareLinkCopyButton) {
    console.error(`${APP_PREFIX} ❌ 共有リンクコピー用DOMがありません`);
    return;
  }
  const url = String(dom.shareLinkInput.value || '').trim();
  if (!url) {
    console.error(`${APP_PREFIX} ❌ コピー対象の共有リンクが空です`);
    showSnackbar(STRINGS.shareLinkEmpty, { error: true });
    return;
  }
  try {
    dom.shareLinkCopyButton.disabled = true;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(url);
    } else {
      dom.shareLinkInput.focus();
      dom.shareLinkInput.select();
      const copied = document.execCommand('copy');
      if (!copied) throw new Error(STRINGS.clipboardApiUnavailable);
    }
    showSnackbar(STRINGS.shareUrlCopied);
    logSuccess('共有リンクコピー成功', url);
  } catch (error) {
    logError('共有リンクコピー失敗', error);
    showSnackbar(STRINGS.shareUrlCopyFailed, { error: true });
  } finally {
    dom.shareLinkCopyButton.disabled = false;
  }
}

function renderPublicProject(project, { hydrated = false } = {}) {
  publicProject = structuredClone(project);
  const items = [...(project.items || [])].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  dom.publicProject.innerHTML = `
    <div class="ft-public-header">
      <div class="ft-public-heading">
        <md-icon-button id="ft-public-home" aria-label="プロジェクト一覧へ戻る">
          <md-icon>arrow_back</md-icon>
        </md-icon-button>
        <h1 id="ft-public-title">${escapeHtml(project.name || STRINGS.projectNameFallback)}</h1>
        <div class="ft-public-meta">${items.length} 件</div>
      </div>
      <div class="ft-public-actions">
        ${project.isOwner && isDriveTokenValid() ? '<md-filled-button id="ft-public-manage" has-icon><md-icon slot="icon">edit</md-icon>編集モード</md-filled-button>' : ''}
      </div>
    </div>

    <div id="ft-public-items" class="ft-item-grid ft-item-grid-public"></div>
  `;
  const container = document.getElementById('ft-public-items');
  if (!container) {
    console.error(`${APP_PREFIX} ❌ 公開アイテムコンテナがありません`);
    return;
  }
  if (!items.length) {
    container.innerHTML = '<div class="ft-public-empty">このプロジェクトにはまだアイテムがありません。</div>';
  } else {
    const fragment = document.createDocumentFragment();
    for (const item of items) fragment.appendChild(buildItemCard(project, item, { manager: false }));
    container.appendChild(fragment);
  }
  document.getElementById('ft-public-home')?.addEventListener('click', () => void navigateToDashboard());
  const manageButton = document.getElementById('ft-public-manage');
  if (manageButton) {
    if (project.isOwner === true && isDriveTokenValid()) {
      manageButton.addEventListener('click', () => void openManagerProject(project.projectId));
    } else {
      manageButton.remove();
      console.error(`${APP_PREFIX} ❌ 所有者でないため編集モードボタンを表示しません`);
    }
  }
  scheduleAllThumbnails(container, project.projectId);
}

async function openPublicProjectInPlace(projectId) {
  if (!projectId) {
    console.error(`${APP_PREFIX} ❌ 閲覧対象のプロジェクトIDがありません`);
    return;
  }
  await withBusy(async () => {
    await loadPublicProject(projectId);
  }, STRINGS.publicPageLoading);
}

function navigateToHome() {
  try {
    publicProject = null;
    activeManagerProject = null;
    currentRouteKey = 'home';
    clearProjectQueryParam();
    setView('home');
    logSuccess(STRINGS.homeNavigated);
  } catch (error) {
    logError(STRINGS.homeNavFailed, error);
    showSnackbar(STRINGS.homeDisplayFailed, { error: true });
  }
}

async function navigateToDashboard() {
  if (!await ensureDriveConnected({ interactive: true })) return;
  await withBusy(async () => {
    const ok = await loadProjects({ initial: false });
    if (ok) {
      publicProject = null;
      activeManagerProject = null;
      currentRouteKey = 'dashboard';
      clearProjectQueryParam();
      setView('dashboard');
    }
  }, STRINGS.projectListLoading);
}

async function hydratePublicProjectMetadata(projectId) {
  if (!isDriveTokenValid()) {
    if (!await ensureDriveConnected({ interactive: true })) return false;
  }
  try {
    const response = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(projectId)}/view`));
    publicProject = response.project;
    renderPublicProject(publicProject, { hydrated: true });
    void hydratePublicMemos(projectId);
    logSuccess(STRINGS.publicMetaLoaded, { count: publicProject.items?.length || 0 });
    return true;
  } catch (error) {
    logError(STRINGS.publicMetaFetchFailed, error);
    if (error.status === 401 || error.status === 403) {
      clearDriveSession({ required: true });
      showSnackbar(STRINGS.driveSessionRequired, { error: true, duration: 5200 });
      logInfo(STRINGS.publicDriveAuthFailed);
    }
    return false;
  }
}



async function loadPublicProject(projectId) {
  if (!projectId) return;
  if (currentRouteKey === `public:${projectId}` && publicProject) {
    setView('public');
    return;
  }
  await withBusy(async () => {
    try {
      const project = await readApiResponse(await apiFetch(`/public/project/${encodeURIComponent(projectId)}`, {}, { authRequired: false }));
      publicProject = project;
      currentRouteKey = `public:${projectId}`;
      renderPublicProject(project, { hydrated: false });
      setView('public');
      logSuccess(STRINGS.publicProjectLoaded, projectId);
      if (isDriveTokenValid()) void hydratePublicProjectMetadata(projectId);
    } catch (error) {
      logError(STRINGS.publicProjectFetchFailed, error);
      showSnackbar(`プロジェクトを読み込めませんでした: ${error?.message || '不明なエラー'}`, { error: true });
    }
  });
}

async function hydratePublicMemos(projectId) {
  if (!isDriveTokenValid()) return;
  const fields = [...dom.publicProject.querySelectorAll('[data-public-memo-id]')];
  if (!fields.length) return;
  await Promise.allSettled(fields.map(async (field) => {
    const itemId = field.getAttribute('data-public-memo-id');
    if (!itemId) {
      console.error(`${APP_PREFIX} ❌ 公開メモIDがありません`);
      return;
    }
    try {
      const data = await readApiResponse(await apiFetch(`/api/project/${encodeURIComponent(projectId)}/memo/${encodeURIComponent(itemId)}`));
      field.textContent = data.content || '';
      field.classList.toggle('is-empty', !data.content);
      logSuccess(STRINGS.publicMemoLoaded, itemId);
    } catch (error) {
      field.textContent = STRINGS.publicMemoError;
      field.classList.add('is-error');
      logError(STRINGS.publicMemoFetchFailed, { itemId, error });
    }
  }));
}

function scheduleThumbnail(img, projectId, itemId) {
  if (!img || !itemId || !projectId || !isDriveTokenValid()) {
    console.warn(`${APP_PREFIX} ⚠️ サムネイル登録条件を満たしていません`, {
      hasImage: Boolean(img),
      connected: Boolean(img?.isConnected),
      projectId: Boolean(projectId),
      itemId: Boolean(itemId),
      driveConnected: isDriveTokenValid(),
      driveConnected: Boolean(driveAccessToken),
    });
    return;
  }
  if (!img.isConnected) {
    console.warn(`${APP_PREFIX} ⚠️ DOM接続前のサムネイル登録を拒否しました`, itemId);
    return;
  }
  if (img.dataset.thumbnailQueued === 'true' || img.dataset.thumbnailState === 'loaded') return;
  img.dataset.thumbnailQueued = 'true';
  thumbnailQueue.push({ img, projectId, itemId });
  logInfo(STRINGS.thumbnailQueued, itemId);
  void pumpThumbnailQueue();
}

async function pumpThumbnailQueue() {
  while (thumbnailActive < THUMBNAIL_CONCURRENCY && thumbnailQueue.length) {
    const task = thumbnailQueue.shift();
    if (!task?.img?.isConnected) continue;
    thumbnailActive += 1;
    void loadThumbnail(task).finally(() => { thumbnailActive -= 1; void pumpThumbnailQueue(); });
  }
}

async function loadThumbnail({ img, projectId, itemId, attempt = 0 }) {
  if (!img?.isConnected) {
    logInfo(STRINGS.thumbnailDomDetached, itemId);
    return;
  }

  const maxAttempts = 5;
  const directUrl = img.dataset.thumbnailDirectUrl?.trim() || '';

  const showDirectFallback = () => {
    if (!directUrl || !img.isConnected || img.dataset.thumbnailState === 'direct-failed' || img.dataset.thumbnailState === 'loaded') return false;
    img.dataset.thumbnailQueued = 'false';
    img.dataset.thumbnailState = 'direct-loading';
    img.classList.add('is-hidden');
    setThumbnailPlaceholder(img, true);
    const onLoad = () => {
      img.dataset.thumbnailState = 'loaded';
      img.classList.remove('is-hidden');
      setThumbnailPlaceholder(img, false);
      logSuccess(STRINGS.thumbnailStateLoaded, { itemId, source: 'drive-thumbnailLink-fallback' });
    };
    const onError = () => {
      img.dataset.thumbnailState = 'direct-failed';
      img.classList.add('is-hidden');
      setThumbnailPlaceholder(img, true);
      logInfo(STRINGS.thumbnailDirectFailed, itemId);
    };
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    img.src = directUrl;
    return true;
  };

  try {
    img.dataset.thumbnailState = 'loading';
    setThumbnailPlaceholder(img, true);

    const response = await apiFetch(
      `/api/project/${encodeURIComponent(projectId)}/thumbnail/${encodeURIComponent(itemId)}`,
      {},
      { authRequired: true, retry401: true },
    );
    if (!response.ok) {
      const error = new Error(`thumbnail HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const blob = await response.blob();
    const contentType = (blob.type || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error(`thumbnailのContent-Typeが画像ではありません: ${blob.type || 'unknown'}`);

    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    const placeholder = img.parentElement?.querySelector('.ft-thumb-placeholder');
    const cleanup = () => {
      try {
        if (objectUrls.has(url)) {
          URL.revokeObjectURL(url);
          objectUrls.delete(url);
        }
      } catch (error) {
        console.error(`${APP_PREFIX} ❌ サムネイルURL解放失敗`, error);
      }
    };

    const onLoad = () => {
      img.dataset.thumbnailQueued = 'false';
      img.dataset.thumbnailState = 'loaded';
      img.classList.remove('is-hidden');
      setThumbnailPlaceholder(img, false);
      cleanup();
      logSuccess(STRINGS.thumbnailStateLoaded, { itemId, source: 'worker-proxy' });
    };
    const onError = () => {
      cleanup();
      img.dataset.thumbnailQueued = 'false';
      img.dataset.thumbnailState = 'decode-error';
      img.classList.add('is-hidden');
      setThumbnailPlaceholder(img, true);
      logError(STRINGS.thumbnailDecodeError, itemId);
      void showDirectFallback();
    };

    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    img.src = url;
    if (img.complete && img.naturalWidth > 0) onLoad();
    return;
  } catch (error) {
    if ((error?.status === 401 || error?.status === 403) && directUrl) {
      if (showDirectFallback()) {
        logInfo(STRINGS.thumbnailAuthFallback, { itemId, status: error.status });
      }
      img.dataset.thumbnailQueued = 'false';
      logInfo(STRINGS.thumbnailAuthStop, { itemId, status: error.status });
      return;
    }

    if (attempt + 1 < maxAttempts && img.isConnected) {
      const delay = 350 + (attempt * 500);
      logInfo(`Driveサムネイル取得を再試行します: ${delay}ms後`, { itemId, attempt: attempt + 1, error: error?.message });
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      return loadThumbnail({ img, projectId, itemId, attempt: attempt + 1 });
    }

    if (showDirectFallback()) return;

    img.dataset.thumbnailQueued = 'false';
    img.dataset.thumbnailState = 'error';
    img.classList.add('is-hidden');
    setThumbnailPlaceholder(img, true);
    logInfo(STRINGS.thumbnailError, { itemId, error: error?.message });
  }
}

function scheduleAllThumbnails(root, projectId) {
  if (!root) return;
  root.querySelectorAll('[data-thumbnail-item-id]').forEach((img) => scheduleThumbnail(img, projectId, img.dataset.thumbnailItemId));
}

function bindThumbnailFallbacks(root) {
  if (!root) {
    console.error(`${APP_PREFIX} ❌ サムネイルフォールバック対象のrootがありません`);
    return;
  }
  root.querySelectorAll('img[data-thumbnail-item-id]').forEach((img) => {
    img.addEventListener('error', () => {
      if (!img.dataset.thumbnailState || img.dataset.thumbnailState !== 'loaded') {
        img.classList.add('is-hidden');
        setThumbnailPlaceholder(img, true);
      }
      logInfo(STRINGS.thumbnailLoadError, img.dataset.thumbnailItemId);
    });
  });
  logSuccess(`サムネイルフォールバックを登録しました: ${root.querySelectorAll('img[data-thumbnail-item-id]').length}件`);
}

async function route() {
  const projectId = getProjectIdFromUrl();
  if (projectId) {
    await loadPublicProject(projectId);
    return;
  }
  if (!isDriveTokenValid()) {
    currentRouteKey = 'home';
    setView('home');
    return;
  }
  if (!await ensureDriveConnected()) {
    currentRouteKey = 'dashboard';
    setView('dashboard');
    return;
  }
  await withBusy(async () => {
    const ok = await loadProjects({ initial: !dom.projectList.children.length });
    if (ok) { currentRouteKey = 'dashboard'; setView('dashboard'); }
  }, STRINGS.projectListLoading);
}

function bindStaticEvents() {
  dom.homeDriveConnectButton.addEventListener('click', () => void connectDrive({ interactive: true }));
  dom.logoutButton.addEventListener('click', () => void disconnectDrive());
  dom.driveConnectButton.addEventListener('click', () => void connectDrive({ interactive: true }));
  dom.createProjectButton.addEventListener('click', () => openProjectCreateDialog());
  dom.projectCreateCancel.addEventListener('click', () => void dom.projectCreateDialog.close('cancel'));
  dom.projectCreateConfirm.addEventListener('click', () => void confirmProjectCreate());
  dom.projectCreateName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void confirmProjectCreate(); }
  });

  dom.nameDialogCancel.addEventListener('click', () => void dom.nameDialog.close('cancel'));
  dom.nameDialogConfirm.addEventListener('click', () => void confirmNameDialog());
  dom.nameDialog.addEventListener('cancel', () => { pendingDialogAction = null; });

  dom.deleteDialogCancel.addEventListener('click', () => {
    pendingDelete = null;
    void dom.deleteDialog.close('cancel');
  });
  dom.deleteDialogConfirm.addEventListener('click', async () => {
    const target = pendingDelete;
    if (!target) return;
    await dom.deleteDialog.close('confirm');
    if (target.kind === 'share') {
      pendingDelete = null;
      await confirmShareDelete(target.projectId, target.permissionId);
    } else {
      pendingDelete = null;
      await confirmDeleteTarget(target);
    }
  });
  dom.deleteDialog.addEventListener('cancel', () => { pendingDelete = null; });

  dom.createDialogCancel.addEventListener('click', () => { createDialogMode = null; void dom.createDialog.close('cancel'); });
  dom.createDialogConfirm.addEventListener('click', () => void confirmCreateDialog());

  dom.shareAddButton.addEventListener('click', () => void addShare());
  dom.shareEmail.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void addShare(); }
  });
  dom.shareCloseButton.addEventListener('click', () => void dom.shareDialog.close('cancel'));
  dom.shareLinkCopyButton.addEventListener('click', () => void copyShareLinkFromDialog());
  dom.shareLinkInput.addEventListener('click', () => {
    try { dom.shareLinkInput.select(); } catch (error) { console.error(`${APP_PREFIX} ❌ 共有リンク選択失敗`, error); }
  });
  dom.shareLinkCloseButton.addEventListener('click', () => void dom.shareLinkDialog.close('cancel'));

  window.addEventListener('popstate', () => void route());
  window.addEventListener('beforeunload', () => objectUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} }));
  logSuccess(STRINGS.staticEvents);
}

async function confirmDeleteTarget(target) {
  if (target.kind !== 'item' || !activeManagerProject) return;
  const item = activeManagerProject.items.find((entry) => entry.id === target.id);
  if (!item) return;
  const oldProject = structuredClone(activeManagerProject);
  activeManagerProject.items = activeManagerProject.items.filter((entry) => entry.id !== target.id);
  const card = document.querySelector(`[data-item-card-id="${safeCssEscape(target.id)}"]`);
  card?.remove();
  try {
    await enqueueMutation(async () => {
      const response = await apiFetch(`/api/project/${encodeURIComponent(activeManagerProject.projectId)}/item/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      await readApiResponse(response);
    });
    projectCache.set(activeManagerProject.projectId, structuredClone(activeManagerProject));
    if (!activeManagerProject.items.length) renderManagerItems(activeManagerProject);
    showSnackbar(STRINGS.deleteItem);
    logSuccess(STRINGS.deleteSuccess, target.id);
  } catch (error) {
    activeManagerProject = oldProject;
    projectCache.set(activeManagerProject.projectId, structuredClone(activeManagerProject));
    renderManagerItems(activeManagerProject);
    logError(STRINGS.deleteFailed, error);
    showSnackbar(`削除できませんでした: ${error?.message || '不明なエラー'}`, { error: true });
  }
}

async function bootstrap() {
  bindStaticEvents();
  updateHeader();
  restoreDriveSession();
  if (isDriveTokenValid()) {
    await refreshDriveUser();
  } else {
    driveConnectionRequired = true;
    updateHeader();
    logInfo(STRINGS.startupNoOAuth);
  }
  await route();
  logSuccess(STRINGS.initComplete);
}

void bootstrap().catch((error) => {
  logError(STRINGS.initFailed, error);
  driveConnectionRequired = true;
  updateHeader();
});
