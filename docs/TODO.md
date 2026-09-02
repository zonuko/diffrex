# Diffrex 実装 TODO

`docs/AI-FriendlyDiffToolSpecification.md`（仕様書 / ロードマップ）と
`docs/Diffrexv1.0+RoadmapAndDesignGuidelines.md`（v1.0+ 設計ガイドライン）を元に、
実作業単位まで分解した TODO リスト。

## 進め方のルール

- **フェーズは順番に進める。** 各フェーズの AC（受入条件）を満たすまで次フェーズに進まない。
- タスク ID（`P1-01` 等）はコミットメッセージや PR タイトルに付ける（例: `P1-02: CLI フラグパース実装`）。
- チェックボックスは完了時に `[x]` に更新する。
- 各フェーズ完了時に `deno task check`（fmt/lint/test）が全て green であることを確認する。
- `deno fmt` は日本語の Markdown を強制的に折り返すため、`docs/` は fmt 対象から除外する（`deno.json` の `fmt.exclude`）。

## 現状（Phase 3 完了）

- CLI 引数パース、ファイル I/O、改行/BOM保持、バイナリ判定、セッション生成、WebSocket 通信を実装（Phase 1）。
- Preact (TSX) + esbuild によるフロントエンド配信・ビルド基盤を整備（Phase 1.1 / 1.2）。
- CodeMirror 6（`@codemirror/merge`）による 2 ペイン Diff 表示、シンタックスハイライト、行番号、スクロール同期を実装（Phase 2）。
- キーボードナビゲーション（`Alt+Down`/`J`, `Alt+Up`/`K`）、フォーカス中 hunk のハイライト、ブロックマージ（`Ctrl+R`, `Ctrl+L`）、編集モード切替（`E`/`Enter`, `Escape`）、Undo/Redo 連携を実装。
- 原初GUI MVCパターン（Smalltalk-80 スタイル）に基づき、ピュアTypeScriptによるObserver基盤（`Observable<T>`）、`DiffSessionModel`（Active Domain Model）、`DiffController`、およびView層（`App`, `Header`, `DiffView`, `StatusBar`）への完全分離・リファクタリングを実施（Phase 2.1）。
- 保存先解決（`outputPath` → `files.right.path`）、同一ディレクトリ一時ファイル + `Deno.rename` による原子的書き込み、改行/BOM/末尾改行の保持、`--read-only` 拒否ガード、`Ctrl+S` / `Ctrl+Enter` による保存・終了、未保存変更（Dirty）検知と確認ダイアログ、プロセス終了コード（0/1/2/3）および `git difftool` / `git mergetool` 連携ドキュメントを整備（Phase 3）。
- `deno task check`（fmt / lint / check / test）が全 79 テストで green。

## 目標ディレクトリ構成（Phase 1〜4 で段階的に作る）

```
Diffrex/
├── deno.json
├── main.ts                  # CLI エントリポイント（Phase 1 で全面書き換え）
├── src/
│   ├── cli/
│   │   ├── args.ts          # CLI 引数パース（@std/cli）
│   │   └── usage.ts         # --help / --version 出力
│   ├── core/
│   │   ├── types.ts         # DiffSessionData / FileTarget / HunkAnnotation
│   │   ├── session.ts       # DiffSessionData 組み立て
│   │   ├── file_io.ts       # ファイル読込 / stdin / 書き戻し（原子的書き込み）
│   │   ├── diff.ts          # 行単位 diff → hunk 抽出
│   │   └── analysis/
│   │       ├── noise.ts     # isNoise 判定
│   │       └── risk.ts      # riskLevel 判定
│   ├── desktop/
│   │   ├── window.ts        # Deno Desktop ウィンドウ起動
│   │   └── ipc.ts           # backend ⇄ WebView メッセージ定義・送受信
│   └── ui/
│       ├── index.html
│       ├── main.tsx         # フロントエントリ
│       ├── model/           # Model層: 状態保持 & Observer変更通知（ピュアTS / 外部ライブラリなし）
│       │   ├── observable.ts
│       │   └── diff_session_model.ts
│       ├── controller/      # Controller層: ユーザー入力解釈 & Model操作
│       │   ├── diff_controller.ts
│       │   └── keymap.ts
│       ├── components/      # View層: Model購読・描画 & Controllerへの入力委譲
│       │   ├── App.tsx      # メインレイアウトビュー
│       │   ├── Header.tsx   # AI メタデータヘッダ
│       │   ├── DiffView.tsx # @codemirror/merge ラッパ
│       │   └── StatusBar.tsx# ステータスバー
│       ├── utils/
│       │   └── language.ts  # 言語モード判定
│       ├── styles.css
│       ├── build.ts         # esbuild バンドルスクリプト
│       └── bundle.js        # 事前バンドルアセット
└── tests/
    ├── fixtures/            # 比較用サンプルファイル群
    └── *_test.ts
```

---

## Phase 0: 足場整備（雛形の撤去とタスク定義）

**Goal:** テンプレートコードを取り除き、以降のフェーズで使う開発コマンドと型定義を用意する。

- [x] **P0-01** `main.ts` の `Deno.serve` 雛形と `main_test.ts` を撤去し、CLI スタブ & Desktop UI 雛形に置き換える。
- [x] **P0-02** `deno.json` にタスクを定義する。
  - `dev`: `deno run -A main.ts`
  - `dev:desktop`: `deno desktop --hmr main.ts`
  - `test`: `deno test -A`
  - `check`: `deno fmt --check && deno lint && deno check main.ts src/core/types.ts && deno test -A`
  - `fmt.exclude` に `.junie/`, `docs/`, `tests/fixtures/`, `dist/` を追加
  - `compile`: 単一バイナリ生成（`deno desktop -o dist/Diffrex main.ts`）
- [x] **P0-03** `imports` に依存を追加: `@std/cli`, `@std/path`, `@std/fs`, `@std/assert`（`@codemirror/*` は Q-03 決定後の Phase 2 へ保留）。
- [x] **P0-04** `src/core/types.ts` を作成し、仕様書 5章の `DiffSessionData` / `FileTarget` / `HunkAnnotation` をそのまま定義する。
- [x] **P0-05** `tests/fixtures/` に検証用サンプルを用意し、`.gitattributes` で改行正規化を無効化。
  - `sample_base.ts` / `sample_target.ts`（ロジック変更 + 空白のみ変更 + コメントのみ変更 + 12行削除を含む）
  - 改行コード違い（LF / CRLF）、末尾改行なし、日本語（UTF-8 マルチバイト）、BOM 付き UTF-8、バイナリサンプルを含むケース
