const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const html = read('Resources/web/editor.html');
const renderer = read('Resources/web/renderer.js');
const css = read('Resources/web/styles.css');
const swift = read('main.swift');
const buildScript = read('build.sh');

const configIndex = html.indexOf("var require = { paths: { vs: 'monaco/vs' } };");
const loaderIndex = html.indexOf('<script src="monaco/vs/loader.js"></script>');
assert(configIndex !== -1, 'Monaco require config is missing.');
assert(loaderIndex !== -1, 'Monaco loader script is missing.');
assert(configIndex < loaderIndex, 'Monaco require config must be declared before loader.js.');

assert(html.includes('id="btn-open-file"'), 'Sidebar empty state must expose an Open File button.');
assert(html.includes('id="welcome-open-file"'), 'Welcome screen must expose an Open File button.');
assert(html.includes('id="btn-safe-mode"'), 'Top-left safe-mode toggle button must exist.');
assert(renderer.includes("nativePost('openFile')"), 'Renderer must bridge Open File buttons to the native file picker.');
assert(renderer.includes('confirmCloseTab'), 'Renderer must confirm before closing modified tabs.');
assert(renderer.includes('notifyModifiedState'), 'Renderer must report aggregate modified state to native shell.');
assert(renderer.includes('state.tabs.some(t => t.modified)'), 'Native modified state should stay true while any tab is dirty.');
assert(renderer.includes('safeMode: true'), 'Safe mode must be enabled by default.');
assert(renderer.includes('setSafeMode'), 'Renderer must centralize safe-mode state changes.');
assert(renderer.includes('readOnly: state.safeMode'), 'Monaco must be read-only while safe mode is active.');
assert(renderer.includes('if (state.safeMode) return false;'), 'Saving must be blocked while safe mode is active.');
assert(renderer.includes('bracketPairColorization: { enabled: true }'), 'Bracket pair colorization should be enabled for professional code highlighting.');
assert(renderer.includes("matchBrackets: 'always'"), 'Matching bracket highlight should be enabled.');
assert(renderer.includes("autoIndent: 'advanced'"), 'Advanced auto indentation should be enabled.');
assert(renderer.includes('useTabStops: true'), 'Tab-stop aware indentation should be enabled.');
assert(renderer.includes('scrollbar: { useShadows: false }'), 'Monaco scroll shadows must be disabled to avoid black horizontal lines while scrolling.');
assert(renderer.includes('stickyScroll: { enabled: false }'), 'Monaco sticky scroll must be disabled to remove the black sticky-context divider.');
assert(renderer.includes("defineTheme('atom-one-dark'"), 'Monaco must define an Atom One Dark theme.');
assert(renderer.includes("theme: 'atom-one-dark'"), 'Monaco editor must use the Atom One Dark theme.');
assert(renderer.includes('fileGlyphForEntry'), 'Renderer must use simple Atom-like file glyphs instead of emoji icons.');
assert(!renderer.includes("py:'🐍'"), 'Python files must not use emoji icons in the Atom visual refresh.');

assert(!swift.includes('window.editorBridge.openFile('), 'Swift should not call the removed openFile JS bridge.');
assert(swift.includes('application(_ sender: NSApplication, openFiles filenames: [String])'), 'App must accept files opened from Finder / Open With.');
assert(swift.includes('panel.canChooseFiles = true\n        panel.canChooseDirectories = true'), 'Open Folder dialog must allow selecting either source files or folders.');
assert(swift.includes('self?.openPathFromSystem(url.path)'), 'Open Folder dialog must dispatch selected files and folders through openPathFromSystem.');
assert(swift.includes('decodeTextData'), 'Native file loading must use the shared text decoder instead of UTF-8 only.');
assert(swift.includes('declaredPythonEncoding'), 'Python files with PEP 263 encoding declarations must be decoded.');
assert(swift.includes('openFolderFromJSON'), 'Swift must pass folder paths to JS through JSON, not string interpolation.');
assert(renderer.includes('openFolderFromJSON(data)'), 'Renderer must accept JSON folder-open payloads from Swift.');
assert(swift.includes('window.titleVisibility = .hidden'), 'Native title text must be hidden so it does not overlap traffic lights.');
assert(swift.includes('openFileItem.target = self'), 'Open File menu item must target AppDelegate directly.');
assert(css.includes('padding-top: var(--titlebar-height)'), 'Web content must leave space for the macOS traffic lights/titlebar.');
assert(css.includes('#btn-safe-mode'), 'Safe-mode toggle must be styled in the top-left rail.');
assert(css.includes('.safe-mode-badge'), 'Editor must show a subtle read-only/safe-mode badge.');
assert(css.includes('--atom-editor-bg: #282c34'), 'CSS must expose Atom One Dark editor background token.');
assert(css.includes('--atom-panel-bg: #21252b'), 'CSS must expose Atom One Dark panel background token.');
assert(css.includes('--atom-accent-blue: #61afef'), 'CSS must expose Atom One Dark blue accent token.');
assert(css.includes('background: var(--atom-status-bg)'), 'Status bar must use the Atom-style status background token.');
assert(buildScript.includes('../../dist'), 'Native build must output to the project-level dist folder.');
assert(buildScript.includes('LEGACY_BUILD_DIR'), 'Native build must clean the old nested build output.');
assert(buildScript.includes('public.folder'), 'App bundle must advertise folder support to Launch Services.');

console.log('static checks passed');
