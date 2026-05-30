// obails-transcribe — Apple Speech (SpeechAnalyzer/SpeechTranscriber) CLI helper
//
// 音源ファイルをオンデバイスで文字起こしし、結果を JSON で stdout に出力する。
// macOS 26 (Tahoe) 以降が必要。Go バックエンド(services/transcribe_service.go)から
// exec.Command で呼び出される。
//
// Usage: obails-transcribe <audioPath> [locale]   (locale 既定: ja-JP)
// Output(stdout): {"text":"...","locale":"ja-JP"}
// Error(stderr) + 非ゼロ終了で失敗を通知。

import Foundation
import Speech
import AVFoundation

struct Output: Codable {
    let text: String
    let locale: String
}

func stderr(_ msg: String) {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
}

func fail(_ msg: String) -> Never {
    stderr(msg)
    exit(1)
}

@available(macOS 26.0, *)
func transcribe(audioPath: String, localeId: String) async throws -> String {
    let url = URL(fileURLWithPath: audioPath)
    guard FileManager.default.fileExists(atPath: audioPath) else {
        fail("file not found: \(audioPath)")
    }

    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: localeId)) else {
        let supported = await SpeechTranscriber.supportedLocales.map { $0.identifier(.bcp47) }
        fail("locale not supported: \(localeId). supported locales: \(supported)")
    }

    let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)

    // 言語モデルが未インストールなら自動ダウンロード（初回のみ・要ネットワーク）。
    let installed = await Set(SpeechTranscriber.installedLocales.map { $0.identifier(.bcp47) })
    if !installed.contains(locale.identifier(.bcp47)) {
        stderr("downloading speech model for \(locale.identifier(.bcp47))...")
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
    }

    let analyzer = SpeechAnalyzer(modules: [transcriber])

    // 結果ストリームは start より先に購読しておく。
    let collector = Task { () -> String in
        var text = ""
        for try await result in transcriber.results where result.isFinal {
            text += String(result.text.characters)
        }
        return text
    }

    // ファイル入力。finishAfterFile:true でファイル末尾到達後に自動的に finalize/finish される。
    // （stream 入力は macOS 26.x で nilError 報告があるため、堅牢なファイル入力 API を使用）
    let audioFile = try AVAudioFile(forReading: url)
    try await analyzer.start(inputAudioFile: audioFile, finishAfterFile: true)

    return try await collector.value
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fail("usage: obails-transcribe <audioPath> [locale]")
}
let audioPath = args[1]
let localeId = args.count >= 3 ? args[2] : "ja-JP"

guard #available(macOS 26.0, *) else {
    fail("obails-transcribe requires macOS 26.0 or later")
}

let semaphore = DispatchSemaphore(value: 0)
Task {
    do {
        let text = try await transcribe(audioPath: audioPath, localeId: localeId)
        let output = Output(text: text, locale: localeId)
        let data = try JSONEncoder().encode(output)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
        semaphore.signal()
    } catch {
        fail("transcription failed: \(error)")
    }
}
semaphore.wait()
