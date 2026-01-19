# E2Eリグレッションテスト＆スクリーンショット撮影計画

## 概要
全機能を網羅するE2Eテストを作成し、スクリーンショット/動画を撮影してREADME.mdを更新する。長期メンテナンスに耐えるリグレッションテストとして設計する。

## ファイル構造

```
e2e/
├── fixtures/
│   └── test-vault/              # スタブVault（テスト用）
│       ├── Welcome.md           # 見出し、テキスト
│       ├── Features.md          # wiki-link、コードブロック
│       ├── Mermaid Demo.md      # Mermaid図
│       ├── Code Examples.md     # シンタックスハイライト
│       ├── dailynotes/
│       │   └── 2025-01-19.md    # デイリーノート
│       ├── images/
│       │   └── sample.png       # テスト用画像
│       └── docs/
│           └── sample.pdf       # テスト用PDF
├── app.spec.ts                  # 既存の基本テスト
├── visual-regression.spec.ts    # 新規: スクリーンショット撮影テスト
└── helpers/
    └── vault-setup.ts           # Vault設定ヘルパー

docs/
└── screenshots/
    ├── main-light.png           # メイン画面（ライトテーマ）
    ├── main-dark.png            # メイン画面（ダークテーマ）
    ├── mermaid-diagram.png      # Mermaid図表示
    ├── graph-view.png           # グラフビュー
    ├── timeline-panel.png       # タイムラインパネル
    ├── outline-panel.png        # アウトラインパネル
    ├── code-highlight.png       # コードハイライト
    ├── pdf-viewer.png           # PDFビューア
    └── image-viewer.png         # 画像ビューア
```

## 実装フェーズ

### Phase 1: テスト用Vaultの作成
- [ ] `e2e/fixtures/test-vault/` ディレクトリ作成
- [ ] 各種Markdownファイル作成
  - Welcome.md（H1-H4見出し、基本テキスト）
  - Features.md（[[wiki-link]]、コードブロック、リスト）
  - Mermaid Demo.md（フローチャート、シーケンス図）
  - Code Examples.md（複数言語のコードブロック）
- [ ] dailynotes/2025-01-19.md（タイムライン付き）
- [ ] images/sample.png（テスト用画像）
- [ ] docs/sample.pdf（テスト用PDF）

### Phase 2: Playwright設定更新
- [ ] `playwright.config.ts` を更新
  - スクリーンショット設定（always撮影）
  - ビデオ設定（on）
  - viewport固定（1440x900）
- [ ] テスト用Vault環境変数の設定方法確立

### Phase 3: E2Eテスト作成（visual-regression.spec.ts）
長期メンテナンスのため、以下の設計原則に従う：
- **1テスト1機能**: 各テストは単一の機能のみを検証
- **明確な命名**: `feature-state-action.png` 形式
- **安定したセレクタ**: ID/data属性を優先
- **適切な待機**: networkidle + 明示的な要素待機

テストケース：
- [ ] 01-app-initial-load: 初期画面
- [ ] 02-theme-light: GitHub Lightテーマ
- [ ] 03-theme-dark: Draculaテーマ
- [ ] 04-file-tree-navigation: ファイルツリー操作
- [ ] 05-markdown-preview: Markdownプレビュー
- [ ] 06-wiki-link-render: Wiki-link表示
- [ ] 07-code-highlight: コードハイライト
- [ ] 08-mermaid-diagram: Mermaid図表示
- [ ] 09-mermaid-fullscreen: Mermaid全画面
- [ ] 10-outline-panel: アウトラインパネル
- [ ] 11-graph-view: グラフビュー
- [ ] 12-timeline-panel: タイムラインパネル
- [ ] 13-daily-note: デイリーノート
- [ ] 14-image-viewer: 画像ビューア
- [ ] 15-pdf-viewer: PDFビューア
- [ ] 16-backlinks-panel: バックリンクパネル

### Phase 4: スクリーンショット整理
- [ ] `docs/screenshots/` にベストショットを配置
- [ ] ファイル名を統一（kebab-case）

### Phase 5: README.md更新
- [ ] Screenshotsセクションを拡充
- [ ] 複数テーマのスクリーンショットを追加
- [ ] 機能ごとのスクリーンショットを追加

## テスト設計原則（長期メンテナンス用）

### 安定性のための設計
```typescript
// Good: 明確なセレクタと適切な待機
await page.waitForSelector('#file-tree .file-item');
await page.click('[data-path="Welcome.md"]');
await page.waitForSelector('#editor:has-text("Welcome")');

// Bad: 曖昧なセレクタやハードコードされた待機
await page.waitForTimeout(1000);
await page.click('.file-item');
```

### スクリーンショット命名規則
```
{番号}-{機能}-{状態}.png
例: 01-theme-github-light.png, 08-mermaid-fullscreen.png
```

### テストの独立性
- 各テストは前のテストに依存しない
- 必要な状態は各テスト内で設定
- 共通セットアップは`beforeEach`で実行

## テスト用Vault設定方法

### 方法A: 環境変数（推奨）
```typescript
// e2e/helpers/vault-setup.ts
export async function setupTestVault() {
  // テスト用Vaultのパスを設定
  const testVaultPath = path.join(__dirname, '../fixtures/test-vault');
  // LocalStorageまたはWails経由で設定
}
```

### 方法B: LocalStorageモック
```typescript
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // テスト用の設定をLocalStorageに設定
  });
});
```

## 検証方法
1. `pnpm test` - 全テスト通過確認
2. `docs/screenshots/` にスクリーンショット生成確認
3. README.md表示確認

## 対象ファイル
- `/e2e/fixtures/test-vault/` - 新規作成（テスト用Vault）
- `/e2e/visual-regression.spec.ts` - 新規作成
- `/playwright.config.ts` - 更新
- `/docs/screenshots/` - 新規作成（スクリーンショット）
- `/README.md` - 更新

## 見積もり
- Phase 1: テスト用Vault作成
- Phase 2: Playwright設定
- Phase 3: E2Eテスト作成（16テストケース）
- Phase 4: スクリーンショット整理
- Phase 5: README.md更新
