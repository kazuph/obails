import ApplicationServices
import AppKit
import Carbon.HIToolbox
import Foundation

enum AXHelperError: Error, LocalizedError {
    case usage(String)
    case invalidPID
    case notFrontmost(expected: pid_t, actual: pid_t)
    case tccDenied(String)
    case timeout(String)
    case missingElement(String)
    case axFailure(String)

    var errorDescription: String? {
        switch self {
        case .usage(let message): return message
        case .invalidPID: return "positive PID is required"
        case .notFrontmost(let expected, let actual): return "PID \(expected) is not frontmost (actual \(actual))"
        case .tccDenied(let message): return message
        case .timeout(let message): return message
        case .missingElement(let message): return message
        case .axFailure(let message): return message
        }
    }
}

struct SurveyResult: Codable {
    let webAreaCount: Int
    let buttonCount: Int
    let buttons: [String]
    let namedButtons: [String: Bool]
}

struct ActivateResult: Codable {
    let ok: Bool
    let frontmost: Bool
    let pid: Int32
}

struct ActionResult: Codable {
    let ok: Bool
    let pid: Int32
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    fputs("usage: wails-ax.swift <command> <pid> <timeoutMs> [...]\n", stderr)
    exit(2)
}

let command = arguments[1]
guard arguments.count >= 3, let pid = pid_t(arguments[2]), pid > 0 else {
    fputs("{\"error\":\"positive PID is required\"}\n", stderr)
    exit(1)
}