- [x] **P0-06** 使用する Deno バージョン（v2.9+）と Deno Desktop のサブコマンド仕様・調査結果を `README.md` および Q-01 に記録する。

**AC:** `deno task check` が green。`src/core/types.ts` が `deno check` を通り、フェーズ1以降が参照できる状態。

---

## Phase 1: CLI エントリポイント & Deno Desktop 起動

**Goal:** CLI 引数を解釈し、ファイルを読み込み、Deno Desktop の WebView に `DiffSessionData` を渡す。

### 1-A. CLI 引数

- [x] **P1-01** `src/cli/args.ts` に `@std/cli` の `parseArgs` を用いたパーサを実装。
  - 位置引数: 2個 → `2way`（left=base, right=target）、3個 → `3way`（local / base / remote）
  - string フラグ: `--prompt`, `--agent`, `--model`, `-o/--output`
  - boolean フラグ: `-w/--wait`, `--read-only`, `--ignore-space`, `--ignore-comments`, `-h/--help`, `-v/--version`
  - 未知のフラグはエラーにして usage を表示（exit code 2）
- [x] **P1-02** `src/cli/usage.ts` に `--help` / `--version` の出力を実装（仕様書4章の表と同じ内容）。
- [x] **P1-03** 引数バリデーションとエラーハンドリング。
  - 位置引数が 0/1 個 → usage 表示 + 非0終了
  - ファイル不存在 / ディレクトリ指定 / 読み取り権限なし → 明示的なメッセージで非0終了
  - `3way` で `-o` 未指定時の既定出力先を決定（`<local>` を上書き）し、仕様書との差異をドキュメント化

### 1-B. 入力読み込み

- [x] **P1-04** `src/core/file_io.ts` に `readFileTarget(path)` を実装（UTF-8 読込、`readOnly` 判定は `--read-only` と実ファイル属性の OR）。
- [x] **P1-05** stdin パイプ入力（`Diffrex -` / `git diff | Diffrex -`）に対応。`Deno.stdin.isTerminal()` で判定し、stdin 側は常に read-only 扱い。
- [x] **P1-06** 改行コード（LF/CRLF）を検出して保持し、書き戻し時に元の形式を復元できるようにする。
- [x] **P1-07** バイナリ判定（NUL バイト検出）で、バイナリファイルは「比較不可」として明示的に拒否。

### 1-C. セッション生成 & ウィンドウ起動

- [x] **P1-08** `src/core/session.ts` に `buildSession(args): DiffSessionData` を実装（`sessionId` は `crypto.randomUUID()`、`timestamp` は ISO8601）。
- [x] **P1-09** `src/desktop/window.ts` で `Deno.BrowserWindow` / `Deno.serve` を用いてウィンドウと UI エンドポイントを管理する。ウィンドウタイトルは `Diffrex - <left名> ⇄ <right名>`。
- [x] **P1-10** `src/desktop/ipc.ts` に backend ⇄ UI の通信インターフェース（in-process bindings / Deno.serve エンドポイント）およびメッセージ型を定義する。
  - backend → UI: `session:init`, `save:result`
  - UI → backend: `ui:ready`, `save:request`, `exit:request`, `log`
  - `ui:ready` を受けてから `session:init` を送る（初期化競合の防止）
- [x] **P1-11** Phase 1 の暫定 UI として、受け取った `DiffSessionData` を整形 JSON で表示する `src/ui/index.html` を作る。
- [x] **P1-12** ウィンドウ1個 = CLI プロセス1個の 1:1 ライフサイクルを実装（ウィンドウクローズ → プロセス終了）。
- [x] **P1-13** テスト: `tests/args_test.ts`（フラグ・位置引数・異常系）、`tests/file_io_test.ts`（LF/CRLF・末尾改行・stdin）。

**AC:**
`deno run -A --unstable-desktop main.ts tests/fixtures/sample_base.ts tests/fixtures/sample_target.ts --prompt "test"`
でデスクトップウィンドウが開き、両ファイルの内容と prompt が JSON として表示される。
`--help` / 引数不正時に適切な usage と exit code が返る。

---

## Phase 1.1: UI 構築基盤の JSX (TSX) 化

**Goal:** フロントエンド UI 構築基盤に JSX (TSX) を導入し、Phase 1 の暫定 UI を TSX コンポーネント構成へ移行する。

- [x] **P1.1-01** JSX/TSX 変換・配信環境の整備（`deno.json` の compilerOptions/JSX 設定、およびビルド/配信パイプライン）。
- [x] **P1.1-02** `src/ui/App.tsx` / `src/ui/main.tsx` を作成し、Phase 1 の `DiffSessionData` 整形表示 UI を TSX コンポーネント化する。
- [x] **P1.1-03** JSX (TSX) コンポーネントの基本スタイルとレイアウトの土台（CSS / デザイントークン）を整備する。
- [x] **P1.1-04** `deno task dev`, `deno task dev:desktop`, `deno task check`, `deno task compile` で TSX UI が正常にビルド・表示・動作することを確認する。

**AC:** Deno Desktop 起動時に TSX で構築された UI が描画され、`DiffSessionData` が表示される。`deno task check` が green。

---

## Phase 1.2: 起動しない部分の修正

- [x] **P1.2-01** window.tsの `// TODO: ここがあるとウインドウが表示されなくなるので原因探す` コメントの解消
- [x] **P1.2-02** `deno task dev:desktop -- tests/fixtures/sample_base.ts tests/fixtures/sample_target.ts --prompt "テスト"` で起動したときに以下のようなエラーになってアセットがロードできないのを解消する
  - `NotFound: path not found (entry missing): C:\Users\hoge\AppData\Local\Temp\deno-compile-laufey_webview.exe\src\ui\index.html: readfile 'C:\Users\hoge\AppData\Local\Temp\deno-compile-laufey_webview.exe\src\ui\index.html'`
  - 解決策: `import ... with { type: "text" }` で静的アセット（`index.html`, `styles.css`, `bundle.js`）をコンパイルバンドルに直接含め、ランタイムでの未検出エラーを解消。`BrowserWindow` の初期化処理を有効化。

