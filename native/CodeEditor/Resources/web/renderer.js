// 代码编辑器 — renderer (native WKWebView bridge)
'use strict';

// --- Native bridge via webkit.messageHandlers ---
const native = window.webkit && window.webkit.messageHandlers;
const pendingCallbacks = {};
let callbackCounter = 0;

function nativePost(name, body) {
  if (native && native[name]) native[name].postMessage(body || {});
}

function nativeReadDir(path) {
  return new Promise((resolve) => {
    const id = 'cb_' + (callbackCounter++);
    pendingCallbacks[id] = resolve;
    nativePost('readDir', { path, callbackId: id });
  });
}

function nativeReadFile(path) {
  return new Promise((resolve, reject) => {
    const id = 'cb_' + (callbackCounter++);
    pendingCallbacks[id] = { resolve, reject };
    nativePost('readFile', { path, callbackId: id });
  });
}

// --- State ---
const state = {
  editor: null,
  tabs: [],
  activeTabId: null,
  rootFolder: null,
  nextTabId: 1,
  sidebarVisible: true,
  currentView: 'explorer',
  searchDebounce: 0,
  fontSize: 13,
  pendingSave: null,
  safeMode: true
};

function notifyModifiedState() {
  nativePost('fileModified', { modified: state.tabs.some(t => t.modified) });
}

// --- Bridge object exposed to Swift ---
window.editorBridge = {
  newFile() { newFile(); },
  openFileFromJSON(data) {
    openTabFromContent(data.name, data.content, data.path);
  },
  openFolderFromJSON(data) {
    if (data && data.path) openFolder(data.path);
  },
  openFolder(path) { openFolder(path); },
  requestSave() {
    const tab = activeTab();
    if (tab) saveTab(tab);
  },
  requestSaveAs() {
    const tab = activeTab();
    if (tab) saveTabAs(tab);
  },
  closeCurrentTab() {
    if (state.activeTabId) closeTab(state.activeTabId);
  },
  find() {
    if (state.editor) state.editor.getAction('actions.find').run();
  },
  toggleSidebar() { toggleSidebar(); },
  zoomIn() {
    state.fontSize = Math.min(32, state.fontSize + 1);
    if (state.editor) state.editor.updateOptions({ fontSize: state.fontSize });
  },
  zoomOut() {
    state.fontSize = Math.max(8, state.fontSize - 1);
    if (state.editor) state.editor.updateOptions({ fontSize: state.fontSize });
  },
  resetZoom() {
    state.fontSize = 13;
    if (state.editor) state.editor.updateOptions({ fontSize: 13 });
  },
  setSafeMode(enabled) { setSafeMode(Boolean(enabled)); },
  onSaveSuccess() {
    const tab = pendingSaveTab() || activeTab();
    if (tab) {
      tab.savedContent = tab.model ? tab.model.getValue() : tab.content;
      tab.modified = false;
      renderTabs();
      notifyModifiedState();
    }
    finishPendingSave(true);
  },
  onSaveAsSuccess(data) {
    const tab = pendingSaveTab() || activeTab();
    if (tab) {
      tab.path = data.path;
      tab.name = data.name;
      tab.savedContent = tab.model ? tab.model.getValue() : tab.content;
      tab.modified = false;
      const newLang = detectLanguage(data.path);
      if (tab.model && newLang !== tab.language) {
        monaco.editor.setModelLanguage(tab.model, newLang);
        tab.language = newLang;
      }
      renderTabs();
      updateStatus(tab);
      notifyModifiedState();
    }
    finishPendingSave(true);
  },
  onSaveCanceled() {
    finishPendingSave(false);
  },
  onSaveFailure(message) {
    if (message) alert('保存失败: ' + message);
    finishPendingSave(false);
  },
  // Callbacks from Swift for async operations
  dirCallback(id, data) {
    if (pendingCallbacks[id]) {
      pendingCallbacks[id](data);
      delete pendingCallbacks[id];
    }
  },
  fileCallback(id, data, err) {
    const cb = pendingCallbacks[id];
    if (cb) {
      if (err) cb.reject ? cb.reject(new Error(err)) : cb(null);
      else cb.resolve ? cb.resolve(data.content) : cb(data.content);
      delete pendingCallbacks[id];
    }
  }
};

