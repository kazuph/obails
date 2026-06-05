// 再生時間（秒）を一般的なプレイヤー表示用の文字列に整形する。
// 1時間未満は "M:SS"、1時間以上は "H:MM:SS"。
// NaN/Infinity/負数など不正値は "0:00" にフォールバックする。
export function formatPlaybackTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const ss = String(secs).padStart(2, "0");
    if (hours > 0) {
        const mm = String(minutes).padStart(2, "0");
        return `${hours}:${mm}:${ss}`;
    }
    return `${minutes}:${ss}`;
}