---

## Phase 2: CodeMirror 6 Diff ビュー & キーボードナビゲーション

**Goal:** 左右2ペインの diff 表示と WinMerge 相当のキーボード操作。

- [x] **P2-01** フロントエンドのビルド方法を決定・実装（esbuild + `@luca/esbuild-deno-loader` による事前バンドル `bundle.js` を採用。オフラインおよび単一バイナリでの完全動作を保証）。
- [x] **P2-02** `src/ui/components/DiffView.tsx` で `@codemirror/merge` の `MergeView` を初期化し、`files.left.content` / `files.right.content` を表示する。
- [x] **P2-03** 左右スクロール同期、行番号表示、折り返し設定。
- [x] **P2-04** 拡張子から言語モードを判定してシンタックスハイライトを適用（最低: ts/js/json/md/py。未対応拡張子はプレーン）。`src/ui/utils/language.ts` に実装。
- [x] **P2-05** `right.readOnly === true`（または `--read-only`）のとき右エディタを編集不可にする。
- [x] **P2-06** `--ignore-space` 起動時に空白差分を無視した比較で表示する。
- [x] **P2-07** `src/ui/keymap.ts` にキーバインドを実装。
  - `Alt+Down` / `J`: 次の hunk へ
  - `Alt+Up` / `K`: 前の hunk へ
  - `J`/`K` は「エディタにフォーカスがない（ナビゲーションモード）」時のみ有効にし、テキスト入力と衝突させない
- [x] **P2-08** フォーカス中 hunk のハイライト表示（StateEffect/StateField による mark decoration）と、画面外なら自動スクロール（`scrollIntoView`）。
- [x] **P2-09** ブロックマージを実装。
  - `Ctrl+R` / `Alt+Right`: Base → Target（左→右）
  - `Ctrl+L` / `Alt+Left`: Target → Base（右→左）
  - 実行後もフォーカス hunk 位置を保つ（インデックスずれ対策）
- [x] **P2-10** Undo / Redo（`Ctrl+Z` / `Ctrl+Y`）がマージ操作に対しても効くことを確認（CodeMirror の standard history 連携）。
- [x] **P2-11** `src/ui/components/StatusBar.tsx` に「現在 hunk / 全 hunk 数」「アクティブなキーバインド一覧」を表示。
- [x] **P2-12** 大きめのファイル（5,000行以上）で初期表示 / ナビゲーションが実用速度か計測し、結果を記録（5,075行で 125 chunks の算出が 84.57ms で完了。`tests/diff_perf_test.ts`）。

**AC:** キーボードのみで hunk 間を移動でき、`Ctrl+R` / `Ctrl+L` でブロック単位のマージが左右双方向に行える。スクロールが同期している。

---

## Phase 2.1: 原初GUI MVCパターンによるフロントエンド/UIリファクタリング

**Goal:** 原初のGUI MVCパターン（Smalltalk-80 スタイル）に基づき、UI・状態・操作ロジックを Model / View / Controller に明確に分離・リファクタリングする。外部のMVC/状態管理ライブラリは一切使用せず、ピュアなTypeScriptによるObserver（Subject/Observer）パターンで実装する。

### 設計方針（原初GUI MVCとWeb MVCの違い）

- **Model (Active Domain State & Subject):**
  - アプリケーションの状態（`DiffSessionData`、hunk一覧、選択中インデックス、ナビゲーション/編集モード、保存状態等）とドメインロジックを保持。
  - 状態変更時に登録された Observer（View 等）へ通知を発行する（Subject / Observable）。
  - UIフレームワーク（Preact/CodeMirror）の具体的な実装には依存しない。
- **View (Visual Components & Observers):**
  - Model の変更通知を購読し、通知に応じて自己の描画を更新する（`App`, `Header`, `DiffView`, `StatusBar`）。
  - ユーザー入力（キー操作、ボタンクリック、エディタフォーカス等）を捕捉し、直接Modelを変更せずControllerへ委譲する。
- **Controller (User Input Translator & Command Dispatcher):**
  - ユーザーの入力・イベントを受け取り、それを解釈して適切な Model のメソッド呼び出しへ変換する。
  - 例: `Alt+Down`/`J` → `model.selectNextHunk()`、`Ctrl+R` → `model.mergeHunk('leftToRight')`、`Ctrl+S` → `controller.requestSave()`。
- **追加ライブラリ不使用:**
  - Redux, Zustand, MobX, RxJS などの外部ライブラリは一切使用せず、TypeScript標準機能のみでピュアに実装する。

### タスク一覧

- [x] **P2.1-01** `src/ui/model/observable.ts` にピュアTypeScriptによる型安全なObserverパターン（`Observable<T>` / `Subject` / `EventEmitter`）基盤を実装（外部ライブラリ不使用）。
- [x] **P2.1-02** `src/ui/model/diff_session_model.ts` に `DiffSessionModel` を実装。
  - セッションデータ、Hunkリスト、フォーカス中Hunkインデックス、ナビゲーション/編集モード、保存状態等をカプセル化。
  - 状態変更メソッド（`selectNextHunk()`, `selectPrevHunk()`, `setNavigationMode()`, `updateRightContent()`, `setSaveStatus()` 等）とObserver通知を実装。
- [x] **P2.1-03** `src/ui/controller/diff_controller.ts` および `src/ui/controller/keymap.ts` に Controller層を実装。
  - キーボードショートカット・UIアクションを解釈し、Modelの操作メソッドを呼び出す。
  - IPC通信（`save:request`, `exit:request`, `ui:ready` 等）の送受信ハンドリングをControllerで統括。
- [x] **P2.1-04** View層（`src/ui/components/App.tsx`, `Header.tsx`, `StatusBar.tsx`, `DiffView.tsx`）をリファクタリング。
  - 各コンポーネントが Model の Observer として変更通知を購読し、自己描画を更新。
  - ユーザー操作イベント（キー押下、ボタンクリック等）を Controller のメソッド呼び出しへ委譲。