// --- Monaco setup ---
function initEditor() {
  monaco.editor.defineTheme('atom-one-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'abb2bf', background: '282c34' },
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'operator', foreground: '56b6c2' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'regexp', foreground: '98c379' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'class', foreground: 'e5c07b' },
      { token: 'function', foreground: '61afef' },
      { token: 'identifier', foreground: 'abb2bf' },
      { token: 'variable', foreground: 'e06c75' },
      { token: 'tag', foreground: 'e06c75' },
      { token: 'attribute.name', foreground: 'd19a66' },
      { token: 'attribute.value', foreground: '98c379' },
      { token: 'delimiter', foreground: 'abb2bf' }
    ],
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#abb2bf',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#abb2bf',
      'editor.selectionBackground': '#3e4451',
      'editor.inactiveSelectionBackground': '#353b45',
      'editorCursor.foreground': '#528bff',
      'editor.lineHighlightBackground': '#2c313a',
      'editorIndentGuide.background1': '#3b4048',
      'editorIndentGuide.activeBackground1': '#5c6370',
      'editorWhitespace.foreground': '#3b4048',
      'editorBracketMatch.background': '#3b4048',
      'editorBracketMatch.border': '#528bff',
      'editor.findMatchBackground': '#42557b',
      'editor.findMatchHighlightBackground': '#314365',
      'scrollbarSlider.background': '#4b526355',
      'scrollbarSlider.hoverBackground': '#5c637066',
      'scrollbarSlider.activeBackground': '#747d9188'
    }
  });

  state.editor = monaco.editor.create(document.getElementById('editor-container'), {
    value: '', language: 'plaintext', theme: 'atom-one-dark',
    automaticLayout: false,
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "SF Mono", "Courier New", monospace',
    minimap: { enabled: false },
    scrollbar: { useShadows: false },
    stickyScroll: { enabled: false },
    scrollBeyondLastLine: false,
    padding: { bottom: 120 },
    renderWhitespace: 'boundary',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    autoIndent: 'advanced',
    useTabStops: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
    matchBrackets: 'always',
    smoothScrolling: false,
    cursorBlinking: 'solid',
    wordWrap: 'off',
    fontLigatures: false,
    occurrencesHighlight: 'singleFile',
    renderLineHighlight: 'line',
    folding: true,
    foldingStrategy: 'indentation',
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    parameterHints: { enabled: false },
    hover: { enabled: false },
    links: false,
    codeLens: false,
    lightbulb: { enabled: false },
    readOnly: state.safeMode
  });

  let layoutRAF = 0;
  const ro = new ResizeObserver(() => {
    if (!state.editor) return;
    if (layoutRAF) cancelAnimationFrame(layoutRAF);
    layoutRAF = requestAnimationFrame(() => { layoutRAF = 0; state.editor.layout(); });
  });
  ro.observe(document.getElementById('editor-area'));

  state.editor.onDidChangeCursorPosition((e) => {
    document.getElementById('status-cursor').textContent =
      `行 ${e.position.lineNumber}, 列 ${e.position.column}`;
  });

  let contentChangeVersion = 0;
  state.editor.onDidChangeModelContent(() => {
    const tab = activeTab();
    if (!tab) return;
    contentChangeVersion++;
    const myVersion = contentChangeVersion;
    if (!tab.modified) {
      tab.modified = true;
      renderTabs();
      notifyModifiedState();
    }
  });

  setSafeMode(state.safeMode);
}