func emit<T: Encodable>(_ value: T) throws {
    let data = try JSONEncoder().encode(value)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

func axErrorMessage(_ error: AXError) -> String {
    switch error {
    case .apiDisabled: return "Accessibility API disabled (TCC not granted)"
    case .cannotComplete: return "Accessibility action cannot complete"
    case .invalidUIElement: return "Invalid UI element"
    case .notImplemented: return "Accessibility API not implemented"
    default: return "Accessibility error \(error.rawValue)"
    }
}

func requireTrusted() throws {
    guard AXIsProcessTrusted() else {
        throw AXHelperError.tccDenied("Accessibility permission is not granted for this helper process")
    }
}

func timeoutMs() throws -> Int {
    guard arguments.count >= 4, let value = Int(arguments[3]), value > 0 else {
        throw AXHelperError.usage("positive timeout ms is required")
    }
    return value
}

func deadlineFromTimeout(_ timeout: Int) -> Date {
    Date().addingTimeInterval(Double(timeout) / 1000.0)
}

func attr(_ element: AXUIElement, _ name: String) throws -> AnyObject? {
    var value: AnyObject?
    let error = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    switch error {
    case .success:
        return value
    case .apiDisabled:
        throw AXHelperError.tccDenied(axErrorMessage(error))
    default:
        return nil
    }
}

func role(of element: AXUIElement) throws -> String {
    (try attr(element, kAXRoleAttribute) as? String) ?? ""
}

func children(of element: AXUIElement) throws -> [AXUIElement] {
    (try attr(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

func title(of element: AXUIElement) throws -> String {
    let primary = (try attr(element, kAXTitleAttribute) as? String) ?? ""
    if !primary.isEmpty { return primary }
    return (try attr(element, kAXDescriptionAttribute) as? String) ?? ""
}

func accessibleName(of element: AXUIElement) throws -> String {
    let description = (try attr(element, kAXDescriptionAttribute) as? String) ?? ""
    if !description.isEmpty { return description }
    return (try attr(element, kAXTitleAttribute) as? String) ?? ""
}

func isEnabled(_ element: AXUIElement) throws -> Bool {
    guard let enabled = try attr(element, kAXEnabledAttribute) as? Bool else {
        return true
    }
    return enabled
}

func isFocused(_ element: AXUIElement) throws -> Bool {
    (try attr(element, kAXFocusedAttribute) as? Bool) ?? false
}

func elementPointer(_ element: AXUIElement) -> UnsafeRawPointer {
    UnsafeRawPointer(Unmanaged.passUnretained(element as CFTypeRef).toOpaque())
}

func checkDeadline(_ deadline: Date) throws {
    if Date() >= deadline {
        throw AXHelperError.timeout("AX traversal deadline exceeded")
    }
}

func findElements(
    role expectedRole: String,
    named expectedName: String,
    element: AXUIElement,
    deadline: Date,
    visited: inout Set<UnsafeRawPointer>
) throws -> [AXUIElement] {
    try checkDeadline(deadline)
    let pointer = elementPointer(element)
    guard visited.insert(pointer).inserted else { return [] }

    var matches: [AXUIElement] = []
    if try role(of: element) == expectedRole, try accessibleName(of: element) == expectedName {
        matches.append(element)
    }
    for child in try children(of: element) {
        matches.append(contentsOf: try findElements(
            role: expectedRole,
            named: expectedName,
            element: child,
            deadline: deadline,
            visited: &visited
        ))
    }
    return matches
}

func findTextAreas(named expectedName: String, element: AXUIElement, deadline: Date) throws -> [AXUIElement] {
    var visited = Set<UnsafeRawPointer>()
    return try findElements(role: "AXTextArea", named: expectedName, element: element, deadline: deadline, visited: &visited)
}

func collectButtons(
    element: AXUIElement,
    deadline: Date,
    visited: inout Set<UnsafeRawPointer>,
    buttons: inout [String],
    webAreaCount: inout Int
) throws {
    try checkDeadline(deadline)
    let pointer = elementPointer(element)
    guard visited.insert(pointer).inserted else { return }

    let elementRole = try role(of: element)
    if elementRole == "AXWebArea" {
        webAreaCount += 1
    }
    if elementRole == "AXButton" {
        let label = try accessibleName(of: element)
        if label.isEmpty {
            let fallback = try title(of: element)
            if !fallback.isEmpty {
                buttons.append(fallback)
            }
        } else {
            buttons.append(label)
        }
    }
    for child in try children(of: element) {
        try collectButtons(element: child, deadline: deadline, visited: &visited, buttons: &buttons, webAreaCount: &webAreaCount)
    }
}

func frontmostPID() -> pid_t {
    NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
}

func activateApplication(pid: pid_t) throws {
    guard let running = NSRunningApplication(processIdentifier: pid) else {
        throw AXHelperError.axFailure("No NSRunningApplication for PID \(pid)")
    }
    let app = AXUIElementCreateApplication(pid)

    let frontmostError = AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    if frontmostError == .apiDisabled {
        throw AXHelperError.tccDenied(axErrorMessage(frontmostError))
    }
    if frontmostError != .success {
        throw AXHelperError.axFailure(axErrorMessage(frontmostError))
    }

    guard running.activate(options: [.activateIgnoringOtherApps]) else {
        throw AXHelperError.axFailure("NSRunningApplication.activate failed for PID \(pid)")
    }

    if let mainWindow = try attr(app, kAXMainWindowAttribute) as! AXUIElement? {
        _ = AXUIElementSetAttributeValue(mainWindow, kAXMainAttribute as CFString, kCFBooleanTrue)
        _ = AXUIElementSetAttributeValue(mainWindow, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        let raiseError = AXUIElementPerformAction(mainWindow, kAXRaiseAction as CFString)
        if raiseError != .success && raiseError != .actionUnsupported {
            throw AXHelperError.axFailure(axErrorMessage(raiseError))
        }
    }

    let actual = frontmostPID()
    guard actual == pid else {
        throw AXHelperError.notFrontmost(expected: pid, actual: actual)
    }
}

func requireFrontmost(pid: pid_t) throws {
    let actual = frontmostPID()
    guard actual == pid else {
        throw AXHelperError.notFrontmost(expected: pid, actual: actual)
    }
}

func resolveUniqueSourceEditor(pid: pid_t, paneId: String, deadline: Date, allowToggle: Bool) throws -> AXUIElement {
    try requireFrontmost(pid: pid)
    let expectedName = "Editor in pane \(paneId)"
    let app = AXUIElementCreateApplication(pid)
    let matches = try findTextAreas(named: expectedName, element: app, deadline: deadline)

    switch matches.count {
    case 1:
        let editor = matches[0]
        guard try isEnabled(editor) else {
            throw AXHelperError.axFailure("AXTextArea '\(expectedName)' is disabled for PID \(pid)")
        }
        return editor
    case 0:
        if allowToggle {
            pressKey(pid: pid, keyCode: CGKeyCode(kVK_ANSI_E), flags: .maskCommand)
            throw AXHelperError.missingElement("AXTextArea '\(expectedName)' pending after source toggle for PID \(pid)")
        }
        throw AXHelperError.missingElement("AXTextArea '\(expectedName)' is missing for PID \(pid)")
    default:
        throw AXHelperError.missingElement("AXTextArea '\(expectedName)' is ambiguous (\(matches.count) matches) for PID \(pid)")
    }
}

func pressKey(pid: pid_t, keyCode: CGKeyCode, flags: CGEventFlags = []) {
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
    down?.flags = flags
    let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
    up?.flags = flags
    down?.postToPid(pid)
    up?.postToPid(pid)
}

func pasteText(pid: pid_t, text: String) throws {
    let snapshot = snapshotPasteboard()
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    guard pasteboard.setString(text, forType: .string) else {
        restorePasteboard(snapshot)
        throw AXHelperError.axFailure("Failed to set pasteboard string")
    }
    pressKey(pid: pid, keyCode: CGKeyCode(kVK_ANSI_V), flags: .maskCommand)
    // WebKit may read the pasteboard asynchronously; restore only after paste settles.
    Thread.sleep(forTimeInterval: 0.4)
    restorePasteboard(snapshot)
}

struct PasteboardSnapshot {
    let items: [[NSPasteboard.PasteboardType: Data]]
}

func snapshotPasteboard() -> PasteboardSnapshot {
    let pasteboard = NSPasteboard.general
    let items = (pasteboard.pasteboardItems ?? []).map { item -> [NSPasteboard.PasteboardType: Data] in
        var payload: [NSPasteboard.PasteboardType: Data] = [:]
        for type in item.types {
            if let data = item.data(forType: type) {
                payload[type] = data
            }
        }
        return payload
    }
    return PasteboardSnapshot(items: items)
}

func restorePasteboard(_ snapshot: PasteboardSnapshot) {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    guard !snapshot.items.isEmpty else { return }
    let restoredItems = snapshot.items.map { payload -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (type, data) in payload {
            item.setData(data, forType: type)
        }
        return item
    }
    pasteboard.writeObjects(restoredItems)
}

func pointValue(_ element: AXUIElement) throws -> CGPoint? {
    guard let value = try attr(element, kAXPositionAttribute) else { return nil }
    var point = CGPoint.zero
    guard AXValueGetValue(value as! AXValue, .cgPoint, &point) else { return nil }
    return point
}

func sizeValue(_ element: AXUIElement) throws -> CGSize? {
    guard let value = try attr(element, kAXSizeAttribute) else { return nil }
    var size = CGSize.zero
    guard AXValueGetValue(value as! AXValue, .cgSize, &size) else { return nil }
    return size
}

func click(at point: CGPoint) {
    let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
    let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
}

func focusElement(_ element: AXUIElement, pid: pid_t, label: String) throws {
    guard try isEnabled(element) else {
        throw AXHelperError.axFailure("\(label) is disabled for PID \(pid)")
    }
    let raiseError = AXUIElementPerformAction(element, kAXRaiseAction as CFString)
    if raiseError != .success && raiseError != .actionUnsupported {
        throw AXHelperError.axFailure(axErrorMessage(raiseError))
    }
    let focusError = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    if focusError != .success {
        throw AXHelperError.axFailure(axErrorMessage(focusError))
    }
    if let position = try pointValue(element), let size = try sizeValue(element) {
        let center = CGPoint(x: position.x + size.width / 2.0, y: position.y + size.height / 2.0)
        click(at: center)
    }
}

func focusEditorTextArea(pid: pid_t, paneId: String, deadline: Date, allowToggle: Bool) throws -> AXUIElement {
    let editor = try resolveUniqueSourceEditor(pid: pid, paneId: paneId, deadline: deadline, allowToggle: allowToggle)
    try focusElement(editor, pid: pid, label: "AXTextArea 'Editor in pane \(paneId)'")
    return editor
}

func decodeText(arguments: [String], startingAt index: Int) throws -> String {
    if index < arguments.count, arguments[index] == "--base64" {
        guard index + 1 < arguments.count else {
            throw AXHelperError.usage("missing base64 payload")
        }
        guard let data = Data(base64Encoded: arguments[index + 1]),
              let text = String(data: data, encoding: .utf8) else {
            throw AXHelperError.usage("invalid base64 payload")
        }
        return text
    }
    guard index < arguments.count else {
        throw AXHelperError.usage("missing text payload")
    }
    return arguments[index...].joined(separator: " ")
}

do {
    try requireTrusted()
    let operationTimeout = try timeoutMs()
    let deadline = deadlineFromTimeout(operationTimeout)

    switch command {
    case "activate":
        try activateApplication(pid: pid)
        try emit(ActivateResult(ok: true, frontmost: true, pid: pid))

    case "survey":
        try activateApplication(pid: pid)
        let app = AXUIElementCreateApplication(pid)
        var buttons: [String] = []
        var webAreaCount = 0
        var visited = Set<UnsafeRawPointer>()
        try collectButtons(element: app, deadline: deadline, visited: &visited, buttons: &buttons, webAreaCount: &webAreaCount)
        let requiredNames = ["Settings", "New Note"]
        var namedButtons: [String: Bool] = [:]
        let buttonSet = Set(buttons)
        for name in requiredNames {
            namedButtons[name] = buttonSet.contains(name)
        }
        try emit(SurveyResult(
            webAreaCount: webAreaCount,
            buttonCount: buttons.count,
            buttons: buttons,
            namedButtons: namedButtons
        ))

    case "replace-editor-text":
        try activateApplication(pid: pid)
        let allowToggle = !arguments.contains("--no-toggle")
        var textStart = 4
        if textStart < arguments.count, arguments[textStart] == "--no-toggle" {
            textStart += 1
        }
        let text = try decodeText(arguments: arguments, startingAt: textStart)
        let editor = try focusEditorTextArea(pid: pid, paneId: "native-main", deadline: deadline, allowToggle: allowToggle)
        pressKey(pid: pid, keyCode: CGKeyCode(kVK_ANSI_A), flags: .maskCommand)
        try focusElement(editor, pid: pid, label: "AXTextArea 'Editor in pane native-main'")
        try pasteText(pid: pid, text: text)
        try focusElement(editor, pid: pid, label: "AXTextArea 'Editor in pane native-main'")
        try emit(ActionResult(ok: true, pid: pid))

    case "save":
        let editor = try focusEditorTextArea(pid: pid, paneId: "native-main", deadline: deadline, allowToggle: false)
        pressKey(pid: pid, keyCode: CGKeyCode(kVK_ANSI_S), flags: .maskCommand)
        try focusElement(editor, pid: pid, label: "AXTextArea 'Editor in pane native-main'")
        try emit(ActionResult(ok: true, pid: pid))

    case "click-button":
        try activateApplication(pid: pid)
        guard arguments.count >= 5 else {
            throw AXHelperError.usage("click-button requires a button accessible name")
        }
        let buttonName = arguments[4...].joined(separator: " ")
        let app = AXUIElementCreateApplication(pid)
        let roles = ["AXButton", "AXPopUpButton", "AXCheckBox", "AXRadioButton", "AXMenuItem"]
        var matches: [AXUIElement] = []
        for expectedRole in roles {
            var visited = Set<UnsafeRawPointer>()
            matches.append(contentsOf: try findElements(
                role: expectedRole,
                named: buttonName,
                element: app,
                deadline: deadline,
                visited: &visited
            ))
        }
        // Deduplicate by pointer
        var seen = Set<UnsafeRawPointer>()
        matches = matches.filter { el in
            let pointer = elementPointer(el)
            return seen.insert(pointer).inserted
        }
        guard matches.count == 1 else {
            throw AXHelperError.missingElement("Named control '\(buttonName)' match count=\(matches.count) for PID \(pid)")
        }
        try focusElement(matches[0], pid: pid, label: "control '\(buttonName)'")
        try emit(ActionResult(ok: true, pid: pid))

    case "click-role":
        try activateApplication(pid: pid)
        guard arguments.count >= 6 else {
            throw AXHelperError.usage("click-role requires <AXRole> <accessible-name>")
        }
        let expectedRole = arguments[4]
        let buttonName = arguments[5...].joined(separator: " ")
        let app = AXUIElementCreateApplication(pid)
        var visited = Set<UnsafeRawPointer>()
        let matches = try findElements(role: expectedRole, named: buttonName, element: app, deadline: deadline, visited: &visited)
        guard matches.count == 1 else {
            throw AXHelperError.missingElement("\(expectedRole) '\(buttonName)' match count=\(matches.count) for PID \(pid)")
        }
        try focusElement(matches[0], pid: pid, label: "\(expectedRole) '\(buttonName)'")
        try emit(ActionResult(ok: true, pid: pid))

    case "set-popup":
        try activateApplication(pid: pid)
        guard arguments.count >= 6 else {
            throw AXHelperError.usage("set-popup requires <accessible-name> <option-label>")
        }
        let popupName = arguments[4]
        let optionLabel = arguments[5...].joined(separator: " ")
        let app = AXUIElementCreateApplication(pid)
        var visited = Set<UnsafeRawPointer>()
        let popups = try findElements(role: "AXPopUpButton", named: popupName, element: app, deadline: deadline, visited: &visited)
        guard popups.count == 1 else {
            throw AXHelperError.missingElement("AXPopUpButton '\(popupName)' match count=\(popups.count) for PID \(pid)")
        }
        let popup = popups[0]
        try focusElement(popup, pid: pid, label: "AXPopUpButton '\(popupName)'")
        // Open menu and choose by typing/option press is brittle; set AXValue when supported.
        let setError = AXUIElementSetAttributeValue(popup, kAXValueAttribute as CFString, optionLabel as CFTypeRef)
        if setError != .success {
            // Fallback: press space to open, then type option and return.
            pressKey(pid: pid, keyCode: CGKeyCode(kVK_Space), flags: [])
            Thread.sleep(forTimeInterval: 0.25)
            try pasteText(pid: pid, text: optionLabel)
            Thread.sleep(forTimeInterval: 0.2)
            pressKey(pid: pid, keyCode: CGKeyCode(kVK_Return), flags: [])
        }
        try emit(ActionResult(ok: true, pid: pid))

    case "set-text-field":
        try activateApplication(pid: pid)
        guard arguments.count >= 6 else {
            throw AXHelperError.usage("set-text-field requires <accessible-name> [--base64] <text>")
        }
        let fieldName = arguments[4]
        let text = try decodeText(arguments: arguments, startingAt: 5)
        let app = AXUIElementCreateApplication(pid)
        var matches: [AXUIElement] = []
        for expectedRole in ["AXTextField", "AXSearchField"] {
            var roleVisited = Set<UnsafeRawPointer>()
            matches.append(contentsOf: try findElements(
                role: expectedRole,
                named: fieldName,
                element: app,
                deadline: deadline,
                visited: &roleVisited
            ))
        }
        var seenFields = Set<UnsafeRawPointer>()
        matches = matches.filter { el in
            seenFields.insert(elementPointer(el)).inserted
        }
        guard matches.count == 1 else {
            throw AXHelperError.missingElement("AXTextField/AXSearchField '\(fieldName)' match count=\(matches.count) for PID \(pid)")
        }
        let field = matches[0]
        try focusElement(field, pid: pid, label: "text field '\(fieldName)'")
        // WebKit/Wails often accepts AXValue without updating the DOM input.value that
        // JavaScript reads. Always select-all + paste so listeners and .value stay in sync.
        pressKey(pid: pid, keyCode: CGKeyCode(kVK_ANSI_A), flags: .maskCommand)
        Thread.sleep(forTimeInterval: 0.05)
        try pasteText(pid: pid, text: text)
        Thread.sleep(forTimeInterval: 0.2)
        // Keep focus on the field (do not Tab away) so subsequent hotkeys see the non-note context.
        try focusElement(field, pid: pid, label: "text field '\(fieldName)'")
        try emit(ActionResult(ok: true, pid: pid))

    case "press-hotkey":
        try activateApplication(pid: pid)
        try requireFrontmost(pid: pid)
        guard arguments.count >= 5 else {
            throw AXHelperError.usage("press-hotkey requires <mods+key> e.g. cmd+f or cmd+shift+f")
        }
        let spec = arguments[4].lowercased()
        var flags: CGEventFlags = []
        if spec.contains("cmd") || spec.contains("command") || spec.contains("meta") { flags.insert(.maskCommand) }
        if spec.contains("shift") { flags.insert(.maskShift) }
        if spec.contains("alt") || spec.contains("option") { flags.insert(.maskAlternate) }
        if spec.contains("ctrl") || spec.contains("control") { flags.insert(.maskControl) }
        let keyToken = spec.split(separator: "+").last.map(String.init) ?? ""
        let keyMap: [String: CGKeyCode] = [
            "a": CGKeyCode(kVK_ANSI_A),
            "e": CGKeyCode(kVK_ANSI_E),
            "f": CGKeyCode(kVK_ANSI_F),
            "o": CGKeyCode(kVK_ANSI_O),
            "s": CGKeyCode(kVK_ANSI_S),
            "w": CGKeyCode(kVK_ANSI_W),
            "n": CGKeyCode(kVK_ANSI_N),
            "p": CGKeyCode(kVK_ANSI_P),
            "v": CGKeyCode(kVK_ANSI_V),
            "slash": CGKeyCode(kVK_ANSI_Slash),
            "?": CGKeyCode(kVK_ANSI_Slash),
            "escape": CGKeyCode(kVK_Escape),
            "esc": CGKeyCode(kVK_Escape),
            "return": CGKeyCode(kVK_Return),
            "enter": CGKeyCode(kVK_Return),
            "tab": CGKeyCode(kVK_Tab),
            "space": CGKeyCode(kVK_Space),
        ]
        guard let keyCode = keyMap[keyToken] else {
            throw AXHelperError.usage("unsupported hotkey key token: \(keyToken)")
        }
        if keyToken == "?" { flags.insert(.maskShift) }
        pressKey(pid: pid, keyCode: keyCode, flags: flags)
        try emit(ActionResult(ok: true, pid: pid))

    case "dump-buttons":
        try activateApplication(pid: pid)
        let app = AXUIElementCreateApplication(pid)
        var buttons: [String] = []
        var webAreaCount = 0
        var visited = Set<UnsafeRawPointer>()
        try collectButtons(element: app, deadline: deadline, visited: &visited, buttons: &buttons, webAreaCount: &webAreaCount)
        // Also include popup/checkbox accessible names used by the toolbar.
        struct ControlRow: Codable { let role: String; let name: String }
        var extras: [ControlRow] = []
        var visited2 = Set<UnsafeRawPointer>()
        func walkExtras(_ element: AXUIElement) throws {
            try checkDeadline(deadline)
            let pointer = elementPointer(element)
            guard visited2.insert(pointer).inserted else { return }
            let elementRole = try role(of: element)
            let name = try accessibleName(of: element)
            if !name.isEmpty && ["AXPopUpButton", "AXCheckBox", "AXTextField", "AXSearchField"].contains(elementRole) {
                extras.append(ControlRow(role: elementRole, name: name))
                if !buttons.contains(name) {
                    buttons.append(name)
                }
            }
            for child in try children(of: element) {
                try walkExtras(child)
            }
        }
        try walkExtras(app)
        struct DumpButtons: Codable {
            let pid: Int32
            let webAreaCount: Int
            let buttons: [String]
            let extras: [ControlRow]
        }
        try emit(DumpButtons(pid: pid, webAreaCount: webAreaCount, buttons: buttons, extras: extras))

    case "focus-editor":
        try activateApplication(pid: pid)
        var paneId = "native-main"
        if arguments.count >= 5 {
            paneId = arguments[4]
        }
        _ = try focusEditorTextArea(pid: pid, paneId: paneId, deadline: deadline, allowToggle: true)
        try emit(ActionResult(ok: true, pid: pid))

    case "dump-controls":
        try activateApplication(pid: pid)
        let app = AXUIElementCreateApplication(pid)
        struct ControlRow: Codable { let role: String; let name: String }
        var rows: [ControlRow] = []
        var visited = Set<UnsafeRawPointer>()
        func walk(_ element: AXUIElement) throws {
            try checkDeadline(deadline)
            let pointer = elementPointer(element)
            guard visited.insert(pointer).inserted else { return }
            let elementRole = try role(of: element)
            let name = try accessibleName(of: element)
            if !name.isEmpty && [
                "AXButton", "AXPopUpButton", "AXCheckBox", "AXRadioButton",
                "AXTextField", "AXTextArea", "AXComboBox", "AXMenuItem", "AXStaticText",
            ].contains(elementRole) {
                rows.append(ControlRow(role: elementRole, name: name))
            }
            for child in try children(of: element) {
                try walk(child)
            }
        }
        try walk(app)
        struct DumpControls: Codable { let pid: Int32; let controls: [ControlRow] }
        try emit(DumpControls(pid: pid, controls: rows))

    case "frame-named":
        try activateApplication(pid: pid)
        guard arguments.count >= 5 else {
            throw AXHelperError.usage("frame-named requires <accessible-name>")
        }
        let targetName = arguments[4...].joined(separator: " ")
        let app = AXUIElementCreateApplication(pid)
        var visited = Set<UnsafeRawPointer>()
        var match: AXUIElement?
        func walk(_ element: AXUIElement) throws {
            try checkDeadline(deadline)
            let pointer = elementPointer(element)
            guard visited.insert(pointer).inserted else { return }
            let name = try accessibleName(of: element)
            if name == targetName {
                match = element
                return
            }
            for child in try children(of: element) {
                if match != nil { return }
                try walk(child)
            }
        }
        try walk(app)
        guard let element = match else {
            throw AXHelperError.missingElement("element named '\(targetName)' for PID \(pid)")
        }
        let point = try pointValue(element) ?? .zero
        let size = try sizeValue(element) ?? .zero
        struct FrameResult: Codable {
            let ok: Bool
            let pid: Int32
            let name: String
            let x: Double
            let y: Double
            let width: Double
            let height: Double
        }
        try emit(FrameResult(
            ok: true,
            pid: pid,
            name: targetName,
            x: Double(point.x),
            y: Double(point.y),
            width: Double(size.width),
            height: Double(size.height)
        ))

    case "scroll-wheel-at":
        try activateApplication(pid: pid)
        try requireFrontmost(pid: pid)
        guard arguments.count >= 7 else {
            throw AXHelperError.usage("scroll-wheel-at requires <x> <y> <deltaLines>")
        }
        guard let x = Double(arguments[4]), let y = Double(arguments[5]), let delta = Double(arguments[6]) else {
            throw AXHelperError.usage("scroll-wheel-at requires numeric x y deltaLines")
        }
        let point = CGPoint(x: x, y: y)
        // Move cursor then emit precise scroll wheel lines (negative = scroll content up / reveal lower).
        if let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) {
            move.post(tap: .cghidEventTap)
        }
        Thread.sleep(forTimeInterval: 0.05)
        var scrolled = 0.0
        let step: Double = delta >= 0 ? 1 : -1
        let count = Int(abs(delta).rounded(.up))
        for _ in 0..<max(1, count) {
            if let wheel = CGEvent(
                scrollWheelEvent2Source: nil,
                units: .line,
                wheelCount: 1,
                wheel1: Int32(step),
                wheel2: 0,
                wheel3: 0
            ) {
                wheel.post(tap: .cghidEventTap)
                scrolled += step
                Thread.sleep(forTimeInterval: 0.02)
            }
        }
        struct ScrollResult: Codable { let ok: Bool; let pid: Int32; let x: Double; let y: Double; let deltaApplied: Double }
        try emit(ScrollResult(ok: true, pid: pid, x: x, y: y, deltaApplied: scrolled))

    case "list-scroll-metrics":
        try activateApplication(pid: pid)
        let app = AXUIElementCreateApplication(pid)
        struct ScrollMetric: Codable {
            let role: String
            let name: String
            let x: Double
            let y: Double
            let width: Double
            let height: Double
            let scrollBarValue: Double?
        }
        var rows: [ScrollMetric] = []
        var visited = Set<UnsafeRawPointer>()
        func scrollBarValue(of element: AXUIElement) -> Double? {
            // Prefer a child vertical scroll bar value in 0...1
            guard let kids = try? children(of: element) else { return nil }
            for kid in kids {
                let kidRole = (try? role(of: kid)) ?? ""
                if kidRole == "AXScrollBar" || kidRole == "AXValueIndicator" {
                    if let value = try? attr(kid, kAXValueAttribute) as? NSNumber {
                        return value.doubleValue
                    }
                }
            }
            if let value = try? attr(element, kAXValueAttribute) as? NSNumber {
                return value.doubleValue
            }
            return nil
        }
        func walk(_ element: AXUIElement) throws {
            try checkDeadline(deadline)
            let pointer = elementPointer(element)
            guard visited.insert(pointer).inserted else { return }
            let elementRole = try role(of: element)
            let name = try accessibleName(of: element)
            if ["AXScrollArea", "AXWebArea", "AXTextArea", "AXList", "AXOutline", "AXTable", "AXGroup"].contains(elementRole) {
                let point = try pointValue(element) ?? .zero
                let size = try sizeValue(element) ?? .zero
                if size.height >= 80 && size.width >= 80 {
                    rows.append(ScrollMetric(
                        role: elementRole,
                        name: name,
                        x: Double(point.x),
                        y: Double(point.y),
                        width: Double(size.width),
                        height: Double(size.height),
                        scrollBarValue: scrollBarValue(of: element)
                    ))
                }
            }
            for child in try children(of: element) {
                try walk(child)
            }
        }
        try walk(app)
        struct DumpScroll: Codable { let pid: Int32; let metrics: [ScrollMetric] }
        try emit(DumpScroll(pid: pid, metrics: rows))

    default:
        throw AXHelperError.usage("unknown command: \(command)")
    }
} catch {
    let message = error.localizedDescription
    fputs("{\"error\":\(try! String(data: JSONEncoder().encode(message), encoding: .utf8)!)}\n", stderr)
    exit(1)
}
