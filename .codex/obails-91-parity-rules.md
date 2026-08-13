# Obails 91項目パリティ実装チーム規約

## 原依頼と完了条件

- 原依頼: 「監査で確認したObsidian標準機能との差分を全部実装する。`/goal`で最後まで継続し、実装エージェント群と形式検証2エージェントを使う。形式検証は親エージェント自身も行う。」
- 対象: 2026-08-10に報告した91件と、その後の追加監査で独立差分と確認された `.markdown` 索引（P-092）。大分類は編集・ファイル同一性、リンク・検索・ナビゲーション、日常操作・設定・安全性・アクセシビリティ。
- 対象外: text-like編集範囲（P-093）はObsidian標準パリティではなく、2026-08-10のユーザー判断「今回は除外」により実装しない。
- 完了: P-001〜P-092すべてが、仕様行、実装差分、形式モデルまたは対象外理由、Go/Vitest/Playwright契約、実アプリ確認のいずれにも未接続行を残さない。
- 未完了: 実装だけ、形式モデルだけ、モックだけ、テスト未実行、実アプリ未確認、ユーザー承認前。

## 絶対境界

- 既存の未追跡 `REPORT.md` はユーザー所有物。読まない、編集しない、削除しない、追加しない。
- 無関係なdirty差分を変更・整形・削除しない。`git reset`、`git checkout`、ファイル全削除再生成は禁止。
- commit、push、PR、deploy、本番アプリ置換は、親からその操作を明示委任されない限り禁止。
- テストのmock、skip、bypass、backdoorは禁止。実ファイルシステムとローカル実アプリを使う。
- 新規依存は公開後7日を超えた版を固定する。ブラウザをインストールしない。
- 魔法の数値を追加しない。Obsidian公式既定値、既存設定、外部標準から導けなければ親へ仕様判断を返す。
- UIアイコンは既存アイコンライブラリだけを使う。SVG/CSS手描きは禁止。

## 正典と優先順位

1. ユーザーの原依頼と本規約
2. `AGENTS.md`
3. Obsidian公式Helpの現行標準挙動
4. 現行Obailsコードと既存テスト
5. 形式モデル

形式モデルは仕様を発明しない。正典と現行実装の矛盾、未表現次元、反例を示すために使う。

## 実装波と所有境界

### Wave 0: 形式仕様と追跡表

- Quint担当: autosave、ファイル切替、外部変更、外部削除・rename、index世代、タスク参照世代。
- Alloy/Lean/ドリフト担当: title source、link解決、duplicate basename、削除方針、検索演算子、UI capability決定表。
- 成果物は `formal/` と `scripts/dspec/`。current REDとrepaired候補を分離し、証拠を上書きしない。

### Wave 1: データ安全とファイル同一性

- filenameを唯一の表示titleとし、新規ノートにH1を強制しない。既存本文H1は独立した本文として保持する。
- path/content/revisionに束縛した保存、切替flush、外部変更CAS/競合UI、外部削除・rename処理、保存失敗UI。
- GUI削除はSystem Trash既定。Vault Trash・永久削除は設定で明示。File Recovery snapshotと復元。
- 安定したtask identityまたは内容照合でstale `file:line` 更新を拒否する。

### Wave 2: リンク整合性

- WikilinkとMarkdown内部リンク、heading/block、attachments、aliases、unresolved、backlinks/outgoing、unlinked mentionsを同一resolver契約へ統合。
- rename/move時のリンク更新、code領域除外、transclusion、埋込みサイズ、HTML escape。
- index readiness/generationを明示し、GraphとBacklinksが同じsnapshotを使う。

### Wave 3: 検索・Explorer・Graph

- Vault全文検索、公式演算子、regex、sort、context、Quick Switcher。
- path検索、複数選択、folder move/import、予測可能で設定可能なsort、auto-reveal、検索前展開状態復元、UTF-8安全性。
- Graphの識別ラベル、edge dedup、filters、local graph、keyboard/context操作。

### Wave 4: Commands・Settings・Session

