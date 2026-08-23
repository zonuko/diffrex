# AGENTS.md

## プロジェクト概要

`Diffrex` は、AI 生成コードのレビューを支援する Deno Desktop
製の差分・マージツールです。プロンプトやモデル情報を表示し、ノイズ差分を折りたたみ、危険な変更を警告します。

現状は `main.ts` と `main_test.ts` が Deno の雛形で、実装は未着手です。実装は
`docs/TODO.md` の Phase 0〜5 を順番に進め、各 Phase
の受入条件を満たすまで次へ進まないでください。

## 主要ドキュメント

- `docs/AI-FriendlyDiffToolSpecification.md`: MVP
  の仕様、データモデル、CLI、UI、キーバインド
- `docs/Diffrexv1.0+RoadmapAndDesignGuidelines.md`: v1.0+ の設計課題と推奨順序
- `docs/CodeMirror6MergeViewAndDiffAlgorithm.md`: CodeMirror 6 MergeView
  アーキテクチャ & Myers Diff アルゴリズム解説
- `docs/DiffHunkAndUnifiedDiffKnowledge.md`: Hunk（差分ブロック）と Unified Diff
  の仕様・境界判定・Myers Diff ナレッジ
- `docs/OriginalGuiMvcPatternArchitecture.md`: 原初GUI MVCパターン（Smalltalk-80
  スタイル）アーキテクチャ解説
- `docs/UiArchitectureAndTechnicalDetails.md`: UI アーキテクチャ &
  実装技術仕様ナレッジ
- `docs/ThreeWayMergeAndConflictResolution.md`: 3-Way Merge & Git
  コンフリクト解消 技術ナレッジ
- `docs/RichMediaAndStructuredDiffKnowledge.md`: リッチメディア &
  構造化データ（JSON / YAML / CSV）比較 技術ナレッジ
- `docs/TreeSitterAstSemanticDiffKnowledge.md`: Tree-sitter & AST セマンティック
  Diff（GLR・Move / Rename 検知）技術ナレッジ
- `docs/TODO.md`: 実装タスク、タスク ID、受入条件、未決定事項

仕様と TODO
に差異がある場合は、実装前に確認し、必要な変更をドキュメントへ反映します。Deno
Desktop API、UI 方式、CodeMirror のバンドル方法、hunk 境界、3-Way
の出力先は、実バージョンと仕様を確認してから決定します。

## 技術方針と構成

- Deno v2.9 以降 + TypeScript
- Deno Desktop（`deno desktop` サブコマンドを使用）
- CLI 引数解析は `@std/cli`
- Diff UI は CodeMirror 6（主に `@codemirror/merge`）
- UI 構築には JSX (TSX) コンポーネントを使用（Phase 1.1 で導入）
- UI 設計は原初GUI MVCパターン（Smalltalk-80
  スタイル、追加ライブラリ不使用、Phase 2.1 でリファクタリング）を採用
- MVP は単一ファイルの 2-Way Diff を優先し、保存、AI 向け解析、v1.0+
  機能へ段階的に進む

想定構成は `main.ts`、`src/cli`（引数と
usage）、`src/core`（型・I/O・diff・解析）、`src/desktop`（ウィンドウ・IPC）、`src/ui`（`model/`・`controller/`・`components/`・CodeMirror・スタイル）、`tests`（テストと
fixture）です。

バックエンドの流れは、CLI 引数解析 → ファイル/stdin 読み込み → diff と
noise/risk 解析 → WebView 起動 → `DiffSessionData` 送信です。UI は表示・hunk
操作・保存要求を担当し、保存と終了処理はバックエンドが担当します。

## 開発コマンド

現在は `deno task dev` のみ定義されています。Phase 0 で次のタスクを整備します。

```powershell
deno task dev
deno task test
deno task check
deno task compile
```

`check` は `deno fmt --check`、`deno lint`、`deno check main.ts`、`deno test -A`
を含めます。日本語 Markdown の折り返しを避けるため、`deno.json` の `fmt.exclude`
に `docs/` を含めます。未定義のタスクを実行したことにしないでください。

## 実装ルール

1. TODO のフェーズとタスク ID（例: `P1-02`）を守り、コミットメッセージや PR
   タイトルにも ID を付けます。
2. 既存コードの書式、命名、コメント方針に合わせ、変更は最小限にします。
3. 新しい動作には、正常系、異常系、境界条件のテストを追加します。バグ修正では修正前に再現テストが失敗することを確認します。
4. UTF-8、LF/CRLF、末尾改行、BOM を保持します。NUL
   バイトを含むバイナリは比較対象として拒否します。
5. 書き戻しは同一ディレクトリ内の一時ファイルと `Deno.rename`
   による原子的書き込みとし、失敗時に元ファイルを壊さないようにします。
6. 既定の保存先は右側の target、`--output` 指定時はそのパスです。`--read-only`
   と stdin 入力は保存不可です。
7. IPC は型付きメッセージを使い、UI の `ui:ready` 後に `session:init`
   を送信します。ウィンドウと CLI プロセスは 1:1 で管理します。
8. 各 Phase 完了時に `deno task check` が green であることを確認し、TODO
   と設計記録を更新します。

## CLI とキーバインド

- 2-Way: `Diffrex <base> <target> [options]`
- 3-Way: `Diffrex <local> <base> <remote> -o <output> [options]`
- stdin: `git diff | Diffrex -`
- オプション:
  `--prompt`、`--agent`、`--model`、`-w/--wait`、`-o/--output`、`--read-only`、`--ignore-space`
- hunk 移動: `Alt+Down` / `J`、`Alt+Up` / `K`
- マージ: `Ctrl+R`（左→右）、`Ctrl+L`（右→左）
- レビュー: `A`（承認）、`R`（拒否）、`E` / `Enter`（編集）
- 保存・終了: `Ctrl+S`、`Ctrl+Enter`

`J`/`K`
はエディタ入力中と衝突させず、ナビゲーションモードでのみ有効にします。テストを削除・無効化・弱体化したり、skip
フラグで問題を隠したりしてはいけません。

## スコープ管理

ディレクトリ比較、Tree-sitter による AST diff、アプリ内 AI、完全な 3-Way
Merge、画像比較、OS 統合は MVP 完了後の v1.0+
バックログです。推奨順序（ディレクトリ比較 → Ollama/Anthropic 連携 →
Tree-sitter）に従って設計します。
