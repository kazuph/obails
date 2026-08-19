# Changelog

## 1.0.4 - 2026-08-20

File Explorerの新規・未設定環境で、名前降順を最初から選ぶパッチです。Claude Code plugin `ob` の版は `0.1.2` のままです。

### 修正

- Explorerの既定値を `Name + Descending` に変更する
- 保存済みの並び順は上書きせず、通常ファイルは選択済み方向、音源が過半数のフォルダは昇順という既存規則を維持する

## 1.0.3 - 2026-08-19

File Explorerで選んだ並び順がリロード後に既定の名前昇順へ戻る不具合を直したパッチです。Claude Code plugin `ob` の版は `0.1.2` のままです。

### 修正

- 起動時のExplorer設定を汎用Configの一部から推測せず、既存の `GetFileExplorerConfig` から復元する
- sort fieldとdirectionを独立して正規化し、片方が欠けても有効な降順設定を捨てない
- 既存実装どおり、サブフォルダは昇順、通常ファイルは保存した方向、音源が過半数のフォルダ内ファイルは昇順として階層ごとに判定する
- 設定保存後に新しいConfigServiceで再読込しても降順が維持される実ファイルテストを追加する

## 1.0.2 - 2026-08-14

分割後の空ペイン案内が tab strip と本文に二重表示され、どのペインが active か分からず、空ペインを閉じられない不具合を直したパッチです。Claude Code plugin `ob` の版は `0.1.2` のままです。

### 修正

- 空ペインの「Open a note from Explorer」は本文 empty state に1か所だけ出す。tab strip には静かな `Empty pane` プレースホルダと、その exact pane だけを閉じる × を置く
- 最後の visible pane の × は無効化し、閉じられない理由を title/aria に出す。note tab の ×（tab close）と empty pane の ×（pane close）は aria/title で区別する
- active pane を既存 tab active 表現（accent inset）と `data-active` で明示し、DOM focus / backend ActivePaneID と一致させる
- 上部ツールバーの Close active pane は per-pane exact close と二重になるため削除する。Split pane right / Split pane down の tooltip/aria は維持する

## 1.0.1 - 2026-08-13

起動直後にクラッシュする不具合を直したパッチです。Claude Code plugin `ob` の版は `0.1.2` のままです。

### 修正

- フロントエンドが `WindowService.RefreshWorkspaceMenu` を呼ぶと、Wails binding goroutine（非メインスレッド）から `app.Menu.SetApplicationMenu` → AppKit `setMainMenu` が走り、`NSInternalInconsistencyException`（setting the main menu on a non-main thread）で即終了していた
- Wails v3 alpha.74 既存の `application.InvokeSync` に、起動後の Workspace / Theme メニュー再構築を限定する。起動直後の初回適用は `App.Run` 前にメニューを格納するだけにし、実行時の再構築だけを AppKit メインスレッドへ hop する
- 最後の表示ペインでも「別ウィンドウで開く」が成立する。main 側には元ノートと同じ path/fileType の独立ペインを残し、popout 側は元ペインを保持する。runtime/history は共有しない。予期せぬ失敗は JSON を出さず operation-status の人間向け文言にする
- 分割後の新ペインは Explorer からノートを開ける空 surface。close は visual active と一致する exact pane だけを閉じ、元ノートの snapshot / restore / history は残す。ツールバー 3 アイコンは Split pane right / Split pane down / Close active pane として明示する

## 1.0.0 - 2026-08-13

Obails の最初のメジャー版です。Obsidian 互換ヴォルトを扱う macOS ネイティブ Markdown エディタとして、編集・リンク・検索・ワークスペース・安全性の契約を固定します。以降の細かな修正は `v1.0.x` として扱えます。

Claude Code plugin `ob` の版は `0.1.2` のままです。plugin 関連の差分はありません。GitHub Release の公開は今回の範囲外です。

### 主な機能

- ファイル名を唯一の表示タイトルとし、新規ノートに H1 を挿入しない。既存本文の見出しは本文として残す
- Wikilink と Markdown 内部リンク、見出し・ブロック、添付、alias、未解決リンク、バックリンク、outgoing、unlinked mentions を同一のリンク索引契約で扱う
- ノート・見出し・ブロックの transclusion、画像サイズ、PDF/音声の埋込み
- Vault 全文検索（公式演算子、boolean、regex、property、Unicode 安全な context）と Quick Switcher
- File Explorer の複数選択、フォルダ移動、設定可能な sort、auto-reveal、再帰 import
- Graph（重複ラベルの区別、edge 重複排除、filter、local graph、キーボード操作）
- Command Palette、設定可能な hotkey、アプリ内 Settings、エディタ設定の適用
- タブ、split、名前付き Workspace、pop-out、セッション復元、Explorer 展開とサイドバー幅の永続化
- ARIA tree/menu/dialog、focus trap、操作結果の live status

### 安全性

- 遅延保存は path/content/revision に束縛し、切替時に flush する。外部変更は CAS で上書きせず、失敗は Retry/Reload/Close で回復できる
- GUI 削除の既定は System Trash。Vault Trash と永久削除は設定で明示する。System Trash が使えない場合は永久削除へフォールバックしない
- 最近削除した項目の復元と、File Recovery snapshot による単一ファイル復元
- タスク更新は stale な `file:line` 参照を拒否する
- rename/move 時にヴォルト内リンクと添付参照を更新する。code 領域は対象外

### 検証範囲

この版の受け入れは、Obails / Chrome / Accessibility / CGEvent / WKWebView を起動・前面化・操作しない background 検証に限定しています。

- Go サービス結合テスト（実一時ファイルシステム）
- CLI 結合テスト
- services race テスト
- frontend Vitest（純粋ロジックと非 mock 静的 UI 契約）
- frontend production build
- `wails3 task darwin:package` の成果物検査（codesign 検証とバイナリ文字列。アプリ起動なし）
- 形式仕様ゲート（Lean / Alloy / Quint current RED と repaired GREEN、ドリフト検査）
- P-001〜P-092 の追跡表検査。P-093（text-like 編集）は 2026-08-10 の判断により除外

ルートの `pnpm test`（Playwright が `wails3 dev` を起動する）と Native E2E は、この版の完了条件に含めていません。Native 用の仕様とヘルパーはリポジトリに残しますが、環境変数なしでは実行できません。

### 既知の未検証事項

- 実 Obails ウィンドウでの操作、Native pop-out 実窓、AX / CGEvent 入力、WKWebView へのキーボード入力
- Apple Developer 証明書による署名・公証。配布バイナリは未署名で、初回は右クリックから開く必要がある
- Canvas と Excalidraw
- JSON / YAML / CSV / CSS / JavaScript など Markdown 以外の text-like 編集（P-093）
- Windows / Linux / iOS 向けパッケージの実行確認。版文字列は揃えてあるが、出荷対象は macOS である