- Command Palette、設定可能hotkeys、アプリ内Settings、既存Editor/UI設定の適用。
- tabs、split、workspace、pop-out、session復元、Explorer状態・sidebar幅永続化。
- Workspace UIはbackendが返すsnapshotだけを正典とし、PaneTreeの入れ子方向・weights・all leafのactive tabをそのまま復元する。各paneのeditor、preview、save/history、viewer、link panel、sidebarはpane/runtime/generationに束縛し、共有UIへのpublishだけauthoritative active paneを追加確認する。
- Native pop-outの各child操作は `paneID + popoutID` のexact pairを、tab open/activate/closeと同じ永続化mutex境界内で検証する。事前Validate→別API mutationのTOCTOUは禁止。rejoin/close後のstale childはruntime・state.json・native trackingを一切変更できない。
- Main windowはpop-out中のpaneを重複表示・編集せず、child windowはroute pane以外を表示・操作しない。childで定義されないsplit/close-pane/save-restore-workspace/create-popout操作は露出しない。

### Wave 5: Accessibility・feedback

- ARIA tree/menu/dialog、focus trap/restore、right sidebar keyboard、labels、live status。
- 保存・rename・move・import・copy・watcher・設定失敗/成功を画面で区別し、回復手段を示す。

## 検証契約

- Go変更: `services/*_test.go` の実ファイル結合テスト。
- TypeScriptロジック: `frontend/src/__tests__/lib/` のVitest。
- 2026-08-12のユーザー指示により、検証中にObailsをfrontmostへ切り替えたりユーザーの入力フォーカスを奪う操作は禁止する。AX activation、CGEvent入力、Native E2Eの自動起動は行わない。
- UI受け入れは、Chromium/Viteの非mock静的・操作契約、Goサービスの実一時filesystem結合テスト、CLI結合テスト、Vitest、production build/package検査を相互接続する。各証拠の境界を追跡表へ明記し、単一レイヤーの結果で別レイヤーの動作を主張しない。
- 既存のmock bindingを使うbrowser testは補助証拠に限定し、追跡表を`verified`へ昇格させる根拠にしない。新しいmock、skip、bypass、backdoorは禁止する。
- macOS固有のwindow/popoutについては、前面化やアプリ起動を伴わないStateService/WindowServiceの実filesystem結合テストとpackage内容検査を必須とする。ユーザーが明示的に検証時間を許可しない限り、自動Native操作を完了条件にしない。
- 各Waveで対象RED→GREEN、形式current RED→repaired GREEN、ドリフトchecker RED→GREENを保存する。
- 最終必須: `go test ./... -v`、`go test -tags cli ./cmd/cli/... -v`、services race、`cd frontend && pnpm test`、frontend build、background package検査、形式ゲート、traceability checker。ルート`pnpm test`と開発アプリ起動・実操作は、Obailsの起動や前面化を伴うため、ユーザーが新たに明示許可するまで実行しない。
- 長時間コマンドは `herdr run`。sleep/pollは禁止。
- `.artifacts/` はユーザー未承認のため作らない。画像証拠は `/tmp` に保存する。

## 子エージェント報告

- TODO先頭: 「compaction、再起動、状態不明時は `/Users/kazuph/src/github.com/kazuph/obails/.codex/obails-91-parity-rules.md` を最初に読む」。
- 部長paneはComposerへ直接指示しない。最初にHerdrで`cursor-grok-4.5-high`のGrokリードを起動し、目的・成功基準・境界・停止条件を一度だけ渡す。
- Grokリード自身は実装ファイルを編集せず、実装が必要な時だけ同じHerdr workspace/tabへ`composer-2.5`を起動して指揮する。Fast modeと`-fast`モデルは禁止する。
- ComposerはGrokにだけ報告する。Grokは差分と検証証拠を独立レビューし、不合格ならComposerへ差し戻す。全成功基準を満たした時、または部長判断が不可欠な真のblockerだけを部長paneへHerdrで報告する。
- 各Grok完了報告は、対象91項目の番号または日本語内容、所有ファイル、変更、RED/GREEN、実native証拠、未表現次元、残リスクを具体的に結び付ける。
