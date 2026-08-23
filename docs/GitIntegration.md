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

## 3. 終了コード仕様

| 終了コード | 状態 | 説明 |
| :--- | :--- | :--- |
| **`0`** | 正常完了 | `Ctrl+Enter` または `Ctrl+S` 後に終了。Git はマージ成功と判定します。 |
| **`1`** | 中断 / 破棄 | 保存せずにウィンドウを閉じた場合。Git はマージ未完了として扱います。 |
| **`2`** | 引数エラー | CLI オプションや位置引数が不正な場合。 |
| **`3`** | I/O エラー | ファイルの読み書き失敗やバイナリ判定によるエラー。 |
