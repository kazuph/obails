// 音源ファイルパスから、隣に置く文字起こし .md の相対パスを求める。
// 例: "55_Podcast/foo.wav" -> "55_Podcast/foo.md"
// バックエンド services/transcribe_service.go の transcriptPath と挙動を一致させる。
export function transcriptPathForAudio(audioPath: string): string {
    const lastDot = audioPath.lastIndexOf(".");
    const lastSlash = audioPath.lastIndexOf("/");
    // 拡張子が無い、または末尾がディレクトリ区切り直後のドットでない場合はそのまま .md を付ける
    if (lastDot <= lastSlash) {
        return audioPath + ".md";
    }
    return audioPath.slice(0, lastDot) + ".md";
}
