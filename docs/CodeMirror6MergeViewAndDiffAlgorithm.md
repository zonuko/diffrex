# CodeMirror 6 MergeView アーキテクチャ & 差分検出（Diff）アルゴリズム

本ドキュメントは、`Diffrex` で採用している CodeMirror 6（`@codemirror/merge`）の内部構造、差分検出アルゴリズム（Myers Diff）、およびマージ・ナビゲーションの仕組みをまとめた技術ナレッジです。

---

## 1. MergeView の全体アーキテクチャ

`MergeView` は単一のエディタではなく、**左右2つの独立した `EditorView`（左: `a` / 右: `b`）と中央のガターを統合管理するオーケストレーター**です。

```
┌────────────────────────────────────────────────────────┐
│                      MergeView                         │
│                                                        │
│  ┌─────────────────┐  ┌────────┐  ┌─────────────────┐  │
│  │   EditorView    │  │ Gutter │  │   EditorView    │  │
│  │       (a)       │  │ (svg/  │  │       (b)       │  │
│  │   Left / Base   │  │canvas/ │  │  Right / Target │  │
│  │                 │  │arrows) │  │                 │  │
│  │                 │  │        │  │                 │  │
│  └─────────────────┘  └────────┘  └─────────────────┘  │
│          ▲                          ▲                  │
│          └──────── 相互スクロール同期 ────────┘                  │
└────────────────────────────────────────────────────────┘
```

- **`mergeView.a`**: 左側エディタ（Base / 比較元）の `EditorView` インスタンス
- **`mergeView.b`**: 右側エディタ（Target / 編集・マージ先）の `EditorView` インスタンス
- **`mergeView.dom`**: 両エディタと中央の接続ガターを包括する最上位 DOM 要素

---

## 2. 差分検出（Diff）アルゴリズムの基礎: Myers Diff

差分検出の基本原理は、テキスト $A$ からテキスト $B$ へ変換するための**「最短の編集手順（SES: Shortest Edit Script）」**を求めることです。

### 編集グラフ（Edit Graph）の探索
2つのテキストを格子状（グリッド）に並べたグラフを考えます。
- **右へ進む（横移動）**: 削除（$A$ から文字/行を消す）
- **下へ進む（縦移動）**: 挿入（$B$ に文字/行を追加する）
- **斜め右下へ進む（対角線）**: 一致（コスト 0 で進める）

```
      A: "A B C"  →  B: "A X C"

          A       B       C
      o───────o───────o───────o
    A │ ＼ (一致)
      o───────o───────o───────o
    X │       │   +X  │
      o───────o───────o───────o
    C │               │ ＼ (一致)
      o───────o───────o───────o (ゴール)

最短経路: (0,0) → (1,1) [一致] → (2,1) [-B] → (2,2) [+X] → (3,3) [一致]
差分結果: 'B' を削除して 'X' を追加
```

Myers のアルゴリズムは、探索コスト（削除・挿入の合計回数 $D$）が少ない経路から優先的に探索するため、**差分が少ない場合は $O(ND)$ という非常に高速な計算量**で動作します。

---

## 3. CodeMirror 6 の 3 段階差分処理パイプライン

CodeMirror 6 の `@codemirror/merge` は、パフォーマンスと視認性を両立するために以下の 3 つのステップで差分を計算しています。

```
[ 入力: Doc A と Doc B ]
           │
           ▼
[ Step 1: 共通プレフィックス・サフィックスの高速刈り取り (Prefix/Suffix Trimming) ]
  (先頭と末尾の完全一致行を即座に除外)
           │
           ▼
[ Step 2: Myers Diff による文字/トークン単位の差分算出 (`diff()`) ]
           │
           ▼
[ Step 3: 人間が読みやすい形への整形・結合 (`presentableDiff()`) ]
  (行境界へのスナップ、近接する微小差分のマージ)
           │
           ▼
[ 出力: Chunk / Change リスト ]
```

### Step 1: 高速化のための前処理（Prefix / Suffix 刈り取り）
差分探索を始める前に、先頭から一致している文字数と、末尾から一致している文字数を一気に走査して探索範囲を絞り込みます。
```ts
let from = commonPrefix(docA, docB); // 先頭の一致部分をスキップ
let toA = docA.length - commonSuffix(docA.slice(from), docB.slice(from));
let toB = docB.length - commonSuffix(docA.slice(from), docB.slice(from));
// 実際に diff 計算するのは (docA[from..toA], docB[from..toB]) のみ
```
5,000行のファイルで数行しか変更がない場合、この前処理によって **99% 以上の領域が探索対象から除外されるため、数十ミリ秒以内**で完了します。