// --- Language detection ---
const EXT_TO_LANG = {
  js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',
  ts:'typescript',tsx:'typescript',
  py:'python',pyw:'python',rb:'ruby',go:'go',rs:'rust',
  java:'java',kt:'kotlin',kts:'kotlin',swift:'swift',
  c:'c',h:'c',cpp:'cpp',cc:'cpp',cxx:'cpp',hpp:'cpp',hxx:'cpp',
  cs:'csharp',php:'php',
  html:'html',htm:'html',xml:'xml',svg:'xml',
  css:'css',scss:'scss',sass:'scss',less:'less',
  json:'json',jsonc:'json',yaml:'yaml',yml:'yaml',
  toml:'ini',ini:'ini',cfg:'ini',conf:'ini',
  md:'markdown',markdown:'markdown',
  sh:'shell',bash:'shell',zsh:'shell',ps1:'powershell',
  sql:'sql',lua:'lua',pl:'perl',r:'r',dart:'dart',scala:'scala',
  clj:'clojure',cljs:'clojure',ex:'elixir',exs:'elixir',
  erl:'erlang',hs:'haskell',vue:'html',
  graphql:'graphql',gql:'graphql',proto:'proto',
  dockerfile:'dockerfile',makefile:'makefile',
  vb:'vb',bat:'bat',cmd:'bat',
  fs:'fsharp',fsx:'fsharp',jl:'julia',
  m:'objective-c',mm:'objective-c',pas:'pascal',tex:'latex',
  txt:'plaintext',log:'plaintext'
};

function detectLanguage(filePath) {
  if (!filePath) return 'plaintext';
  const base = String(filePath).split(/[/\\]/).pop().toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_TO_LANG[ext] || 'plaintext';
}

// --- Tabs ---
function activeTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || null;
}

function pendingSaveTab() {
  return state.pendingSave
    ? state.tabs.find(t => t.id === state.pendingSave.tabId) || null
    : null;
}

function finishPendingSave(ok) {
  if (!state.pendingSave) return;
  const resolve = state.pendingSave.resolve;
  state.pendingSave = null;
  resolve(Boolean(ok));
}

function renderTabs() {
  const container = document.getElementById('tabs');
  const existing = container.children;
  if (existing.length === state.tabs.length) {
    let canPatch = true;
    for (let i = 0; i < state.tabs.length; i++) {
      if (existing[i].dataset.id != state.tabs[i].id) { canPatch = false; break; }
    }
    if (canPatch) {
      for (let i = 0; i < state.tabs.length; i++) {
        const tab = state.tabs[i];
        const el = existing[i];
        const isActive = tab.id === state.activeTabId;
        el.className = 'tab' + (isActive ? ' active' : '') + (tab.modified ? ' modified' : '');
        const nameEl = el.firstChild;
        nameEl.className = 'tab-name' + (tab.modified ? ' modified' : '');
        if (nameEl.textContent !== tab.name) nameEl.textContent = tab.name;
      }
      return;
    }
  }
  const frag = document.createDocumentFragment();
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '');
    el.dataset.id = tab.id;
    const name = document.createElement('span');
    name.className = 'tab-name' + (tab.modified ? ' modified' : '');
    name.textContent = tab.name;
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.dataset.close = tab.id;
    el.appendChild(name);
    el.appendChild(close);
    el.title = tab.path || tab.name;
    frag.appendChild(el);
  }
  container.replaceChildren(frag);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const closeId = e.target.dataset && e.target.dataset.close;
  if (closeId) { closeTab(parseInt(closeId, 10)); return; }
  const tab = e.target.closest('.tab');
  if (tab && tab.dataset.id) switchTab(parseInt(tab.dataset.id, 10));
});

function switchTab(id) {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  const prev = activeTab();
  if (prev && state.editor) prev.viewState = state.editor.saveViewState();
  state.activeTabId = id;
  showEditor();
  if (!tab.model) {
    const lang = detectLanguage(tab.path || tab.name);
    tab.model = monaco.editor.createModel(tab.content, lang);
    tab.language = lang;
  }
  state.editor.setModel(tab.model);
  if (tab.viewState) state.editor.restoreViewState(tab.viewState);
  state.editor.focus();
  updateStatus(tab);
  renderTabs();
}

