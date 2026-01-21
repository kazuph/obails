# Obails Project Instructions

## Implementation Policy (MANDATORY - NO EXCEPTIONS)

### Testing Requirements
このリポジトリでは、以下のテストポリシーを**厳守**する。実装だけでは完了ではない。

| レイヤー | テスト種別 | 場所 | 実行コマンド |
|---------|----------|------|------------|
| バックエンド (Go) | 結合テスト | `services/*_test.go` | `go test ./... -v` |
| フロントエンド (TypeScript) | 単体テスト | `frontend/src/__tests__/` | `cd frontend && pnpm test` |
| フロントエンド (UI) | E2Eテスト | `e2e/*.spec.ts` | `pnpm test` |

### Test Structure Details

#### 1. バックエンド結合テスト (Go)
- **場所**: `services/` ディレクトリ内に `*_test.go` ファイル
- **実行**: `go test ./... -v`
- **パターン**: 一時ディレクトリを使用した実際のファイルシステム操作
- **既存例**: `file_service_test.go`, `link_service_test.go`, `graph_service_test.go`, `note_service_test.go`

```go
// 例: services/xxx_service_test.go
func TestXxxService_SomeMethod(t *testing.T) {
    cs, tmpDir := newTestConfigService(t)  // 一時ディレクトリ作成
    defer os.RemoveAll(tmpDir)

    xs := NewXxxService(cs)

    t.Run("test case name", func(t *testing.T) {
        // テスト実装
    })
}
```

#### 2. フロントエンド単体テスト (Vitest)
- **場所**: `frontend/src/__tests__/lib/` ディレクトリ
- **実行**: `cd frontend && pnpm test`
- **パターン**: 純粋関数のユニットテスト
- **既存例**: `utils.test.ts`, `markdown.test.ts`, `theme.test.ts`

```typescript
// 例: frontend/src/__tests__/lib/xxx.test.ts
import { describe, it, expect } from "vitest";
import { someFunction } from "../../lib/xxx";

describe("someFunction", () => {
  it("should do something", () => {
    expect(someFunction("input")).toBe("expected");
  });
});
```

#### 3. E2Eテスト (Playwright)
- **場所**: `e2e/` ディレクトリ
- **実行**: `pnpm test` (ルートディレクトリで)
- **設定**: `playwright.config.ts` (baseURL: `http://localhost:9245`)
- **ポイント**: `wails3 dev` が自動起動される
- **既存例**: `e2e/app.spec.ts`, `e2e/visual-regression.spec.ts`

```typescript
// 例: e2e/xxx.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // アクション
    await page.click('#some-button');

    // アサーション
    await expect(page.locator('#result')).toBeVisible();
  });
});
```

### Workflow: 自己完結型の実装サイクル

**ユーザーに確認作業を依頼することは禁止。以下のサイクルを必ず完遂してから報告する。**

```
1. 実装する
2. テストを書く
   - Goコード変更 → services/*_test.go に結合テスト追加
   - TS/ロジック変更 → frontend/src/__tests__/ に単体テスト追加
   - UI変更 → e2e/*.spec.ts にE2Eテスト追加
3. テストを全て実行する
   - go test ./... -v
   - cd frontend && pnpm test
   - pnpm test (E2E)
4. アプリを起動して自分の目で動作確認する（webapp-testing skill使用）
5. 問題があれば1に戻る
6. 全て通ったら、エビデンス（スクショ/動画）を収集する
7. ユーザーに完了報告する
```

### Prohibited Behaviors
- ❌ 「確認お願いします」「動作確認してください」と言ってユーザーに作業を投げる
- ❌ テストを書かずに「実装完了」と報告する
- ❌ テストが通っていない状態で完了報告する
- ❌ アプリを実際に起動せずに「動くはず」と報告する
- ❌ 「テストは後で書きます」と言う（テストなしの実装は未完了）

### Verification Checklist (報告前に必ず確認)
- [ ] 変更に対応するテストを追加/更新したか？（Go/Vitest/Playwright）
- [ ] `go test ./... -v` が全てPASSするか？
- [ ] `cd frontend && pnpm test` が全てPASSするか？
- [ ] `pnpm test` (E2E) が全てPASSするか？
- [ ] アプリを起動して実際に操作したか？
- [ ] スクリーンショットまたは動画を撮ったか？

**上記が全てYesでない限り、完了報告は禁止。**

## Post-Task Requirements

### After completing any work, always restart the app
- Kill existing processes: `pkill -f "obails"; lsof -ti:9245 | xargs kill -9`
- Launch: `open bin/obails.dev.app` (if built) or `wails3 dev`

## Application Update Procedure (MANDATORY)