- [x] **P2.1-05** CodeMirror 6 `MergeView` と MVC の統合整理。
  - CodeMirror のドキュメント変更トランザクションと Model の同期。
  - フォーカスHunkのハイライト（mark decoration）やスクロール同期が Model の状態と連動するように整理。
- [x] **P2.1-06** テストの実装（`tests/ui_model_test.ts`, `tests/ui_controller_test.ts` 等）。
  - Modelの状態遷移とObserver変更通知のテスト。
  - Controllerの入力解釈・コマンドディスパッチ・Model呼び出しのテスト。
- [x] **P2.1-07** `src/ui/bundle.js` の再ビルドと `deno task check`（fmt / lint / check / test）の実行・パス確認。既存機能（Diff表示、キーナビゲーション、ブロックマージ）の動作確認。

**AC:** フロントエンドが Model / View / Controller に明確に分離され、外部ライブラリなしでObserverパターンによる連携が動作している。既存のすべてのキーバインドおよびDiff表示・マージ機能にデグレがなく、`deno task check` が green。

---

## Phase 3: ファイル書き戻し & プロセスライフサイクル

**Goal:** 編集結果をディスクに保存し、CLI プロセスを正しく終了させる。

- [x] **P3-01** `Ctrl+S` で右エディタの内容を `save:request` として backend に送る。
- [x] **P3-02** backend で保存先を決定して書き込む（優先順: `outputPath` → `files.right.path`）。
- [x] **P3-03** 原子的書き込み（同一ディレクトリに一時ファイル → `Deno.rename`）で、書き込み失敗時に元ファイルを壊さない。
- [x] **P3-04** 元ファイルの改行コード / 末尾改行 / BOM 有無を保持して書き戻す。
- [x] **P3-05** `--read-only` 時は保存を拒否し、ステータスバーに理由を表示する。
- [x] **P3-06** 保存結果（成功 / 失敗 + メッセージ）を `save:result` で UI に返し、ステータスバーに表示する。
- [x] **P3-07** `Ctrl+Enter` で「保存 → ウィンドウクローズ → exit code 0」を実行。
- [x] **P3-08** 未保存の変更がある状態でウィンドウを閉じた場合の確認ダイアログを実装。破棄時の exit code を定義（保存せず終了 = 1）。
- [x] **P3-09** `-w/--wait` の挙動を実装（ウィンドウが閉じるまで CLI プロセスを保持）。`--wait` 無指定時の挙動も明文化する。
- [x] **P3-10** 終了コードを整理して usage に記載（0: 正常/保存済み、1: 未解決・破棄、2: 引数エラー、3: I/O エラー）。
- [x] **P3-11** `git difftool` / `git mergetool` 設定例を `docs/` に追記（`.gitconfig` スニペット）。
- [x] **P3-12** テスト: `tests/save_test.ts`（保存先解決、原子的書き込み、改行保持、read-only 拒否）。

**AC:** UI での編集が `Ctrl+S` / `Ctrl+Enter` で右側ファイルに永続化され、`--wait` 指定時に CLI プロセスが正しい exit code で終了する。`git difftool` から起動できる。

---

## Phase 4: AI フレンドリー静的解析 & UI デコレーション

**Goal:** ノイズ hunk の自動折りたたみ、リスク警告、AI メタデータヘッダ、A/R/E クイックアクション。

### 4-A. Hunk 抽出と解析（backend）

- [x] **P4-01** `src/core/diff.ts` に行単位 diff → `HunkAnnotation`（左右の開始 / 終了行）抽出を実装。UI 側の hunk 境界と一致することを確認する。
- [x] **P4-02** `src/core/analysis/noise.ts` に `isNoise` 判定を実装。
  - 空白正規化（`line.trim().replace(/\s+/g, " ")`）で左右が一致 → noise
  - 行コメント / ブロックコメント（`//`, `/* */`, `#`）のみの増減 → noise
  - 文字列リテラル内の `//` や `#` を誤検出しないこと
- [x] **P4-03** `src/core/analysis/risk.ts` に `riskLevel` 判定を実装。
  - `danger`: 連続10行超の削除、関数 / メソッドシグネチャ・class / interface・export された型の変更や削除
  - `warning`: `try/catch` や `if (err)` 等のエラーハンドリング削除、ハードコードされたトークン / シークレットの追加（正規表現ベース）
  - `normal`: それ以外
- [x] **P4-04** `summaryTag` を生成（例: `[Format] Indentation`, `[Risk] 15 lines deleted`）。
- [x] **P4-05** 全 hunk の `status` を `unreviewed` で初期化し、`DiffSessionData.hunks` に載せて UI へ送る。
- [x] **P4-06** テスト: `tests/noise_test.ts` / `tests/risk_test.ts`。fixture の「空白のみ」「コメントのみ」「12行削除」「シグネチャ変更」が期待通りに分類されること。

### 4-B. UI デコレーション

- [x] **P4-07** `src/ui/components/Header.tsx` にヘッダパネルを実装（prompt 表示、agent / model バッジ、`Unreviewed: 2/5` カウンタ、フィルタトグル）。prompt が長い場合は折りたたみ表示。
- [x] **P4-08** `isNoise: true` の hunk を起動時に自動折りたたみし、`[▶ 4 lines of formatting changes folded]` 形式のプレースホルダを表示する。クリックで展開。
- [x] **P4-09** `Ctrl+N` と UI トグルボタンで noise hunk の一括展開 / 折りたたみを切り替える。
- [x] **P4-10** `danger` / `warning` hunk に赤系の左ボーダーと警告バッジ（`⚠️ High Risk: 12 lines deleted`）を表示する。
- [x] **P4-11** ナビゲーション（`Alt+Down` / `J`）が折りたたみ中の noise hunk をスキップする（noise 表示 ON のときは stop する）。

### 4-C. レビューアクション

- [x] **P4-12** `A`（Accept）: hunk を `accepted` にして次の未レビュー hunk へ移動。
- [x] **P4-13** `R`（Reject）: Target 側（右）の変更を破棄して base の内容に戻し、`rejected` にする。
- [x] **P4-14** `E` / `Enter`（Edit）: 該当 hunk 先頭にカーソルを置いてエディタにフォーカス。編集したら `edited` に遷移。
- [x] **P4-15** hunk の `status` に応じたガター表示（✓ / ✗ / ✎）と、ヘッダのカウンタ更新。
- [x] **P4-16** 全 hunk レビュー完了時にステータスバーで通知し、`Ctrl+Enter` での保存終了を促す。

