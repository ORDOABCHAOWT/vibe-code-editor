import Cocoa
import WebKit

// MARK: - App Delegate
class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var currentFilePath: String?
    var currentFolderPath: String?
    var isModified = false
    var webContentReady = false
    var pendingOpenPaths: [String] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // --- Window ---
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 820)
        let w: CGFloat = min(1280, screenRect.width * 0.85)
        let h: CGFloat = min(820, screenRect.height * 0.85)
        let x = screenRect.origin.x + (screenRect.width - w) / 2
        let y = screenRect.origin.y + (screenRect.height - h) / 2

        window = NSWindow(
            contentRect: NSRect(x: x, y: y, width: w, height: h),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "代码编辑器"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.118, green: 0.118, blue: 0.118, alpha: 1)
        window.minSize = NSSize(width: 640, height: 400)
        window.isReleasedWhenClosed = false
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true

        // --- WKWebView ---
        let config = WKWebViewConfiguration()
        let userContent = config.userContentController
        // Register message handlers for JS→Swift communication
        let handler = MessageHandler(delegate: self)
        userContent.add(handler, name: "openFile")
        userContent.add(handler, name: "openFolder")
        userContent.add(handler, name: "saveFile")
        userContent.add(handler, name: "saveFileAs")
        userContent.add(handler, name: "readDir")
        userContent.add(handler, name: "readFile")
        userContent.add(handler, name: "fileModified")
        userContent.add(handler, name: "log")

        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.suppressesIncrementalRendering = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsBackForwardNavigationGestures = false

        // Use a container so the native titlebar drag region is preserved.
        // WKWebView as direct contentView swallows all mouse events including
        // the titlebar drag, making the window immovable.
        let container = NSView(frame: .zero)
        container.wantsLayer = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        window.contentView = container
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])

        // Load the editor HTML from the Resources bundle
        if let htmlURL = Bundle.main.url(forResource: "editor", withExtension: "html", subdirectory: "web") {
            webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        } else {
            // Fallback: load from the source tree (development)
            let devPath = findResourcesPath()
            let htmlURL = URL(fileURLWithPath: devPath + "/web/editor.html")
            let dirURL = URL(fileURLWithPath: devPath + "/web")
            webView.loadFileURL(htmlURL, allowingReadAccessTo: dirURL)
        }

        // Add a transparent drag bar over the titlebar area so the window
        // can be moved by dragging the top edge, even though WKWebView sits
        // underneath and swallows mouse events.
        let titlebarDrag = WindowDragView(frame: .zero)
        titlebarDrag.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(titlebarDrag)
        NSLayoutConstraint.activate([
            titlebarDrag.topAnchor.constraint(equalTo: container.topAnchor),
            titlebarDrag.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            titlebarDrag.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            titlebarDrag.heightAnchor.constraint(equalToConstant: 30),
        ])

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        buildMenu()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        for filename in filenames {
            openPathFromSystem(filename)
        }
        sender.reply(toOpenOrPrint: .success)
    }

    func application(_ sender: NSApplication, openFile filename: String) -> Bool {
        openPathFromSystem(filename)
        return true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webContentReady = true
        let paths = pendingOpenPaths
        pendingOpenPaths.removeAll()
        for path in paths {
            openPathFromSystem(path)
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if isModified {
            let alert = NSAlert()
            alert.messageText = "是否保存对当前文件的修改?"
            alert.informativeText = "不保存将会丢失这些更改."
            alert.addButton(withTitle: "保存")
            alert.addButton(withTitle: "不保存")
            alert.addButton(withTitle: "取消")
            let response = alert.runModal()
            if response == .alertFirstButtonReturn {
                saveCurrentFile()
                return .terminateNow
            } else if response == .alertSecondButtonReturn {
                return .terminateNow
            } else {
                return .terminateCancel
            }
        }
        return .terminateNow
    }

    // MARK: - Resource path
    func findResourcesPath() -> String {
        // When running from Xcode or CLI, find Resources relative to executable
        let execURL = URL(fileURLWithPath: CommandLine.arguments[0])
        let candidates = [
            execURL.deletingLastPathComponent().appendingPathComponent("Resources").path,
            execURL.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources").path,
            Bundle.main.resourcePath ?? ""
        ]
        for c in candidates {
            if FileManager.default.fileExists(atPath: c + "/web/editor.html") {
                return c
            }
        }
        return Bundle.main.resourcePath ?? "."
    }

    // MARK: - Menu
    func buildMenu() {
        let mainMenu = NSMenu()

        // App menu
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于代码编辑器", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏代码编辑器", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        appMenu.items.last?.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "显示全部", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出代码编辑器", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appMenuItem = NSMenuItem()
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // File menu
        let fileMenu = NSMenu(title: "文件")
        let newFileItem = fileMenu.addItem(withTitle: "新建文件", action: #selector(newFile), keyEquivalent: "n")
        newFileItem.target = self
        let openFileItem = fileMenu.addItem(withTitle: "打开文件…", action: #selector(openFileDialog), keyEquivalent: "o")
        openFileItem.target = self
        let openFolderItem = fileMenu.addItem(withTitle: "打开文件夹…", action: #selector(openFolderDialog), keyEquivalent: "O")
        openFolderItem.target = self
        openFolderItem.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(.separator())
        let saveItem = fileMenu.addItem(withTitle: "保存", action: #selector(saveCurrentFile), keyEquivalent: "s")
        saveItem.target = self
        let saveAsItem = fileMenu.addItem(withTitle: "另存为…", action: #selector(saveFileAs), keyEquivalent: "S")
        saveAsItem.target = self
        saveAsItem.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(.separator())
        let closeTabItem = fileMenu.addItem(withTitle: "关闭标签页", action: #selector(closeTab), keyEquivalent: "w")
        closeTabItem.target = self
        let fileMenuItem = NSMenuItem()
        fileMenuItem.submenu = fileMenu
        mainMenu.addItem(fileMenuItem)

        // Edit menu
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.items.last?.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenu.addItem(.separator())
        let findItem = editMenu.addItem(withTitle: "查找", action: #selector(findInEditor), keyEquivalent: "f")
        findItem.target = self
        let editMenuItem = NSMenuItem()
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // View menu
        let viewMenu = NSMenu(title: "视图")
        let toggleSidebarItem = viewMenu.addItem(withTitle: "折叠/展开侧边栏", action: #selector(toggleSidebar), keyEquivalent: "b")
        toggleSidebarItem.target = self
        viewMenu.addItem(.separator())
        let zoomInItem = viewMenu.addItem(withTitle: "放大", action: #selector(zoomIn), keyEquivalent: "+")
        zoomInItem.target = self
        let zoomOutItem = viewMenu.addItem(withTitle: "缩小", action: #selector(zoomOut), keyEquivalent: "-")
        zoomOutItem.target = self
        let resetZoomItem = viewMenu.addItem(withTitle: "重置缩放", action: #selector(resetZoom), keyEquivalent: "0")
        resetZoomItem.target = self
        viewMenu.addItem(.separator())
        let fullScreenItem = NSMenuItem(title: "全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreenItem.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fullScreenItem)
        let viewMenuItem = NSMenuItem()
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // Window menu
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        let windowMenuItem = NSMenuItem()
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
        NSApp.windowsMenu = windowMenu
    }

    // MARK: - Menu Actions
    @objc func newFile() {
        webView.evaluateJavaScript("window.editorBridge.newFile()")
    }

    @objc func openFileDialog() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.openFileAtPath(url.path)
        }
    }

    @objc func openFolderDialog() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.openPathFromSystem(url.path)
        }
    }

    @objc func saveCurrentFile() {
        webView.evaluateJavaScript("window.editorBridge.requestSave()")
    }

    @objc func saveFileAs() {
        webView.evaluateJavaScript("window.editorBridge.requestSaveAs()")
    }

    @objc func closeTab() {
        webView.evaluateJavaScript("window.editorBridge.closeCurrentTab()")
    }

    @objc func findInEditor() {
        webView.evaluateJavaScript("window.editorBridge.find()")
    }

    @objc func toggleSidebar() {
        webView.evaluateJavaScript("window.editorBridge.toggleSidebar()")
    }

    @objc func zoomIn() {
        webView.evaluateJavaScript("window.editorBridge.zoomIn()")
    }

    @objc func zoomOut() {
        webView.evaluateJavaScript("window.editorBridge.zoomOut()")
    }

    @objc func resetZoom() {
        webView.evaluateJavaScript("window.editorBridge.resetZoom()")
    }

    // MARK: - File Operations (called from JS)
    func openFileAtPath(_ path: String) {
        guard webContentReady else {
            pendingOpenPaths.append(path)
            return
        }
        let maxSize = 16 * 1024 * 1024
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let size = attrs[.size] as? Int, size <= maxSize else {
            showAlert("文件过大", "编辑器只允许打开 16MB 以内的文件.")
            return
        }
        guard let data = FileManager.default.contents(atPath: path),
              let content = decodeTextData(data, path: path) else {
            showAlert("打开失败", "无法读取文件或无法识别文本编码.")
            return
        }
        let name = (path as NSString).lastPathComponent
        sendFileToJS(name: name, content: content, path: path)
    }

    func sendFileToJS(name: String, content: String, path: String) {
        // Use JSON for safe escaping of arbitrary file content
        let payload: [String: Any] = ["name": name, "content": content, "path": path]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let jsonStr = String(data: jsonData, encoding: .utf8) else { return }
        let js = "window.editorBridge.openFileFromJSON(\(jsonStr))"
        webView.evaluateJavaScript(js)
    }

    func openFolderAtPath(_ path: String) {
        guard webContentReady else {
            pendingOpenPaths.append(path)
            return
        }
        let payload: [String: Any] = ["path": path]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let jsonStr = String(data: jsonData, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.editorBridge.openFolderFromJSON(\(jsonStr))")
    }

    func openPathFromSystem(_ path: String) {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else { return }
        if isDir.boolValue {
            openFolderAtPath(path)
        } else {
            openFileAtPath(path)
        }
    }

    func readDirectory(_ path: String, callbackId: String) {
        DispatchQueue.global(qos: .userInitiated).async {
            var results: [[String: Any]] = []
            guard let entries = try? FileManager.default.contentsOfDirectory(atPath: path) else {
                DispatchQueue.main.async { [weak self] in
                    self?.webView.evaluateJavaScript("window.editorBridge.dirCallback('\(callbackId)', [])")
                }
                return
            }
            for entry in entries.prefix(3000) {
                if entry == ".DS_Store" || entry == ".git" { continue }
                let fullPath = (path as NSString).appendingPathComponent(entry)
                var isDir: ObjCBool = false
                FileManager.default.fileExists(atPath: fullPath, isDirectory: &isDir)
                results.append([
                    "name": entry,
                    "path": fullPath,
                    "isDirectory": isDir.boolValue
                ])
            }
            // Sort: directories first, then alphabetical
            results.sort { a, b in
                let aDir = a["isDirectory"] as? Bool ?? false
                let bDir = b["isDirectory"] as? Bool ?? false
                if aDir != bDir { return aDir }
                return (a["name"] as? String ?? "") < (b["name"] as? String ?? "")
            }
            guard let jsonData = try? JSONSerialization.data(withJSONObject: results),
                  let jsonStr = String(data: jsonData, encoding: .utf8) else { return }
            DispatchQueue.main.async { [weak self] in
                self?.webView.evaluateJavaScript("window.editorBridge.dirCallback('\(callbackId)', \(jsonStr))")
            }
        }
    }

    func readFileForJS(_ path: String, callbackId: String) {
        DispatchQueue.global(qos: .userInitiated).async {
            let maxSize = 16 * 1024 * 1024
            guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
                  let size = attrs[.size] as? Int, size <= maxSize,
                  let data = FileManager.default.contents(atPath: path),
                  let content = self.decodeTextData(data, path: path) else {
                DispatchQueue.main.async { [weak self] in
                    self?.webView.evaluateJavaScript("window.editorBridge.fileCallback('\(callbackId)', null, '读取失败')")
                }
                return
            }
            let payload: [String: Any] = ["content": content]
            guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
                  let jsonStr = String(data: jsonData, encoding: .utf8) else { return }
            DispatchQueue.main.async { [weak self] in
                self?.webView.evaluateJavaScript("window.editorBridge.fileCallback('\(callbackId)', \(jsonStr), null)")
            }
        }
    }

    func saveFileFromJS(_ path: String, _ content: String) {
        do {
            try content.write(toFile: path, atomically: true, encoding: .utf8)
            webView.evaluateJavaScript("window.editorBridge.onSaveSuccess()")
        } catch {
            let message = escapeForJS(error.localizedDescription)
            webView.evaluateJavaScript("window.editorBridge.onSaveFailure('\(message)')")
            showAlert("保存失败", error.localizedDescription)
        }
    }

    func saveFileAsFromJS(_ suggestedName: String, _ content: String) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedName
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else {
                self?.webView.evaluateJavaScript("window.editorBridge.onSaveCanceled()")
                return
            }
            do {
                try content.write(to: url, atomically: true, encoding: .utf8)
                let newName = url.lastPathComponent
                let newPath = url.path
                let payload: [String: Any] = ["name": newName, "path": newPath]
                if let jsonData = try? JSONSerialization.data(withJSONObject: payload),
                   let jsonStr = String(data: jsonData, encoding: .utf8) {
                    self?.webView.evaluateJavaScript("window.editorBridge.onSaveAsSuccess(\(jsonStr))")
                }
            } catch {
                let message = self?.escapeForJS(error.localizedDescription) ?? "未知错误"
                self?.webView.evaluateJavaScript("window.editorBridge.onSaveFailure('\(message)')")
                self?.showAlert("保存失败", error.localizedDescription)
            }
        }
    }

    // MARK: - Helpers
    func escapeForJS(_ s: String) -> String {
        return s.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
                .replacingOccurrences(of: "\t", with: "\\t")
    }

    func decodeTextData(_ data: Data, path: String) -> String? {
        if data.isEmpty { return "" }

        var encodings: [String.Encoding] = []
        let ext = (path as NSString).pathExtension.lowercased()
        if ext == "py" || ext == "pyw" {
            if let declared = declaredPythonEncoding(in: data) {
                encodings.append(declared)
            }
        }

        encodings.append(contentsOf: [.utf8, .utf16, .utf16LittleEndian, .utf16BigEndian])
        if containsNulByte(data) { return firstDecodedString(data, encodings: encodings) }

        encodings.append(contentsOf: [
            gb18030Encoding(),
            .windowsCP1252,
            .isoLatin1,
            .macOSRoman
        ].compactMap { $0 })

        return firstDecodedString(data, encodings: encodings)
    }

    func firstDecodedString(_ data: Data, encodings: [String.Encoding]) -> String? {
        var seen = Set<UInt>()
        for encoding in encodings where seen.insert(encoding.rawValue).inserted {
            if let content = String(data: data, encoding: encoding) {
                return content
            }
        }
        return nil
    }

    func declaredPythonEncoding(in data: Data) -> String.Encoding? {
        let sample = String(decoding: data.prefix(512), as: Unicode.ASCII.self)
        let lines = sample.split(separator: "\n", omittingEmptySubsequences: false).prefix(2)
        let regex = try? NSRegularExpression(pattern: #"coding[:=]\s*([-\w.]+)"#)
        for lineSub in lines {
            let line = String(lineSub)
            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            guard let match = regex?.firstMatch(in: line, range: range),
                  match.numberOfRanges > 1,
                  let nameRange = Range(match.range(at: 1), in: line) else { continue }
            return textEncoding(named: String(line[nameRange]))
        }
        return nil
    }

    func textEncoding(named name: String) -> String.Encoding? {
        let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "_", with: "-")
        switch normalized {
        case "utf-8", "utf8", "utf-8-sig":
            return .utf8
        case "utf-16", "utf16":
            return .utf16
        case "utf-16-le", "utf16-le":
            return .utf16LittleEndian
        case "utf-16-be", "utf16-be":
            return .utf16BigEndian
        case "latin-1", "latin1", "iso-8859-1":
            return .isoLatin1
        case "windows-1252", "cp1252":
            return .windowsCP1252
        case "gbk", "gb2312", "gb18030", "cp936":
            return gb18030Encoding()
        case "big5", "big-5":
            return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.big5.rawValue)))
        case "shift-jis", "shift-jisx0213", "sjis", "cp932":
            return .shiftJIS
        default:
            return nil
        }
    }

    func gb18030Encoding() -> String.Encoding? {
        return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.GB_18030_2000.rawValue)))
    }

    func containsNulByte(_ data: Data) -> Bool {
        return data.prefix(4096).contains(0)
    }

    func showAlert(_ title: String, _ message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.runModal()
    }
}

// MARK: - WKScriptMessageHandler
class MessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: AppDelegate?
    init(delegate: AppDelegate) { self.delegate = delegate }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        switch message.name {
        case "openFile":
            delegate?.openFileDialog()
        case "openFolder":
            delegate?.openFolderDialog()
        case "saveFile":
            if let path = body["path"] as? String, let content = body["content"] as? String {
                delegate?.saveFileFromJS(path, content)
            }
        case "saveFileAs":
            let name = body["name"] as? String ?? "untitled.txt"
            let content = body["content"] as? String ?? ""
            delegate?.saveFileAsFromJS(name, content)
        case "readDir":
            if let path = body["path"] as? String, let cbId = body["callbackId"] as? String {
                delegate?.readDirectory(path, callbackId: cbId)
            }
        case "readFile":
            if let path = body["path"] as? String, let cbId = body["callbackId"] as? String {
                delegate?.readFileForJS(path, callbackId: cbId)
            }
        case "fileModified":
            delegate?.isModified = body["modified"] as? Bool ?? false
        case "log":
            if let msg = body["message"] as? String {
                print("[JS]", msg)
            }
        default:
            break
        }
    }
}

// MARK: - Window Drag View
/// A transparent view placed over the titlebar area that enables window
/// dragging. It intercepts mouseDown/mouseDragged and calls the native
/// window move mechanism, while passing double-clicks through for
/// zoom (standard macOS titlebar behavior).
class WindowDragView: NSView {
    var initialLocation: NSPoint = .zero

    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            // Double-click = zoom (standard titlebar behavior)
            window?.performZoom(nil)
            return
        }
        initialLocation = event.locationInWindow
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window = self.window else { return }
        let currentLocation = event.locationInWindow
        let newOrigin = NSPoint(
            x: window.frame.origin.x + (currentLocation.x - initialLocation.x),
            y: window.frame.origin.y + (currentLocation.y - initialLocation.y)
        )
        window.setFrameOrigin(newOrigin)
    }

    override var mouseDownCanMoveWindow: Bool { true }
}

// MARK: - Main
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
