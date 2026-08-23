# 3-Way Merge & Git コンフリクト解消 技術ナレッジ

本ドキュメントは、`Diffrex` における 3-Way Merge（3者マージ）の基本原理、2-Way Diff との本質的な違い、Git コンフリクトマーカーの構造、および UI アーキテクチャをまとめた技術ナレッジです。

---

## 1. 3-Way Merge の基本概念

3-Way Merge とは、**「共通の祖先（Base）」を基準にして、枝分かれした 2 つの変更（Local と Remote）を 1 つに統合（マージ）するアルゴリズム** です。

Git のブランチマージ（`git merge`）やリベース、コンフリクト解消（`git mergetool`）はすべてこの原理に基づいています。

```
          Base (共通の祖先コード)
          /                    \
  Local (自分側の変更)     Remote (相手側の変更)
  [Ours / Mine]            [Theirs]
          \                    /
        3-Way Merge Engine
               │
               ▼
     Merged Result (最終出力)
```

---

## 2. 2-Way Diff と 3-Way Merge の違い

| 項目 | 2-Way Diff | 3-Way Merge |
| :--- | :--- | :--- |
| **比較対象** | 2 ファイル（A と B） | 3 ファイル（Base, Local, Remote） |
| **文脈の理解** | 「A と B が違う」ことしか分からない | 「誰がどこを変更したのか」が分かる |
| **自動マージ** | 不可能（どちらが最新/正しいか不明） | **可能**（非競合箇所は自動採用） |
| **競合（Conflict）** | 差分すべてが未確定 | **両者が同じ箇所を別々に変更した時のみ発生** |
| **主な用途** | コードレビュー、単一ファイルの差分確認 | Git ブランチ統合、コンフリクト解消 |

---

## 3. 差分判定の 4 パターン

Base テキストを行（またはトークン）単位の基準とすることで、すべての変更領域は以下の **4 パターン** に機械的に分類されます。

```
                       Base
                     ┌──┴──┐
             ┌───────┘     └───────┐
           Local                 Remote
             │                     │
      Base と一致？          Base と一致？
      ┌──────┴──────┐       ┌──────┴──────┐
     Yes            No     Yes            No
      │              │      │              │
[変更なし]    [Local変更] [変更なし]   [Remote変更]
```

### ① Local のみ変更（Clean Local）
- **状態:** Base に対して Local が変更され、Remote は Base のまま。
- **処理:** **Local の変更を自動採用** して Merged Result に反映。

### ② Remote のみ変更（Clean Remote）
- **状態:** Base に対して Remote が変更され、Local は Base のまま。
- **処理:** **Remote の変更を自動採用** して Merged Result に反映。

### ③ 両者が同一の変更（Identical Changes）
- **状態:** Local と Remote の両方が Base から変更されたが、変更後のテキストが完全に同一。
- **処理:** 衝突なしとして **その変更を自動採用**。

### ④ 競合（Conflict）
- **状態:** Local も Remote も Base から変更されており、かつ内容が食い違っている。
- **処理:** 自動解決できないため **「未解決コンフリクト」** としてマークし、UI 上で人間に選択（または手動編集）を委ねる。

---

## 4. Git コンフリクトマーカーの構造

Git がマージ競合時にファイル内へ埋め込むマーカーには、主に 2 つのフォーマットが存在します。

### A. 標準形式（2-Way Conflict Marker）
Git の既定形式。Base の内容は含まれず、Local と Remote の対立のみが記録されます。

```text
<<<<<<< HEAD (Local / Ours: 自分の変更)
  const tax = subtotal * 0.1;
  return subtotal + tax;
=======
  const discount = subtotal > 100 ? 10 : 0;
  return subtotal - discount;
>>>>>>> feature/discount (Remote / Theirs: 相手の変更)
```