**AC:** 起動時にノイズ hunk（空白 / コメントのみ）が折りたたまれている。危険な削除に赤い警告表示が出る。`A` を押すと該当 hunk が承認され、次の差分へ移動する。

---

## Phase 5: 仕上げ（v0.1 リリース）

- [ ] **P5-01** `deno compile` で Windows / macOS / Linux 向け単一バイナリを生成し、起動を確認。（スキップ）
- [x] **P5-02** README を作成（インストール、CLI 使用例、キーバインド表、git 連携設定、終了コード）。
- [x] **P5-03** 既知の制限事項を明記（ディレクトリ比較・完全な3-Way マージ・画像比較は未対応）。
- [x] **P5-04** エラー時のユーザ向けメッセージを見直し、スタックトレースが素で出ないようにする。

**AC:** README が整備され、CLI エラー時に親切なエラーメッセージと終了コードが表示される。


---

## v1.0+ バックログ（実装完了および今後の推奨順序）

MVP（Phase 0〜5）完了後の拡張機能群。費用対効果・依存関係・ツールの堅牢性を考慮し、未着手タスクは **【優先度 1: 基盤セーフティ】→【優先度 2: Git日常レビュー】→【優先度 3: GUI操作性】→【優先度 4: 発展的連携】** の順序で着手します。

### 【完了済み】実装完了機能

#### B-1. ディレクトリ / 複数ファイル比較

- [x] **B1-01** `src/core/types.ts` にディレクトリ比較用のデータ構造（`FileDiffStatus`, `DirectoryTreeNode`, `DirectoryDiffSessionData`）を定義。
- [x] **B1-02** `src/core/ignore.ts` に `.gitignore` および除外ルール（`.git`, `node_modules`, `dist` 等）のパースとマッチングを実装。
- [x] **B1-03** `src/core/dir_diff.ts` にディレクトリ再帰走査および段階的差分判定（相対パス存在 → サイズ/mtime → SHA-256 ハッシュ、バイナリ判定）を実装。
- [x] **B1-04** `src/cli/args.ts` & `src/cli/validate.ts` に引数なし起動（Welcome モード）とディレクトリ引数（2-Way フォルダ比較）のサポートを追加。
- [x] **B1-05** `src/desktop/ipc.ts` & `src/desktop/window.ts` に遅延ロード用 IPC（`dir:tree_data`, `file:diff_request`, `file:diff_data`, `save:file_request`）とハンドラを実装。
- [x] **B1-06** `src/ui/components/WelcomeView.tsx` に比較対象（ファイル/フォルダ）のパス入力・選択ダイアログ UI を実装。
- [x] **B1-07** `src/ui/model/dir_diff_model.ts` & `src/ui/controller/dir_controller.ts` にディレクトリツリーの MVC モデルとコントローラを実装。
- [x] **B1-08** `src/ui/components/DirectoryTreeView.tsx` に左ペインのツリービュー（開閉・差分ステータスバッジ・フィルタ）を実装。
- [x] **B1-09** `src/ui/App.tsx` & `src/ui/styles.css` に 2ペイン スプリッターレイアウト（左: ツリー、右: 選択中ファイルの CodeMirror Diff View）を統合。
- [x] **B1-10** ファイル単位の編集・マージ・保存連携（`Ctrl+S` / `Ctrl+Enter`）をディレクトリモードに対応。
- [x] **B1-11** テスト: `tests/dir_diff_test.ts`（ディレクトリ走査・段階判定・除外ルール・遅延ロード IPC の検証）。

**AC:** 引数なし起動で Welcome 画面が表示され、フォルダ比較が開始できる。`Diffrex <dirA> <dirB>` で左にツリー、右に Diff が表示され、ファイル選択時に遅延ロードされる。右ペインでの編集が対象ファイルに保存される。

#### B-2. AST セマンティック Diff（Tree-sitter WASM）

- [x] **B2-01** `src/core/analysis/ast/ast_parser.ts` に Tree-sitter（WASM）の導入方式を検証し、対応言語ローダーと優先順位（TS/JS → Python → Rust → Go）を実装。
- [x] **B2-02** `src/core/analysis/ast/move_detector.ts` に Move（ブロック移動）検出ロジックを実装。削除+追加ではなく `[Moved]` アノテーションとしてノイズ折りたたみ対応。
- [x] **B2-03** `src/core/analysis/ast/rename_detector.ts` に Rename（一括リネーム）検出と置換マップ生成、ノイズ判定ルールを実装。
- [x] **B2-04** `src/core/analysis/index.ts` & `src/core/session.ts` に `analyzeDiffAsync` / `buildSessionAsync` を統合し、セッションデータに反映。
- [x] **B2-05** テスト: `tests/ast_diff_test.ts`（TS/Python の AST パース、Move 検出、一括 Rename 検出、フォールバック挙動の検証）。

**AC:** TypeScript / Python 等のソースコードで、関数の配置移動（Move）が `[Moved]` ノイズとして判定され、変数の全体リネーム（Rename）が `[Rename] x -> deltaX` ノイズとして判定される。未対応言語では行ベース diff に安全にフォールバックする。

#### B-4. 完全な 3-Way Merge / Git コンフリクト対応

- [x] **B4-01** 3面 or 4面（Output ペインあり）レイアウトの選定と実装（3ペイン横並び: Local / Merged Result / Remote を採用）。
- [x] **B4-02** コンフリクトマーカー（`<<<<<<< HEAD` / `=======` / `>>>>>>>` および diff3 形式）入りの単一ファイルを自動分解して可視化。
- [x] **B4-03** `git mergetool` としての完全な挙動（終了コード: 解決保存時 0 / 未解決時 1、`$MERGED` 書き戻し）。

**AC:** `Diffrex <local> <base> <remote> [-o output]` および `Diffrex <conflicted_file>` で 3 ペイン（Local / Merged / Remote）のエディタが起動し、競合ナビゲーション（J/K）と解決（1: Local, 2: Remote, 3: Base）および保存（Ctrl+S / Ctrl+Enter）が可能。

