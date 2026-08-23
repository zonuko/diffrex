# 差分概念ナレッジ: Hunk と Unified Diff

本ドキュメントは、`Diffrex` の差分処理や AI 静的解析の基盤となっている **「Hunk（差分ブロック）」** および **「Unified Diff（統一差分形式）」**、ならびに **「Myers Diff アルゴリズム」** の関係と設計上の役割をまとめた技術解説です。

---

## 1. Hunk（ハンク / 差分ブロック）とは

### 1.1 定義と概要
**Hunk（ハンク）** とは、ファイルの差分比較において**「連続するひとかたまりの変更ブロック（変更箇所のかたまり）」**を指す専門用語です（英語の本来の意味は「大きな塊・厚切り」）。

ファイル全体の中で 1 行目、50 行目、120 行目の 3 箇所に離れて変更がある場合、差分は **3 つの独立した Hunk** として分割・管理されます。

```
[ファイル全体]
  Line 1:  変更なし
  Line 2:  - 変更前   ┐
  Line 3:  + 変更後   ┘ ===> 【 Hunk 1 】
  Line 4:  変更なし
  Line 5:  変更なし
  Line 6:  + 新規行   ┐ ===> 【 Hunk 2 】
  Line 7:  変更なし
```

---

### 1.2 どこまでを一連の Hunk と判定するか（境界決定ロジック）

