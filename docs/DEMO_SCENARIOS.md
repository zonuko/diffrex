# Diffrex 動作検証・お試し実行シナリオ一覧

本ドキュメントは、`Diffrex` で実装された各種機能（AI コンテキスト表示、ノイズ判定、リスク警告、言語ハイライト、マージ・保存・終了コード等）を実際に起動して体感・検証できるサンプルコマンドの一覧です。

---

## 1. おすすめメインデモ（AI リファクタリング検証）

AI Agent（Claude 3.7 Sonnet / Cursor）が `UserService` をリファクタリングした想定のフルセット検証用データです。

### 実行コマンド（ワンライナー）

```powershell
# Web / ブラウザ起動
deno task demo:ai

# Deno Desktop (GUIウィンドウ) 起動
deno task demo:desktop:ai
```

手動指定で実行する場合:
```powershell
# Web / ブラウザ起動
deno task dev -- tests/fixtures/ai_refactor_base.ts tests/fixtures/ai_refactor_target.ts --prompt "UserService を非同期化し、ロギングとキャッシュを追加して" --agent "Cursor" --model "claude-3-7-sonnet"

# Deno Desktop 起動
deno task dev:desktop -- tests/fixtures/ai_refactor_base.ts tests/fixtures/ai_refactor_target.ts --prompt "UserService を非同期化し、ロギングとキャッシュを追加して" --agent "Cursor" --model "claude-3-7-sonnet"
```

### 含まれている検証ケース
| 箇所 | 種別 | 判定・挙動 |
| :--- | :--- | :--- |
| `formatUserName` | インデント・空白変更 | `isNoise: true` / `[Format] Whitespace/Indentation` |
| `validateEmail` | コメント文の更新 | `isNoise: true` / `[Format] Comment only` |
| `calculateUserScore` | ロジックの微修正 | `riskLevel: "normal"` / `[Edit] ~1 lines` |
| `parseUserData` | `try/catch` エラー処理削除 | `riskLevel: "warning"` / `[Risk] Error handling removed` |
| `getNotificationClient` | `sk-...` APIキーの直書き混入 | `riskLevel: "warning"` / `[Risk] Potential secret added` |
| `legacyV1AuthFilter` | 15行以上のレガシー認証関数削除 | `riskLevel: "danger"` / `[Risk] 16 lines deleted` |
| `fetchUserProfile` | 関数シグネチャ変更（非同期化・引数追加） | `riskLevel: "danger"` / `[Risk] Signature modified` |

---

## 2. Python コード比較デモ（多言語シンタックス & `#` コメント判定）

Python の構文ハイライトと、`#` 行コメントのノイズ判定、`class` / `def` シグネチャ変更、`except:` 削除の検証です。

### 実行コマンド（ワンライナー）

```powershell
# Web / ブラウザ起動
deno task demo:python

# Deno Desktop (GUIウィンドウ) 起動
deno task demo:desktop:python
```

### 含まれている検証ケース
- Python のシンタックスハイライト
- `connect()` の `#` コメント変更 → `isNoise: true`
- `query()` の `try/except` 削除 → `riskLevel: "warning"`
- `get_secret_token()` の GitHub Token（`ghp_...`）混入 → `riskLevel: "warning"`
- `DatabaseManager.__init__` の引数シグネチャ変更 → `riskLevel: "danger"`

---

## 3. Markdown ドキュメント比較デモ

仕様書やドキュメントの差分レビューです。

### 実行コマンド（ワンライナー）

```powershell
# Web / ブラウザ起動
deno task demo:doc

# Deno Desktop (GUIウィンドウ) 起動
deno task demo:desktop:doc
```

### 含まれている検証ケース
- Markdown の構文ハイライト
- 見出しやリストの追加・削除
- 複数ブロックの diff ナビゲーション（`Alt+↓` / `Alt+↑`）

---

## 4. 大規模ファイル（5,000 行）パフォーマンス検証

5,000 行以上の実規模ファイルでのスクロール同期と描画速度を検証します。

### 実行コマンド（ワンライナー）

```powershell
deno task demo:large
```

---

## 5. 3-Way マージ & Git コンフリクト解消デモ（B-4）

```powershell
# 3ファイル指定の 3-Way Merge
deno task demo:3way
deno task demo:desktop:3way

# 単一コンフリクトファイルの自動パース & 解消
deno task demo:conflict
deno task demo:desktop:conflict
```

---

## 6. ディレクトリ / 複数ファイル比較デモ（B-1）

```powershell
# Web / ブラウザ起動
deno task demo:dir

# Deno Desktop 起動
deno task demo:desktop:dir
```

---

## 7. リッチメディア / 非テキスト比較デモ（B-5）

```powershell
# 画像比較 (2-Up, Swipe, Onion Skin, Difference)
deno task demo:image
deno task demo:desktop:image

# JSON キー順序正規化比較 (Canonical Diff)
deno task demo:json
deno task demo:desktop:json

# CSV / TSV テーブルグリッド差分比較
deno task demo:csv
deno task demo:desktop:csv
```

---

## 8. 基本ショートカット操作ガイド

| 操作 | キー | 動作 |
| :--- | :--- | :--- |
| **次 / 前の Hunk へジャンプ** | `Alt+Down` / `Alt+Up` (または `J` / `K`) | 差分ブロックへ高速移動 |
| **Base → Target へ反映 (マージ)** | `Ctrl+R` または `Alt+Right` | 選択中の Hunk を左から右へ上書き |
| **Target → Base へ反映** | `Ctrl+L` または `Alt+Left` | 選択中の Hunk を右から左へ上書き |
| **元に戻す / やり直す** | `Ctrl+Z` / `Ctrl+Y` | マージや手動編集の Undo / Redo |
| **画像モード切替** | `1` / `2` / `3` / `4` | 2-Up / Swipe / Onion / Diff 切替 |
| **画像ズーム / リセット** | `+` / `-` / `0` | 拡大 / 縮小 / 100%リセット |
| **保存** | `Ctrl+S` | 右側ファイルへ原子的保存 |
| **保存して終了** | `Ctrl+Enter` | 保存後にウィンドウを閉じて exit 0 |

