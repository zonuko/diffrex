# Diffrex

[English](../README.md) | **日本語**

> [!WARNING]
> **Work in Progress (WIP)**: Diffrex は現在アクティブに開発中のプロジェクトです。機能や仕様は順次拡張・改善されています。
> 開発初期の WIP 期間中は、GitHub の **Issues** および **Pull Requests** を一時的に無効化（非表示）にしています。正式リリース（WIP 解除時）に合わせてすべて開放する予定です。

AI 生成コードのレビューを支援する Deno Desktop 製の差分・マージツールです。
プロンプトやモデル情報を表示し、ノイズ差分を折りたたみ、危険な変更を警告します。

---

## 🦖 名前の由来

**Diffrex**（ディフレクス）という名称は、以下の 2 つの言葉を掛け合わせた造語です。

- **Diff**: ファイルやディレクトリの「差分・比較」
- **Rex**: Deno のマスコットキャラクターである恐竜（**T-Rex**）

「**Deno ネイティブで動作し、AI 時代のコードレビュー体験を革新する差分ツールの王者**」を目指して名付けられました。

---

## 🌟 主な特徴

- **AI コンテキスト表示**: プロンプト、エージェント名、LLM モデル名をヘッダに表示。
- **ノイズ差分の自動折りたたみ**: インデント・フォーマットやコメントのみの変更を自動判定して折りたたみ、本質的なロジック変更に集中できます（`Ctrl+N` で展開/折りたたみ）。
- **リスク変更の警告**: 大規模な行削除、関数シグネチャ・型定義の変更、エラーハンドリングの削除などを自動検知して警告バッジを表示します。
- **効率的なレビューアクション**: 各差分（Hunk）に対して `A`（承認）、`R`（拒否）、`E`（編集）のワンキー操作で迅速にトリアージ。
- **フォルダ・ディレクトリ比較**: ディレクトリ全体の差分ツリーと個別ファイル差分をシームレスに一覧・比較。
- **3-Way Merge & コンフリクト解消**: 3-Way ファイル比較と競合マーカーのパース・マージに対応。
- **リッチメディア & 構造化データ比較**: 画像（PNG/JPEG/SVG）の Side-by-side / Swipe 比較、JSON/YAML/CSV の正規化比較。
- **AST セマンティック Diff**: Tree-sitter を用いたコード移動（Move）や変数・関数名リネーム（Rename）の検知。
- **安全な原子的保存**: 同一ディレクトリの一時ファイルと `Deno.rename` を用いた原子的書き込みにより、保存処理のクラッシュ時にも元ファイルを保護。改行コード（LF / CRLF）や BOM を保持します。
- **原初 GUI MVC アーキテクチャ**: 外部 UI フレームワークに依存せず、Smalltalk-80 スタイルの原初 GUI MVC パターンと CodeMirror 6（`@codemirror/merge`）で構築。

---

## 📋 必須要件

- **Deno v2.9.0** 以降

> [!NOTE]
> Deno Desktop 機能は Deno v2.9 以降で `deno desktop` サブコマンドおよび `Deno.BrowserWindow` API として提供されています。

---

## 📦 ビルド & インストール手順

> [!NOTE]
> **事前ビルド済みバイナリ未配布に関する注記**: 現在の初期開発（WIP）期間中は GitHub Releases による事前ビルド済みバイナリの配布を行っていません。そのため、Diffrex を実行・導入するにはリポジトリをクローンして**手元でビルド**するか、**Deno から直接実行**する必要があります。

### 1. リポジトリのクローン

```powershell
git clone https://github.com/zonuko/diffrex.git
cd diffrex
```

### 2. アセットの準備（UI バンドル & Tree-sitter WASM）

```powershell
deno task build:ui
deno task setup:wasms
```

### 3. スタンドアロンバイナリのビルド（コンパイル）

Diffrex を単体実行バイナリとしてビルドします。

```powershell
deno task compile
```

実行すると `dist/diffrex`（Windows では `dist/diffrex.exe`）が生成されます。`dist/` ディレクトリを環境変数 `PATH` に追加するか、パスの通ったディレクトリへバイナリを配置してご利用ください。

### 4. Deno から直接実行する場合（ビルド不要）

バイナリのコンパイルを行わずに、Deno から直接実行することも可能です。

```powershell
# Web / CLI モード
deno task dev path/to/base path/to/target

# デスクトップウィンドウ (Deno Desktop)
deno task dev:desktop -- path/to/base path/to/target
```

---

## 🚀 使い方

### 1. ディレクトリ（フォルダ）比較

2つのフォルダを指定して、フォルダ全体の差分ツリーと個別ファイルの Diff を比較できます。

```powershell
diffrex path/to/base_dir path/to/target_dir
```

### 2. 2-Way ファイル比較

元のファイル（base）と AI 生成/変更後ファイル（target）を指定して起動します。

```powershell
diffrex src/base.ts src/target.ts
```

AI 生成時のコンテキスト情報を渡す場合:

```powershell
diffrex src/base.ts src/target.ts `
  --prompt "リファクタリングとエラーハンドリングの追加" `
  --agent "Claude Code" `
  --model "claude-3-7-sonnet"
