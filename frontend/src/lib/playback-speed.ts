// Playback speed options for the mini audio player.
// 等倍速(1) を含む 0.5x〜3x の選択肢。
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

export const DEFAULT_PLAYBACK_SPEED = 1;

const SPEED_STORAGE_KEY = "obails.playbackSpeed";

// 速度を表示用ラベルに整形する。等倍は "1×"、小数は末尾ゼロを落とす。
export function formatSpeedLabel(speed: number): string {
    const rounded = Math.round(speed * 100) / 100;
    const text = Number.isInteger(rounded)
        ? String(rounded)
        : String(rounded).replace(/\.?0+$/, "");
    return `${text}×`;
}

// 与えられた値を有効な選択肢に丸める（最も近い候補を返す）。不正値は等倍へ。
export function normalizeSpeed(value: unknown): number {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        return DEFAULT_PLAYBACK_SPEED;
    }
    let closest: number = PLAYBACK_SPEEDS[0];
    let bestDiff = Infinity;
    for (const candidate of PLAYBACK_SPEEDS) {
        const diff = Math.abs(candidate - num);
        if (diff < bestDiff) {
            bestDiff = diff;
            closest = candidate;
        }
    }
    return closest;
}

// localStorage から前回選択した速度を読む（存在しなければ等倍）。
export function loadStoredSpeed(storage: Pick<Storage, "getItem"> | undefined): number {
    try {
        const raw = storage?.getItem(SPEED_STORAGE_KEY);
        if (raw == null) return DEFAULT_PLAYBACK_SPEED;
        return normalizeSpeed(raw);
    } catch {
        return DEFAULT_PLAYBACK_SPEED;
    }
}

// 選択した速度を保存する。
export function storeSpeed(
    storage: Pick<Storage, "setItem"> | undefined,
    speed: number,
): void {
    try {
        storage?.setItem(SPEED_STORAGE_KEY, String(normalizeSpeed(speed)));
    } catch {
        // ストレージ不可環境では黙って無視
    }
}