async function closeTab(id) {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  if (tab.modified) {
    const choice = await confirmCloseTab(tab.name);
    if (choice === 'cancel') return;
    if (choice === 'save') {
      const ok = await saveTab(tab);
      if (!ok) return;
    }
  }
  if (tab.model) tab.model.dispose();
  const idx = state.tabs.indexOf(tab);
  state.tabs.splice(idx, 1);
  if (state.activeTabId === id) {
    const next = state.tabs[idx] || state.tabs[idx - 1];
    if (next) switchTab(next.id);
    else { state.activeTabId = null; showWelcome(); updateStatus(null); }
  }
  renderTabs();
  notifyModifiedState();
}

function confirmCloseTab(fileName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = `是否保存对 ${fileName || '该文件'} 的修改?`;

    const message = document.createElement('div');
    message.className = 'modal-message';
    message.textContent = '不保存将会丢失这些更改。';

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const save = document.createElement('button');
    save.className = 'primary';
    save.textContent = '保存';
    const discard = document.createElement('button');
    discard.textContent = '不保存';
    const cancel = document.createElement('button');
    cancel.textContent = '取消';

    let onKeydown;
    const close = (choice) => {
      if (onKeydown) document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(choice);
    };

    save.addEventListener('click', () => close('save'));
    discard.addEventListener('click', () => close('discard'));
    cancel.addEventListener('click', () => close('cancel'));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close('cancel');
    });
    onKeydown = (event) => {
      if (event.key === 'Escape') {
        close('cancel');
      }
    };
    document.addEventListener('keydown', onKeydown);

    actions.append(save, discard, cancel);
    dialog.append(title, message, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    save.focus();
  });
}

function openTabFromContent(name, content, filePath) {
  if (filePath) {
    const existing = state.tabs.find(t => t.path === filePath);
    if (existing) { switchTab(existing.id); return existing; }
  }
  const tab = {
    id: state.nextTabId++, name, path: filePath || null,
    content, savedContent: content, modified: false,
    model: null, viewState: null,
    language: detectLanguage(filePath || name)
  };
  state.tabs.push(tab);
  renderTabs();
  switchTab(tab.id);
  return tab;
}

async function openFilePath(filePath) {
  try {
    const content = await nativeReadFile(filePath);
    const name = filePath.split('/').pop();
    openTabFromContent(name, content, filePath);
  } catch (err) {
    alert('打开失败: ' + (err && err.message ? err.message : err));
  }
}

function saveTab(tab) {
  if (state.safeMode) return false;
  if (!tab || state.pendingSave) return Promise.resolve(false);
  const content = (tab.id === state.activeTabId && state.editor)
    ? state.editor.getValue()
    : (tab.model ? tab.model.getValue() : tab.content);
  return new Promise((resolve) => {
    state.pendingSave = { tabId: tab.id, resolve };
    if (tab.path) {
      nativePost('saveFile', { path: tab.path, content });
    } else {
      nativePost('saveFileAs', { name: tab.name, content });
    }
  });
}

function saveTabAs(tab) {
  if (state.safeMode) return false;
  if (!tab || state.pendingSave) return Promise.resolve(false);
  const content = (tab.id === state.activeTabId && state.editor)
    ? state.editor.getValue()
    : (tab.model ? tab.model.getValue() : tab.content);
  return new Promise((resolve) => {
    state.pendingSave = { tabId: tab.id, resolve };
    nativePost('saveFileAs', { name: tab.name, content });
  });
}

// --- UI ---
function showEditor() {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('editor-container').style.display = 'block';
  if (state.editor) requestAnimationFrame(() => state.editor.layout());
}
function showWelcome() {
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('editor-container').style.display = 'none';
}
function updateStatus(tab) {
  document.getElementById('status-path').textContent = tab ? (tab.path || tab.name) : '';
  document.getElementById('status-language').textContent = tab ? (tab.language || 'plaintext') : '';
}

