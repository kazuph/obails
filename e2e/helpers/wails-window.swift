import CoreGraphics
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 2, let pid = pid_t(arguments[1]), pid > 0 else {
    throw NSError(domain: "ObailsNativeWindow", code: 1, userInfo: [NSLocalizedDescriptionKey: "positive PID is required"])
}

let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let windows = rows.compactMap { row -> [String: Any]? in
    guard (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
          (row[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 else { return nil }
    return [
        "windowNumber": (row[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0,
        "title": row[kCGWindowName as String] as? String ?? "",
        "bounds": row[kCGWindowBounds as String] as? [String: Any] ?? [:],
    ]
}

let data = try JSONSerialization.data(withJSONObject: windows, options: [])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data([0x0A]))