### Step 2: Myers Diff による `Change` 抽出
残った差分領域に対して Myers アルゴリズムを適用し、`Change`（どの位置からどの位置が削除され、何が挿入されたか）を算出します。

```ts
interface Change {
  fromA: number; // A の変更開始位置
  toA: number;   // A の変更終了位置
  fromB: number; // B の変更開始位置
  toB: number;   // B の変更終了位置
}
```

### Step 3: `presentableDiff` による人間の視覚への最適化
数学的に「最短の編集」であっても、人間にとって直感的でない（単語の途中でぶつ切りになるなど）場合があります。
`presentableDiff` は以下の最適化を行います：
1. **行・単語境界へのスナップ**:
   改行記号 `\n` や単語の区切りに合わせて差分の境界を微調整。
2. **近接差分の統合（Chunking）**:
   同じ行内や隣接する数文字以内の細かい変更を 1 つの `Chunk`（差分ブロック）に集約。

```ts
interface Chunk {
  fromA: number; // 左ドキュメントの開始文字オフセット (char pos)
  toA: number;   // 左ドキュメントの終了文字オフセット
  fromB: number; // 右ドキュメントの開始文字オフセット
  toB: number;   // 右ドキュメントの終了文字オフセット
  changes: readonly Change[]; // chunk 内の細かい単語/文字単位の差分
}
```

---

## 4. スクロール・行高さの同期（Alignment Spacers）

左右のドキュメントで行数が異なると差分ブロックの垂直位置（Y座標）がズレてしまいます。`MergeView` は以下のように高さを揃えています。

```
[左エディタ (Base)]            [右エディタ (Target)]
Line 1: const a = 1;          Line 1: const a = 1;
Line 2: const b = 2;          Line 2: const b = 2;
────────────────────          Line 3: const x = 10; ──┐ 追加行
(透明なスペーサーが挿入される)     Line 4: const y = 20; ──┘ (右側が2行多い)
────────────────────          ────────────────────
Line 3: return a + b;         Line 5: return a + b;
```

- **スペーサーデコレーション**: 片方にのみ追加行がある場合、反対側のエディタの同じ位置に **透明なブロックスペーサー（ダミーの高さ領域）** を動的に挿入。
- **スクロール同期**: 片方のエディタがスクロールされると、内部の Scroll リスナーがもう片方のエディタへ連動スクロールを適用し、左右の差分位置が常に視覚的に水平に並ぶよう維持。

---

## 5. マージ操作とトランザクション（Undo / Redo の仕組み）

`MergeView` におけるブロックマージ（例: `Ctrl+R` で Base → Target へ反映）は、特別な裏技ではなく **通常の CodeMirror トランザクション（`dispatch`）** として実行されます。

```ts
// 例: 左 (A) の内容を取得して、右 (B) の対象範囲を置き換える
const chunk = mergeView.chunks[index];
const baseText = mergeView.a.state.sliceDoc(chunk.fromA, chunk.toA);

mergeView.b.dispatch({
  changes: { from: chunk.fromB, to: chunk.toB, insert: baseText },
});
```

- **Undo / Redo の完全連携**:
  `dispatch` を通してドキュメントを変更するため、CodeMirror 標準の `@codemirror/commands` の `history()` に変更履歴として記録されます。マージ後でも `Ctrl+Z` で直前の状態に安全に戻すことができます。

---

## 6. Diffrex における Phase ごとの連携

- **Phase 2（Diff 表示 & ナビゲーション）**:
  CodeMirror 6 の `diff` / `presentableDiff` から生成された `Chunk` を基にして、左右エディタのハイライト、キーボード移動（`Alt+↓` / `J`）、ブロックマージ（`Ctrl+R`）を実装。
- **Phase 4（AI フレンドリー静的解析）**:
  差分ブロック（Chunk）の文字列を解析し、
  - 空白やコメントのみの変更判定（`isNoise: true` → 自動折りたたみ）
  - 10行以上一括削除やシグネチャ変更判定（`riskLevel: "danger"` → 警告バッジ付与）
  という AI コードレビュー支援機能を上乗せする。