**ユーザーが「アプリを更新して」と言ったら、以下の手順を一発で実行すること。試行錯誤は禁止。**

### アプリの場所
| 用途 | パス | 起動方法 |
|------|------|----------|
| 開発用 | `bin/obails.dev.app` | `wails3 dev` で自動生成、直接起動も可 |
| 本番用（Spotlight検索対象） | `/Applications/obails.app` | Spotlight or Finder |

### 本番アプリ更新手順（一発実行）
```bash
# 1. 実行中のアプリを終了
pkill -f "obails.app" 2>/dev/null || true
sleep 1

# 2. 本番ビルド
wails3 task darwin:package

# 3. 古いアプリを削除して新しいアプリをコピー
trash /Applications/obails.app 2>/dev/null || true
cp -R bin/obails.app /Applications/
codesign --force --deep --sign - /Applications/obails.app

# 4. アイコンキャッシュをクリア（macOSが古いアイコンを表示し続ける問題対策）
sudo rm -rf /Library/Caches/com.apple.iconservices.store 2>/dev/null || true
killall Dock 2>/dev/null || true

# 5. アプリを起動
open /Applications/obails.app
```

### 開発用アプリ更新手順
```bash
pkill -f "obails" 2>/dev/null || true
lsof -ti:9245 | xargs kill -9 2>/dev/null || true
wails3 dev
```

### macOSアイコンキャッシュ問題
macOSはアプリのアイコンをキャッシュするため、`icons.icns`を更新してもDockやFinderで古いアイコン（Wailsデフォルトの「W」など）が表示され続けることがある。

**解決策（上記手順に含まれているが、単独で実行する場合）:**
```bash
sudo rm -rf /Library/Caches/com.apple.iconservices.store
sudo find /private/var/folders/ -name "com.apple.dock.iconcache" -exec rm {} \; 2>/dev/null
sudo find /private/var/folders/ -name "com.apple.iconservices" -exec rm -rf {} \; 2>/dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
killall Dock
killall Finder
```

それでも解決しない場合は、ログアウト→ログインまたはMac再起動が必要。

## Development Commands

### Build & Run
```bash
# Development mode
wails3 dev

# Direct app launch (after build)
open bin/obails.dev.app

# Production build
wails3 build
```

### Testing
```bash
# 1. バックエンド結合テスト (Go)
go test ./... -v

# 2. フロントエンド単体テスト (Vitest)
cd frontend && pnpm test

# 3. E2Eテスト (Playwright) - 全て実行
pnpm test

# E2Eテスト - 特定のdescribeのみ
pnpm test --grep "Graph View"

# E2Eテスト - UIモード
pnpm test:ui

# E2Eテスト - ブラウザ表示あり
pnpm test:headed
```

## Port Configuration
- Frontend dev server: `http://localhost:9245`

## Release & Distribution

### Build for Release
```bash
# Production build (creates bin/obails.app)
wails3 task darwin:package
```

### Create GitHub Release
```bash
# 1. Tag the release
git tag v0.1.0
git push origin v0.1.0

# 2. Build production app
wails3 task darwin:package

# 3. Zip for distribution
cd bin && zip -r obails-macos.zip obails.app && cd ..

# 4. Create GitHub Release with asset
gh release create v0.1.0 bin/obails-macos.zip \
  --title "v0.1.0" \
  --notes "Release notes here"
```

### Note on Code Signing
- Current releases are unsigned (no Apple Developer certificate)
- Users will see "developer cannot be verified" warning
- Workaround: Right-click → Open (or `xattr -cr obails.app`)
- Future: Consider Apple Developer Program ($99/year) for notarization

## Keyboard Shortcuts Maintenance

**ショートカットを追加・変更した場合は、以下の2箇所を必ず更新すること：**

1. **実装**: `frontend/src/main.ts` の `setupEventListeners()` 内
2. **ヘルプUI**: `frontend/index.html` の `#shortcuts-overlay` 内

ショートカットヘルプは `?` キーで表示される。新しいショートカットを追加したら、ユーザーが発見できるようにヘルプにも追記すること。

```html
<!-- frontend/index.html の shortcuts-overlay 内に追加 -->
<div class="shortcut-row">
    <span class="shortcut-keys"><kbd class="mod-key">⌘</kbd> + <kbd>X</kbd></span>
    <span class="shortcut-desc">機能の説明</span>
</div>
```

**注意**: `mod-key` クラスはプラットフォームに応じて `⌘` (macOS) または `Ctrl` (その他) に自動変換される。

## Known Issues
- Port conflicts: Kill vite/obails processes before restarting
- Binding error for missing files: Non-fatal, app continues to work