### B. diff3 形式（3-Way Conflict Marker）
Git 設定（`git config merge.conflictstyle diff3` または `zdiff3`）により、共通祖先（Base）の情報も含めた形式。

```text
<<<<<<< HEAD (Local)
  const tax = subtotal * 0.1;
  return subtotal + tax;
||||||| merged common ancestors (Base: 変更前の共通コード)
  return subtotal;
=======
  const discount = subtotal > 100 ? 10 : 0;
  return subtotal - discount;
>>>>>>> feature/discount (Remote)
```

`Diffrex` は、ファイル読み込み時に正規表現およびステートマシンを用いて両形式を自動検知・パースし、3 ペインエディタへと復元・展開します。

---

## 5. Diffrex における 3-Way UI / MVC アーキテクチャ

`Diffrex` では、プログラマーが最も認知的負荷が少なく安全にマージ作業を行えるよう、**IntelliJ スタイルの 3 ペイン横並びレイアウト** を採用しています。

```
┌────────────────────────────────────────────────────────────────────────┐
│  [3-Way Merge]  競合: 1 / 3 解決済み   [◀ 前の競合] [次の競合 ▶]  ...   │
├───────────────────┬────────────────────┬───────────────────────────────┤
│  LOCAL (Ours)     │  MERGED (Result)   │  REMOTE (Theirs)              │
│  [Read-Only]      │  [Editable / Output│  [Read-Only]                  │
│                   │                    │                               │
│  line 1           │  line 1            │  line 1                       │
│  line 2 (local)   │  line 2 [競合ハイライト]│  line 2 (remote)              │
│                   │  (Accept Left/Right│                               │
│                   │   ボタンで置換)     │                               │
│  line 3           │  line 3            │  line 3                       │
└───────────────────┴────────────────────┴───────────────────────────────┘
         ▲                    ▲                         ▲
         └───────────── 3ペイン相互スクロール同期 ─────────┘
```

### MVC コンポーネントの役割

1. **Model (`ThreeWaySessionModel`)**:
   - `localContent`, `baseContent`, `remoteContent`, `mergedContent` を保持。
   - 各競合 Hunk に対する解決状態（`local` / `remote` / `base` / `both` / `custom`）を管理し、変更時に `mergedContent` を再構成して Observer へ通知。
2. **Controller (`ThreeWayController`)**:
   - キーボードショートカット（`J`/`K`: 競合移動、`1`/`L`: Local 採用、`2`/`R`: Remote 採用、`3`/`B`: Base 採用、`Ctrl+S`/`Ctrl+Enter`: 保存・終了）を解釈。
   - バックエンドとの WebSocket IPC（`save:request`, `exit:request`）をオーケストレーション。
3. **View (`ThreeWayDiffView`)**:
   - 3 つの独立した CodeMirror 6 `EditorView` を保持。
   - スクロールイベントをフックし、3 エディタの `scrollTop` / `scrollLeft` をミリ秒単位で完全同期。
   - 中央ペインは直接手動編集も可能なアクティブエディタとして機能。

---

## 6. Git mergetool との連携プロトコル

`git mergetool` から呼び出された際、`Diffrex` は以下のルールで終了コードと書き込みを制御します。

1. **起動引数の受取**:
   - `Diffrex $LOCAL $BASE $REMOTE -o $MERGED`（3 ファイル指定時）
   - `Diffrex $MERGED`（コンフリクトマーカー入り単一ファイル指定時）
2. **保存と書き戻し**:
   - `Ctrl+S` または `Ctrl+Enter` 押下時、指定された出力ファイル（`-o` または `$MERGED`）へ原子的（一時ファイル + リネーム）に保存。
3. **終了コード（Exit Code）**:
   - **`0`**: マージが保存され、正常に完了して終了。Git はマージ成功とみなす。
   - **`1`**: 未解決の競合を残したままウィンドウが閉じられた、またはユーザーがキャンセル（Esc 等）した。Git はマージ未完了として中断する。