function setSafeMode(enabled) {
  state.safeMode = Boolean(enabled);
  if (state.editor) state.editor.updateOptions({ readOnly: state.safeMode });
  const toggle = document.getElementById('btn-safe-mode');
  const badge = document.getElementById('safe-mode-badge');
  document.body.classList.toggle('safe-mode-on', state.safeMode);
  document.body.classList.toggle('edit-mode-on', !state.safeMode);
  if (toggle) {
    toggle.classList.toggle('locked', state.safeMode);
    toggle.classList.toggle('unlocked', !state.safeMode);
    toggle.setAttribute('aria-pressed', String(!state.safeMode));
    toggle.title = state.safeMode
      ? '安全模式已开启：点击允许编辑'
      : '编辑模式已开启：点击恢复只读';
  }
  if (badge) {
    badge.textContent = state.safeMode ? '安全模式：只读' : '编辑模式：可保存';
  }
}
function newFile() {
  const name = `untitled-${state.tabs.filter(t => !t.path).length + 1}`;
  openTabFromContent(name, '', null);
}

// --- File glyphs ---
function fileGlyphForEntry(name, isDir, isOpen) {
  if (isDir) return isOpen ? '▾' : '▸';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const map = {
    js:'JS',mjs:'JS',cjs:'JS',jsx:'JS',
    ts:'TS',tsx:'TS',
    py:'PY',pyw:'PY',rb:'RB',go:'GO',rs:'RS',
    java:'JV',swift:'SW',
    c:'C',h:'H',cpp:'C+',cc:'C+',cxx:'C+',hpp:'H+',
    html:'<>',htm:'<>',xml:'<>',svg:'<>',
    css:'#',scss:'#',sass:'#',less:'#',
    json:'{}',yaml:'Y',yml:'Y',toml:'T',
    md:'MD',markdown:'MD',
    sh:'SH',bash:'SH',zsh:'SH',sql:'DB',
    png:'IM',jpg:'IM',jpeg:'IM',gif:'IM',pdf:'PDF'
  };
  return map[ext] || '•';
}

// --- File tree ---
function openFolder(folderPath) {
  state.rootFolder = folderPath;
  const tree = document.getElementById('file-tree');
  tree.style.display = 'block';
  document.querySelector('#explorer-view .empty-state').style.display = 'none';
  tree.replaceChildren();
  const rootName = folderPath.split('/').pop();
  const rootNode = buildTreeNode({ name: rootName, path: folderPath, isDirectory: true }, 0);
  tree.appendChild(rootNode);
  const chevron = rootNode.querySelector('.tree-chevron');
  if (chevron) chevron.click();
}

function buildTreeNode(entry, depth) {
  const wrapper = document.createElement('div');
  const node = document.createElement('div');
  node.className = 'tree-node';
  node.style.paddingLeft = (8 + depth * 12) + 'px';
  const chevron = document.createElement('span');
  chevron.className = 'tree-chevron';
  chevron.textContent = entry.isDirectory ? '▶' : '';
  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = fileGlyphForEntry(entry.name, entry.isDirectory, false);
  const nameEl = document.createElement('span');
  nameEl.className = 'tree-name';
  nameEl.textContent = entry.name;
  node.appendChild(chevron);
  node.appendChild(icon);
  node.appendChild(nameEl);
  const children = document.createElement('div');
  children.className = 'tree-children';
  children.style.display = 'none';
  let loaded = false, expanded = false;
  async function toggle() {
    if (!entry.isDirectory) return;
    expanded = !expanded;
    chevron.textContent = expanded ? '▼' : '▶';
    icon.textContent = fileGlyphForEntry(entry.name, true, expanded);
    children.style.display = expanded ? 'block' : 'none';
    if (expanded && !loaded) {
      try {
        const entries = await nativeReadDir(entry.path);
        const frag = document.createDocumentFragment();
        for (const child of entries) {
          frag.appendChild(buildTreeNode(child, depth + 1));
        }
        children.appendChild(frag);
        loaded = true;
      } catch (err) {
        const errEl = document.createElement('div');
        errEl.style.cssText = 'padding:4px 8px;color:#f48771;font-size:12px';
        errEl.textContent = '错误: ' + err;
        children.appendChild(errEl);
        loaded = true;
      }
    }
  }
  chevron.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  node.addEventListener('click', () => {
    const prev = document.querySelector('.tree-node.selected');
    if (prev) prev.classList.remove('selected');
    node.classList.add('selected');
    if (entry.isDirectory) toggle();
    else openFilePath(entry.path);
  });
  wrapper.appendChild(node);
  wrapper.appendChild(children);
  return wrapper;
}