#### B-5. リッチメディア / 非テキスト比較

- [x] **B5-01** `src/core/types.ts` & `src/core/media/image_detector.ts` に画像用データ構造（`ImageTarget`, `ImageDiffSessionData`）とフォーマット・マジックナンバー判定・メタデータ抽出を実装。
- [x] **B5-02** `src/core/file_io.ts` & `src/desktop/ipc.ts` で画像ファイルのバイナリ読み込みおよび Base64 Data URL 変換と IPC 配信を実装。
- [x] **B5-03** `src/ui/model/image_diff_model.ts` & `src/ui/controller/image_controller.ts` に画像比較の MVC モデル・コントローラ（ズーム、パン、4モード切替、スライダー位置、トレランス）を実装。
- [x] **B5-04** `src/ui/components/ImageDiffView.tsx` に 2-Up、Swipe（スライダー分割）、Onion Skin（透過）、Difference（Canvas ピクセル差分ハイライト）と同期ズーム＆パンを実装。
- [x] **B5-05** `src/core/structured/json_canonicalizer.ts` & `yaml_canonicalizer.ts` に JSON / YAML のキー順序ソート正規化および擬似差分（ノイズ）判定を実装。
- [x] **B5-06** `src/ui/components/StructuredToolbar.tsx` に Raw Diff / Canonical Diff の切替 UI を実装し、エディタと連動。
- [x] **B5-07** `src/core/structured/csv_parser.ts` に RFC 4180 CSV / TSV パーサーおよび行・セル単位の差分検出ロジックを実装。
- [x] **B5-08** `src/ui/model/csv_diff_model.ts` & `src/ui/components/CsvDiffView.tsx` にテーブルグリッド差分ビュー（追加・削除・変更セルのハイライト）を実装。
- [x] **B5-09** `src/ui/App.tsx` & `src/cli/args.ts` に画像および構造化データの自動モード判定・単独起動・ディレクトリツリー内での動的切り替えを統合。
- [x] **B5-10** テスト: `tests/image_diff_test.ts`, `tests/canonical_diff_test.ts`, `tests/csv_diff_test.ts` を追加し検証。

**AC:** `Diffrex img1.png img2.png` で画像比較画面（2-Up, Swipe, Onion Skin, Pixel Difference）が起動し、同期ズーム/パンができる。JSON/YAML 比較で Canonical モードによりキー順序差分を無視できる。`Diffrex data1.csv data2.csv` でスプレッドシート形式のセル差分グリッドが表示される。ディレクトリ比較の右ペインでも各形式が適切にレンダリングされる。

#### B-6. OS ネイティブ統合

- [x] **B6-01** OS コンテキストメニュー統合（Windows エクスプローラ / macOS Finder の「Diffrex で比較」）。
- [x] **B6-02** ファイル / フォルダのドラッグ＆ドロップ比較。
- [x] **B6-03** 比較履歴管理と自動セッション保存 / 復元。

**AC:** Windows エクスプローラー / macOS Finder / Linux 向けの右クリック統合（`Diffrex --install-context-menu` / `--uninstall-context-menu` / `--generate-context-menu-script`）が動作する。Welcome 画面およびメイン画面へのドラッグ＆ドロップで比較を開始できる。過去の比較履歴（最大50件）が管理され、Welcome 画面からのワンクリック再開および `Diffrex --restore` による直近セッションの自動復元ができる。

---

### 【未対応】推奨順序 1: 基盤セーフティ & 配布パイプライン

#### B-9. 非対話・ヘッドレス / CLI 出力モード & エージェント互換（セーフガード）

- [x] **B9-01** 非TTY（非対話環境・パイプ等）または `--headless` / `--stdout` オプション指定時に、GUI を起動せず標準出力へ Unified Diff を出力・パススルーするモードを検討・実装。
- [x] **B9-02** コーディングエージェント等の自動スクリプトが誤って `diff.external` 等で Diffrex を起動した際に、GUI でプロセスがハング・ブロックするのを防ぐセーフガード（非対話検知フォールバック）を検討。
- [x] **B9-03** Git 設定ドキュメントに「`diff.external` ではなく `diff.tool` (difftool) を使用する」旨のベストプラクティスと注意喚起を追記。

**AC:** 非対話シェル環境で誤って呼び出された場合にプロセスがハングせず安全に終了または diff 出力され、エージェント環境下での安全性が担保される。

#### B-10. CI/CD & 自動リリース・マルチプラットフォーム配布

- [ ] **B10-01** `.github/workflows/ci.yml` を作成し、PR/Push 時に `deno fmt --check`, `deno lint`, `deno check main.ts`, `deno task test` を自動実行する CI パイプラインを構築（Ubuntu / Windows / macOS マトリクス対応）。
- [ ] **B10-02** CI 上で `src/ui/bundle.js` が最新ソースから差分なくビルドできるかを検証するチェックステップを追加。
- [ ] **B10-03** `.github/workflows/release.yml` を作成し、`v*` タグ push 時に Windows (`x86_64`), macOS (`x86_64`, `aarch64`), Linux (`x86_64`) 向け単一バイナリ / パッケージを自動ビルドする matrix ジョブを実装。
- [ ] **B10-04** 各プラットフォームのビルド生成物のアーカイブ化（`.zip` / `.tar.gz`）、SHA-256 チェックサム算出、および `softprops/action-gh-release` を用いた GitHub Releases への自動アップロードを構築。
- [ ] **B10-05** `README.md` に CI ステータスバッジおよび GitHub Releases からの各 OS 向けダウンロード・インストール・実行手順を追記。

**AC:** PR や push 時に全プラットフォームでテストと静的検査が自動実行され、リリースタグ push 時に Windows / macOS / Linux 向けの実行可能バイナリが GitHub Releases ページに自動公開される。

#### B-12. ワンライナーインストールスクリプト & インストーラー / パッケージ配布

