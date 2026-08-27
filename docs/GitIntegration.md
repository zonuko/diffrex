# Git 連携設定ガイド (`git difftool` / `git mergetool`)

`Diffrex` を Git の外部差分ツール（`difftool`）およびマージツール（`mergetool`）として設定する方法を説明します。

---

## 1. `.gitconfig` の設定スニペット

グローバル設定（`~/.gitconfig`）またはリポジトリ個別設定（`.git/config`）に以下を追加します。

### 1-A. スタンドアロンバイナリ / PATH 上の `Diffrex` を使う場合

```ini
[diff]
    tool = Diffrex

[difftool]
    prompt = false

[difftool "Diffrex"]
    # $LOCAL: 比較元 (Base), $REMOTE: 比較先 (Target)
    cmd = Diffrex \"$LOCAL\" \"$REMOTE\" --wait

[merge]
    tool = Diffrex

[mergetool]
    prompt = false
    keepBackup = false

[mergetool "Diffrex"]
    # $LOCAL: 自ブランチ, $BASE: 共通祖先, $REMOTE: 相手ブランチ, $MERGED: 出力先
    cmd = Diffrex \"$LOCAL\" \"$BASE\" \"$REMOTE\" -o \"$MERGED\" --wait
    trustExitCode = true
```

### 1-B. Deno ソース（`deno run` / `deno desktop`）から直接起動する場合

```ini
[difftool "Diffrex"]
    cmd = deno run -A /path/to/Diffrex/main.ts \"$LOCAL\" \"$REMOTE\" --wait

[mergetool "Diffrex"]
    cmd = deno run -A /path/to/Diffrex/main.ts \"$LOCAL\" \"$BASE\" \"$REMOTE\" -o \"$MERGED\" --wait
    trustExitCode = true
```

---

## 2. 使い方

### `git difftool` での差分比較
```bash
# 作業ツリーの変更を Diffrex で比較
git difftool

# 特定コミット間の差分を Diffrex で比較
git difftool HEAD~1 HEAD

# 特定ファイルの差分を Diffrex で比較
git difftool path/to/file.ts
```

### `git mergetool` でのコンフリクト解消
```bash
# コンフリクト発生時に Diffrex を起動
git mergetool
```
1. 左右の差分を確認し、`Ctrl+R`（Base → Target）やエディタ内編集でコンフリクトを解消します。
2. `Ctrl+Enter` を押すと、マージ結果が `$MERGED` に保存され、ウィンドウが閉じて exit code 0 で Git に完了を伝えます。
3. `trustExitCode = true` により、保存せず終了（exit code 1）した場合は Git に中断として扱われます。

---

## 3. 重要: `diff.external` ではなく `diff.tool` を使用する（ベストプラクティス）

> [!WARNING]
> Git の設定で **`diff.external = Diffrex` を設定しないでください**。必ず **`diff.tool = Diffrex`**（`git difftool`）を使用してください。

### なぜ `diff.external` に GUI ツールを設定してはいけないのか？
- `git diff` は、標準出力（stdout）にテキスト差分を出力することを前提とした非対話コマンドです。
- コーディングエージェント（Claude Code, Cursor, Aider, Antigravity 等）や CI/CD スクリプト、IDE 拡張機能は、バックグラウンドで `git diff` を実行して差分を解析します。
- もし `diff.external` に GUI アプリケーションを設定してしまうと、エージェントやスクリプトが `git diff` を呼んだ瞬間に GUI ウィンドウが起動してブロック（プロセスが永久ハング）し、自動化パイプラインが停止してしまいます。

### Diffrex のエージェント互換セーフガード機構 (B-9)
Diffrex には、誤って `diff.external` や非対話スクリプトから呼び出された場合でもハングしないための**セーフガード機能**が組み込まれています。

1. **Git External Diff (7引数) 自動検知**:
   Git から `diff.external` 形式（7引数: `<path> <old-file> <old-hex> <old-mode> <new-file> <new-hex> <new-mode>`）で呼び出された場合、GUI を起動せず、即座に標準出力へ Unified Diff を出力して終了（exit code 0）します。
2. **非対話・非TTY環境の自動フォールバック**:
   パイプ（`|`）やリダイレクト、CI 環境等で `--wait` なしで起動された場合、GUI を起動せず標準出力へ Unified Diff を出力します。
3. **明示的なヘッドレス / stdout オプション**:
   GUI を起動せずターミナルに差分を出力したい場合は、`--headless` または `-s` / `--stdout` を指定します。
   ```bash
   Diffrex fileA.ts fileB.ts --stdout
   Diffrex fileA.ts fileB.ts -s -U 5
   ```

---

## 4. 終了コード仕様

| 終了コード | 状態 | 説明 |
| :--- | :--- | :--- |
| **`0`** | 正常完了 | `Ctrl+Enter` または `Ctrl+S` 後に終了、またはヘッドレス diff の出力完了。 |
| **`1`** | 中断 / 破棄 | 保存せずにウィンドウを閉じた場合。Git はマージ未完了として扱います。 |
| **`2`** | 引数エラー | CLI オプションや位置引数が不正な場合。 |
| **`3`** | I/O エラー | ファイルの読み書き失敗やバイナリ判定によるエラー。 |