`Diffrex` バックエンド（[src/core/diff.ts](file:///c:/Users/fuji3/develop/01.gitlab/deno-sandbox/Diffrex/src/core/diff.ts)）では、以下のロジックで Hunk の境界を決定しています。

1. **行単位の操作判定**:
   Myers Diff アルゴリズムにより、各行が以下の 3 つのいずれかに分類されます。
   - `delete`: 左側（Base）から削除された行
   - `insert`: 右側（Target）に追加された行
   - `equal`: 左右で完全に一致している行
2. **連続する変更の集約**:
   - `delete` または `insert` が連続して出現している間は、同じ Hunk の内部として蓄積します。
   - **`equal`（一致行）が現れた瞬間に Hunk を確定（区切り）** します。

```text
行1: const a = 1;        (equal)  -> Hunk 対象外
行2: const b = 20;       (delete) ┐
行3: const c = 30;       (delete) │ 変更が連続しているため
行2: const b = 99;       (insert) │ 1 つの Hunk（行2〜3）にまとめる
行3: const c = 99;       (insert) ┘
行4: console.log(a);     (equal)  -> ここで Hunk 確定（クローズ）
行5: return a + b;       (equal)  -> 一致が続く
行6: // 新規ログ          (insert) ┐ 再び変更発生 -> 別の Hunk（行6）
行7: export default a;   (equal)  -> ここで Hunk 確定
```

---

### 1.3 Git と GUI Diff（Diffrex / CodeMirror）における Hunk の違い

| 項目 | Git / Unified Diff の Hunk | Diffrex / CodeMirror の Hunk (Chunk) |
| :--- | :--- | :--- |
| **コンテキスト行** | 変更の前後に **既定3行の一致行** を含める | **純粋な変更行のみ** を Hunk 範囲とする |
| **近接差分の統合** | 2〜3行しか離れていない変更は 1 つの `@@` ブロックに結合される | 変更行のまとまり単位で独立して管理 |
| **主目的** | パッチ適用（`patch` コマンド）や人間の一括閲覧 | **ピンポイントな操作**（キーボード移動、個別マージ、承認/拒否） |

---

## 2. Myers Diff と Unified Diff の違い

初心者が混同しやすい概念ですが、**役割のレイヤー（階層）が根本的に異なります**。

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 差分計算レイヤー (Algorithm): Myers Diff                 │
│    「テキストAからBへの最短の編集手順 (SES) を計算する」    │
└──────────────────────────────┬──────────────────────────────┘
                               │ (計算結果: 削除/挿入/一致のリスト)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. 表現・表示レイヤー (Format / UI):                        │
│    ├─ A. Unified Diff (CUI形式)                             │
│    │     - @@ -1,3 +1,3 @@ 形式のプレーンテキスト出力       │
│    └─ B. GUI Split View (Diffrex / CodeMirror 6)             │
│          - 左右2ペインのグラフィカルなエディタ表示          │
└─────────────────────────────────────────────────────────────┘
```

### 比較表

| 項目 | **Myers Diff（マイヤーズ・ディフ）** | **Unified Diff（ユニファイド・ディフ）** |
| :--- | :--- | :--- |
| **分類** | **アルゴリズム（計算ロジック）** | **データ形式・フォーマット（出力表現）** |
| **役割** | テキスト間の最短編集距離・手順を高速に**計算する** | 計算された差分を人間・プログラム向けに**整形・書き出す** |
| **提唱者** | Eugene W. Myers（1986年の論文） | Wayne Davison（1990年、GNU diff 向け） |
| **実例** | `git diff` や `Diffrex` の内部エンジン | `git diff` の出力テキスト、`.patch` ファイル |

---

### 2.1 Unified Diff のフォーマット構造解説

Unified Diff は、以下のような明確な書式仕様を持っています。

```diff
--- a/src/calc.ts       <-- 変更前ファイル名 (---)
+++ b/src/calc.ts       <-- 変更後ファイル名 (+++)
@@ -10,6 +10,6 @@ export function calcTotal(items: number[]) {  <-- Hunk ヘッダ
   for (const item of items) {
     total += item;
   }
-  return total * 1.08;  <-- 削除された行 (-)
+  return total * 1.10;  <-- 追加された行 (+)
 }
```

- **Hunk ヘッダ（`@@ -開始行,行数 +開始行,行数 @@`）**:
  - `-10,6`: 変更前（Left）ファイルの 10 行目から 6 行分を表示
  - `+10,6`: 変更後（Right）ファイルの 10 行目から 6 行分を表示
  - ヘッダ後ろの `export function...`: 直近の関数名などの見出し（コンテキスト情報）

---

## 3. Diffrex における Hunk の設計と活用

`Diffrex` では、Hunk がすべての UI 操作と AI レビュー機能の基本単位になっています。

### 3.1 データモデル: `HunkAnnotation`
[src/core/types.ts](file:///c:/Users/fuji3/develop/01.gitlab/deno-sandbox/Diffrex/src/core/types.ts) で定義される Hunk のメタデータ構造です。

```ts
export interface HunkAnnotation {
  id: string;                  // 例: "hunk-1"
  lineStartLeft: number;       // Base 側の開始行 (1-based)
  lineEndLeft: number;         // Base 側の終了行
  lineStartRight: number;      // Target 側の開始行
  lineEndRight: number;        // Target 側の終了行
  isNoise: boolean;            // 空白・インデント・コメントのみの差分か
  riskLevel: RiskLevel;        // "danger" | "warning" | "normal"
  status: HunkStatus;          // "unreviewed" | "accepted" | "rejected" | "edited"
  summaryTag?: string;         // 例: "[Risk] 12 lines deleted", "[Format] Indentation"
}
```

### 3.2 Hunk 単位で行われる主要機能

1. **キーボードナビゲーション（Phase 2）**:
   - `Alt+Down` / `J`: 次の Hunk へジャンプ
   - `Alt+Up` / `K`: 前の Hunk へジャンプ
2. **ブロックマージ（Phase 2）**:
   - `Ctrl+R`（Base → Target）/ `Ctrl+L`（Target → Base）:
     選択中の Hunk 単位でコードを双方向に同期・適用。
3. **AI フレンドリー静的解析（Phase 4-A）**:
   - **ノイズ自動判定**: インデントやコメントのみの変更 Hunk を `isNoise: true` として検出。
   - **リスク判定**: 10 行超の削除や関数シグネチャ変更を含む Hunk を `riskLevel: "danger"` と分類。
4. **クイックレビューアクション（Phase 4-C）**:
   - `A`: 選択中 Hunk を `accepted` にして次へ移動。
   - `R`: 選択中 Hunk の変更を破棄して Base の状態へ戻し `rejected` に設定。
   - `E`: 選択中 Hunk の編集モードへ移行。

---

## 4. 関連ドキュメント・ソースコード

- **仕様書**: [docs/AI-FriendlyDiffToolSpecification.md](file:///c:/Users/fuji3/develop/01.gitlab/deno-sandbox/Diffrex/docs/AI-FriendlyDiffToolSpecification.md)
- **CodeMirror 6 & Myers Diff 解説**: [docs/CodeMirror6MergeViewAndDiffAlgorithm.md](file:///c:/Users/fuji3/develop/01.gitlab/deno-sandbox/Diffrex/docs/CodeMirror6MergeViewAndDiffAlgorithm.md)
- **Hunk 抽出実装**: [src/core/diff.ts](file:///c:/Users/fuji3/develop/01.gitlab/deno-sandbox/Diffrex/src/core/diff.ts)
- **ノイズ・リスク解析実装**: [src/core/analysis/](file:///c:/Users/fuji3/develop/01.gitlab/deno-sandbox/Diffrex/src/core/analysis/)