- [ ] **B12-01** `scripts/install.sh`（macOS / Linux 向けシェルスクリプト）を作成し、`curl -fsSL https://.../install.sh | sh` で最新 GitHub Release バイナリの自動ダウンロード・解凍・実行権限付与・パス（`~/.local/bin` 等）配置を実装。
- [ ] **B12-02** `scripts/install.ps1`（Windows PowerShell 向けスクリプト）を作成し、`irm https://.../install.ps1 | iex` で最新 GitHub Release バイナリの自動ダウンロード・展開・ユーザ環境変数 PATH（`$env:LOCALAPPDATA\Programs\Diffrex` 等）への追加を実装。
- [ ] **B12-03** `deno install` による Deno ランタイム直接インストールコマンド（`deno install -g -A -n diffrex ...`）のサポートとドキュメント化。
- [ ] **B12-04** （発展/任意）主要パッケージマネージャー（Homebrew Formula, Scoop manifest, winget 等）向けの配布定義ファイルの作成およびリリースタスクとの連携。
- [ ] **B12-05** インストールスクリプトのアンインストール機能（`--uninstall` オプション等）および動作検証テストの追加。
- [ ] **B12-06** `README.md` のインストールセクションを更新し、ワンライナーインストールコマンド（curl / PowerShell）および各プラットフォームでのセットアップ手順を反映。

**AC:** macOS / Linux では `curl -fsSL ... | sh`、Windows では `irm ... | iex` のワンライナーコマンドで Diffrex の最新バイナリがダウンロード・PATH 登録され、ターミナルから `diffrex` コマンドで即座に起動できる。

---

### 【未対応】推奨順序 2: Git日常レビューのコア体験強化

#### B-7. Git Worktree & 単一リポジトリ ワーキングツリー差分統合

- [ ] **B7-01** `src/core/git/worktree.ts` に Git リポジトリおよび Worktree の検出ロジック（`.git` ディレクトリおよび `gitdir:` ファイルのパース、`git worktree list` 一覧取得）を実装。
- [ ] **B7-02** `src/core/git/status.ts` に単一 Git フォルダ（リポジトリ / Worktree）の変更ファイル自動検出（`git status` / `git diff --name-status` 相当）および `git show HEAD:<path>` による Base コンテンツ取得ロジックを実装。
- [ ] **B7-03** `src/cli/args.ts` & `src/cli/validate.ts` に単一 Git フォルダ指定時の起動（`Diffrex <git_repo_or_worktree_path>`）および Worktree 比較引数のサポートを追加。
- [ ] **B7-04** `src/ui/model/dir_diff_model.ts` & `src/ui/components/DirectoryTreeView.tsx` に Git 差分モード（HEAD vs Working Tree）と Git ステータスバッジ（M, A, D, R, ?）の表示を統合。
- [ ] **B7-05** `src/core/git/temp_worktree.ts` にブランチ指定時の一時 Worktree 自動作成・ライフサイクル管理・終了時クリーンアップを実装。
- [ ] **B7-06** `src/ui/components/WelcomeView.tsx` およびメニューに、単一 Git フォルダを開いた際の「未コミット差分を開く」クイックアクションおよび Worktree 選択パネルを実装。
- [ ] **B7-07** テスト: `tests/worktree_test.ts` / `tests/git_status_diff_test.ts`（単一 Git フォルダオープン時の HEAD 差分自動抽出、Worktree 検出、一時 Worktree の生成と破棄、編集保存の検証）。

**AC:** `.git` を含むフォルダを単独で開いた際に、自動的に HEAD との未コミット差分が一覧化され、ファイルを選択して差分確認・編集・保存ができる。複数 Worktree 間の比較や一時 Worktree 比較も正常に動作する。

---

### 【未対応】推奨順序 3: デスクトップ GUI としての利便性向上

#### B-8. アプリケーション メニューバー & コマンド統合

- [ ] **B8-01** `src/ui/model/menu_model.ts` & `src/ui/controller/menu_controller.ts` に Smalltalk-80 MVC に基づくメニュー定義データ構造とコマンドディスパッチャ（モードに応じた有効/無効制御）を実装。
- [ ] **B8-02** `src/ui/components/MenuBar.tsx` & `src/ui/components/MenuItem.tsx` にトップメニューバー（File, Edit, Merge, View, Git, Help）およびサブメニュー UI を実装。キーボード操作（`Alt` キーナビゲーション、ショートカットキー連動）に対応。
- [ ] **B8-03** 各種「開く」ダイアログ連携（ファイル比較、フォルダ比較、単一Gitリポジトリ、3-Way マージ、画像/CSV、Worktree）および「最近開いたセッション」サブメニューからの即時セッション切り替えを実装。
- [ ] **B8-04** `src/ui/components/ShortcutsModal.tsx` & `AboutModal.tsx` にキーボードショートカット一覧およびバージョン情報ダイアログを実装。
- [ ] **B8-05** （任意/発展）`Ctrl+Shift+P` で全メニューコマンドをインクリメンタル検索・実行できる「クイックコマンドパレット」を実装。
- [ ] **B8-06** テスト: `tests/menu_test.ts`（メニューコマンドの実行、モードごとの enable/disable 状態、キーバインド連携のテスト）。

**AC:** 画面最上部にメニューバーが表示され、「ファイルを開く」「フォルダを開く」「単一Gitリポジトリを開く」「最近開いた履歴」「各種マージ・表示操作」がメニューから実行できる。キーボードショートカットやモーダルダイアログが正しく動作する。

#### B-11. マルチタブ UI & 複数セッション並行管理

- [ ] **B11-01** `src/ui/model/tab_model.ts` に `TabItem`（id, title, dirty, sessionType, model）および `TabContainerModel`（タブ一覧、アクティブタブ、Observer 通知）を実装。
- [ ] **B11-02** `src/ui/controller/tab_controller.ts` にタブのオープン、切り替え、クローズ、未保存チェック、並び替えハンドラを実装。
- [ ] **B11-03** `src/ui/components/TabBar.tsx` & `TabItem.tsx` にタブバー UI（アクティブ表示、Dirty `●` バッジ、閉じる `×` ボタン、新規 `+` ボタン）を実装。
- [ ] **B11-04** タブ操作用キーバインド（`Ctrl+W`: タブを閉じる、`Ctrl+Tab` / `Ctrl+PageDown`: 次のタブ、`Ctrl+Shift+Tab` / `Ctrl+PageUp`: 前のタブ、`Ctrl+1`〜`9`: 番号指定切り替え）を `keymap.ts` に統合。
- [ ] **B11-05** ディレクトリ比較ツリー（`DirectoryTreeView`）からのファイル選択時に「同一タブ再利用」または「新規タブで開く（ダブルクリック / 中クリック / 右クリックメニュー）」挙動を実装。
- [ ] **B11-06** 未保存の変更があるタブを閉じる際、およびアプリ終了時のタブ別未保存確認ダイアログ（保存・破棄・キャンセル）を統合。
- [ ] **B11-07** テスト: `tests/tab_model_test.ts` / `tests/tab_controller_test.ts`（タブライフサイクル、アクティブ切り替え、Dirty 管理、クローズ制御のテスト）。