// --- Sidebar ---
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.activity-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  document.getElementById('sidebar-title').textContent = view === 'explorer' ? '资源管理器' : '搜索';
  document.getElementById('explorer-view').style.display = view === 'explorer' ? 'block' : 'none';
  document.getElementById('search-view').style.display = view === 'search' ? 'block' : 'none';
}
function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  document.getElementById('sidebar').classList.toggle('hidden', !state.sidebarVisible);
}

// --- Search ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function runSearch(query) {
  const results = document.getElementById('search-results');
  results.replaceChildren();
  if (!query) return;
  const tab = activeTab();
  if (!tab || !tab.model) {
    results.innerHTML = '<div style="padding:8px;color:#858585">请先打开一个文件</div>';
    return;
  }
  const lines = tab.model.getValue().split('\n');
  const lower = query.toLowerCase();
  let count = 0;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].toLowerCase().indexOf(lower);
    if (start === -1) continue;
    count++;
    if (count > 200) continue;
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.dataset.line = i + 1;
    item.dataset.col = start + 1;
    const end = start + query.length;
    item.innerHTML = `<span class="search-line-number">${i+1}</span>${escapeHtml(lines[i].substring(Math.max(0,start-20),start))}<span class="search-highlight">${escapeHtml(lines[i].substring(start,end))}</span>${escapeHtml(lines[i].substring(end,end+40))}`;
    frag.appendChild(item);
  }
  results.appendChild(frag);
  if (count === 0) results.innerHTML = '<div style="padding:8px;color:#858585">无匹配</div>';
}
document.getElementById('search-results').addEventListener('click', (e) => {
  const item = e.target.closest('.search-result-item');
  if (!item) return;
  const line = parseInt(item.dataset.line, 10);
  const col = parseInt(item.dataset.col, 10);
  state.editor.revealLineInCenter(line);
  state.editor.setPosition({ lineNumber: line, column: col });
  state.editor.focus();
});

// --- Wire events ---
document.querySelectorAll('.activity-item').forEach(el => {
  el.addEventListener('click', () => switchView(el.dataset.view));
});
document.getElementById('btn-safe-mode').addEventListener('click', () => setSafeMode(!state.safeMode));
document.getElementById('btn-open-file').addEventListener('click', () => nativePost('openFile'));
document.getElementById('btn-open-folder').addEventListener('click', () => nativePost('openFolder'));
document.getElementById('welcome-new').addEventListener('click', newFile);
document.getElementById('welcome-open-file').addEventListener('click', () => nativePost('openFile'));
document.getElementById('welcome-open-folder').addEventListener('click', () => nativePost('openFolder'));
document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(state.searchDebounce);
  state.searchDebounce = setTimeout(() => runSearch(e.target.value), 250);
});

// Drag & drop
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag-over'); });
document.addEventListener('dragleave', (e) => { if (e.target === document.body || e.target === document.documentElement) document.body.classList.remove('drag-over'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('drag-over');
  // WKWebView drag-drop support is limited; users can use menu instead
});

// Init
window.addEventListener('DOMContentLoaded', () => initEditor());