```

### 3. 引数なし起動（Welcome 画面）

引数を渡さずに起動すると、UI 上で比較対象のフォルダやファイルを指定できる Welcome 画面が表示されます。

```powershell
diffrex
```

### 4. stdin からの読み込み（読み取り専用）

パイプライン経由で `git diff` などの出力を直接渡せます。

```powershell
git diff | diffrex -
```

### 5. 3-Way Merge

```powershell
diffrex local.ts base.ts remote.ts -o merged.ts
```

### 6. 主な CLI オプション

| オプション | 説明 |
| :--- | :--- |
| `--prompt <text>` | AI 生成時のプロンプト文字列 |
| `--agent <name>` | 使用した AI エージェント名（例: Claude Code, Cursor, Aider） |
| `--model <name>` | 使用した LLM モデル名（例: claude-3-7-sonnet, gpt-4o） |
| `-w`, `--wait` | デスクトップウィンドウが閉じるまで CLI プロセスを待機させる |
| `-o`, `--output <path>` | マージ結果の保存先パス（省略時は右側ターゲットファイル） |
| `--read-only` | 編集および保存を無効化（閲覧専用モード） |
| `--ignore-space` | 起動時に空白の違いを無視する |
| `--ignore-comments` | 起動時にコメントの違いを無視する |
| `-h`, `--help` | ヘルプメッセージを表示 |
| `-v`, `--version` | バージョン情報を表示 |

---

## ⌨️ キーバインド

| 操作 | キー | 説明 |
| :--- | :--- | :--- |
| **次へ移動** | `Alt+Down` / `J` | 次の Hunk（差分ブロック）へ移動 |
| **前へ移動** | `Alt+Up` / `K` | 前の Hunk へ移動 |
| **承認 (Accept)** | `A` | 現在の Hunk を承認し、次へ移動 |
| **拒否 (Reject)** | `R` | 右側の変更を破棄して元の内容に戻し、次へ移動 |
| **編集 (Edit)** | `E` / `Enter` | 現在の Hunk にカーソルを合わせエディタをフォーカス |
| **左→右マージ** | `Ctrl+R` | 左側（Base）のコードを右側（Target）へコピー |
| **右→左マージ** | `Ctrl+L` | 右側（Target）のコードを左側（Base）へコピー |
| **ノイズ表示切替** | `Ctrl+N` | ノイズ Hunk の一括折りたたみ / 展開 |
| **保存** | `Ctrl+S` | 編集結果をファイルに保存 |
| **保存して終了** | `Ctrl+Enter` | 保存後、ウィンドウを閉じて終了コード 0 で完了 |

※ `J`/`K` はナビゲーションモードでのみ動作し、エディタ入力中は通常の文字入力として機能します。

---

## 🔧 Git 連携設定 (`.gitconfig`)

### 1. 開発環境での直接利用（インストール不要）

リポジトリディレクトリ内で直接 Git 差分を流し込んで確認する場合：

```powershell
# ワーキングツリーの差分を Diffrex (Web UI) で確認
git diff | deno task dev -

# デスクトップウィンドウ (Deno Desktop) で確認
git diff | deno task dev:desktop -- -

# ステージング済みの差分を確認
git diff --cached | deno task dev -

# 直前コミットとの差分を確認
git diff HEAD~1 | deno task dev -
```

---

### 2. `git difftool` / `git mergetool` として Git に登録

Git コマンド（`git difftool` や `git mergetool`）から直接呼び出せるように設定します。

#### A. スタンドアロンバイナリをビルドして PATH に通す場合

```powershell
# バイナリをビルド (dist/diffrex が生成されます)
deno task compile

# Git の difftool に登録
git config --global diff.tool diffrex
git config --global difftool.diffrex.cmd 'diffrex "$LOCAL" "$REMOTE" --wait'
git config --global difftool.prompt false

# Git の mergetool に登録
git config --global merge.tool diffrex
git config --global mergetool.diffrex.cmd 'diffrex "$LOCAL" "$BASE" "$REMOTE" -o "$MERGED" --wait'
git config --global mergetool.diffrex.trustExitCode true
```

#### B. 開発中の Deno スクリプトを直接呼び出す場合

```powershell
# 現在のリポジトリの main.ts を指定して登録
git config --global diff.tool diffrex
git config --global difftool.diffrex.cmd 'deno run -A /path/to/diffrex/main.ts "$LOCAL" "$REMOTE" --wait'
git config --global difftool.prompt false
```

#### 使い方

```powershell
# 1. 変更されたファイルを1ファイルずつ比較
git difftool

# 2. 🌟 リポジトリ全体の変更をフォルダ比較（ツリービュー）で一括レビュー
git difftool -d

# 3. 特定ブランチやコミット間の差分を一括比較
git difftool -d main
git difftool -d HEAD~1

# 4. コンフリクト発生時の 3-Way マージ
git mergetool
```

---

## 🔢 終了コード (Exit Codes)

| コード | 意味 |
| :--- | :--- |
| `0` | 正常終了（保存完了、または閲覧モード終了） |
| `1` | 未保存のままウィンドウを閉じた / 破棄して終了 |
| `2` | CLI 引数またはオプションの不正 |
| `3` | I/O エラー（ファイル読み込み・書き込み失敗、バイナリファイル等） |

---

## ⚠️ 既知の制限事項 (Known Limitations)

- **完全な 3-Way コンフリクト自動解消**: 3-Way 入力およびマージビューに対応していますが、高度な自動マージ機能は今後のバージョン（v1.0+）で拡張予定です。
- **バイナリ比較**: テキストおよび対応画像（PNG/JPEG/SVG）専用です。NUL バイトを含む未対応バイナリファイルは安全のため読み込みを拒否します。

---

## 🛠️ お試し用デモコマンド

```powershell
# 1. ディレクトリ比較デモ (Web / CLI)
deno task demo:dir

# 2. ディレクトリ比較デモ (Desktop ランタイム)
deno task demo:desktop:dir

# 3. Welcome / ピッカー画面デモ (Web / CLI)
deno task demo:welcome

# 4. Welcome / ピッカー画面デモ (Desktop ランタイム)
deno task demo:desktop:welcome

# 5. AI メタデータ付き単一ファイル比較デモ
deno task demo:ai

# 6. 静的検証 (フォーマット・リント・型チェック・テスト)
deno task check
```