**AC:** ウィンドウ上部にタブバーが表示され、複数のファイル比較・セッションをタブで切り替えて作業できる。未保存状態の管理（Dirty バッジとクローズ時の確認）、キーボードショートカット（`Ctrl+W`, `Ctrl+Tab` 等）によるタブ操作が動作する。

---

### 【未対応】推奨順序 4: 発展的・実験的機能

#### B-3. イン・アプリ AI コパイロット

- [ ] **B3-01** LLM プロバイダ設定画面（OpenAI / Anthropic / Gemini / Ollama）と API キーの安全な保存方式を設計。
- [ ] **B3-02** 差分ブロックを選択して追いプロンプトを投げるチャット UI（Contextual Prompting）。
- [ ] **B3-03** 3-Way Merge の AI 自動コンフリクト解消（Auto-Resolve）をワンキーで実行。

**AC:** 外部LLMプロバイダと連携し、差分に対する質問・修正依頼やコンフリクトの自動解消がアプリ内から実行できる。

---

## 未決定事項（着手前に判断が必要）

- [x] **Q-01** Deno Desktop の API 仕様（ウィンドウ生成・IPC）を実バージョン（v2.9+）で確認する。仕様書の前提と差異があれば本 TODO と仕様書を更新する。
  - **調査結果（Phase 0 / Deno 2.8.1 → 2.9.5 にアップグレードして実測）**
    - `--unstable-desktop` は **2.8.1 / 2.9.5 のどちらにも存在しない**（`deno run --help=unstable` の一覧に無い）。Deno Desktop は **`deno desktop` サブコマンド**で提供される（`deno --help` には非表示だが `deno desktop --help` は動作する）。公式ドキュメント: <https://docs.deno.com/runtime/desktop/> / <https://docs.deno.com/runtime/reference/cli/desktop/>
    - 主なフラグ: `--backend {webview,cef,raw}`（既定 `webview`）、`--hmr`、`-o/--output`（拡張子で `.app` / `.dmg` / `.msi` / `.AppImage` / `.deb` / `.rpm` を決定）、`--icon`、`--target` / `--all-targets`（クロスコンパイル）、`--engine {v8,quickjs}`、および `deno run` 相当の権限フラグ。実行時に「`deno desktop` is experimental and subject to change」の警告が出る。
    - **アプリモデル**: ウィンドウは起動時に自動生成され、`Deno.serve()` のハンドラ（localhost の自動割当ポート / `DENO_SERVE_ADDRESS`）へ navigate する。つまり UI は「HTTP で HTML/JS を返す」形で実装する。
    - **ウィンドウ制御**: `Deno.BrowserWindow`（最初の `new` が起動時ウィンドウを adopt、2つ目以降は新規ウィンドウ）。`title` / `width` / `height` / `resizable` / `frameless` 等のオプション、`resize` / `move` / `focus` / `blur` / `close` イベント、`executeJs()`、`openDevtools()` を持つ。`close` は `preventDefault()` で保留できる → **P3-08**（未保存確認ダイアログ）に使える。全ウィンドウが同一ランタイムを共有し、ウィンドウが全て閉じて非同期タスクが無くなるとプロセスが終了する → **P1-12** の 1:1 ライフサイクルは自然に満たせる。
    - **IPC**: ソケット IPC ではなく **in-process bindings**（`bindings.<name>()`）。仕様書7章および **P1-10** の「独自 IPC メッセージ」は bindings + `Deno.serve` のエンドポイントで再設計する。
    - **設定**: `deno.json` の `desktop` ブロック（`app.name` / `app.identifier` / `app.icons` / `app.deepLinks` / `backend` / `output` / `macos.codesignIdentity` / `release.baseUrl` / `errorReporting.url`）。Phase 0 では `app.name` と `app.identifier` のみ設定した。
    - 素の `deno run` では `Deno.BrowserWindow` は `undefined`（desktop ランタイム限定）。`main.ts` はこれを利用して `"BrowserWindow" in Deno` で desktop 判定し、desktop 時のみ `Deno.serve` を起動している。
    - **スモークテスト（Phase 0 実測）**: `deno desktop -o dist/Diffrex main.ts` が成功（webview backend `laufey v0.6.1` を自動ダウンロードし `dist/Diffrex/Diffrex.exe` + `Diffrex.dll` を生成）。生成物を実行するとプロセスが常駐して `127.0.0.1:<port>` を listen し、ウィンドウが `Deno.serve` のハンドラを表示することを確認した。
- [x] **Q-03** CodeMirror 6 を `npm:` 指定で直接使うか、事前バンドルするか（オフライン起動の可否に影響）。 → **決定:** esbuild + `@luca/esbuild-deno-loader` による事前バンドル（`src/ui/bundle.js`）を採用。オフライン・単一バイナリ起動を完全保証。
- [x] **Q-04** hunk の分割単位を backend（`src/core/diff.ts`）と `@codemirror/merge` のどちらを正とするか。ズレる場合の同期方針。 → **決定:** UI 上のナビゲーション・マージは `@codemirror/merge` の chunks を正とする。Phase 4 で backend 解析情報（`DiffSessionData.hunks`）と行番号レンジでマッピングを行う。
- [x] **Q-05** 3-Way モードの既定出力先（仕様書では `-o` 前提）と `--read-only` との組み合わせ挙動。 → **決定:** 出力先は `-o <path>` が最優先、未指定時は 3 引数の場合は `<local>`、単一コンフリクトファイルの場合はそのファイル自身。`--read-only` 指定時は保存無効化。未解決終了時は exit code 1。


