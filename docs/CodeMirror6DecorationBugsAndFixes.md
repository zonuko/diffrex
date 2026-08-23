# CodeMirror 6 デコレーション実装 — バグと修正のナレッジ

Phase 4-B（Noise Hunk 折りたたみ / Risk バナー）実装中に発覚した
CodeMirror 6 固有のハマりポイントをまとめる。

---

## Bug 1: `block: true` + `EditorView.decorations` facet の無音無視

### 症状

- `model.noiseFolded` の状態トグルは正常に動く
- ヘッダーの統計バッジ（`[▶ Noise folded (2)]`）も正常に表示される
- しかし、**エディタ本体に折りたたみ Widget が一切描画されない**
- コンソールエラーもなし

### 原因

CodeMirror 6 のデコレーション登録には 2 通りある。

| 登録方法 | 対応するデコレーション種別 |
|---|---|
| `StateField.provide` → `EditorView.decorations` facet | `mark`, `widget`, `replace` **インライン系のみ** |
| `EditorView.externalDecorations`（MergeView が内部使用） | 上記 + `block: true` のブロック系 |

`StateField.provide((f) => EditorView.decorations.from(f))` を使うと
**`block: true` のデコレーションは静かに描画をスキップする**。
例外は発生しないため、気付くのが非常に難しい。

```ts
// ❌ 動かないコード
Decoration.replace({ widget: foldWidget, block: true }).range(from, to)

// ❌ 動かないコード（widget も同様）
Decoration.widget({ widget: new RiskBannerWidget(...), side: -1, block: true }).range(from)
```

### 修正

`block: true` を削除するだけ。`from`〜`to` を行頭〜行末に正しく指定すれば、
`block` なしの `replace` でも複数行を 1 Widget に置換できる。

```ts
// ✅ 動くコード
Decoration.replace({ widget: foldWidget }).range(from, to)
Decoration.widget({ widget: new RiskBannerWidget(...), side: -1 }).range(from)
```

Widget の `toDOM()` は `<span>` を返す（インライン文脈のため）。
`display: inline-flex` にしておくとレイアウトが自然になる。

---

## Bug 2: `MergeView` に `EditorState` を渡すと extensions が全て消える

### 症状

- シンタックスハイライトが表示されない
- `riskBannerField`, `noiseFoldField` 等の StateField が動かない
- `dispatch` で effect を送っても何も起きない
- コンソールエラーはなし

### 原因

`MergeView` のコンストラクタは `config.a` / `config.b` として
**`{ doc, extensions }` の平オブジェクト** を期待している。

ところが実装では `EditorState.create()` で作成済みの `EditorState` を渡していた。

```ts
// ❌ 問題のあったコード
const leftState = EditorState.create({ doc, extensions: [言語, StateField, ...] });
const mergeView = new MergeView({ a: leftState, b: rightState, ... });
```

MergeView 内部では `config.a.extensions || []` を参照するが、
`EditorState` には `.extensions` プロパティが存在しない（作成時にベイクインされる）。
結果として `undefined || []` = 空配列となり、
**私たちが指定した全 extensions が無音で捨てられる。**

### 修正

`EditorState.create()` を呼ばず、`{ doc, extensions }` の平オブジェクトを直接渡す。

```ts
// ✅ 動くコード
const mergeView = new MergeView({
  a: {
    doc: leftContent,
    extensions: [言語サポート, StateField群, ...],
  },
  b: {
    doc: rightContent,
    extensions: [言語サポート, StateField群, ...],
  },
  parent: containerRef.current,
});
```

---

## Bug 3: StateField を 1 つにまとめると `startSide` 競合が起きる

### 症状

```
Ranges must be added sorted by from position and startSide
```

### 原因

`Decoration.replace`（startSide = -1）と
`Decoration.widget({ side: -1 })`（startSide = -1）を
同一の `Decoration.set()` に混在させると、
同じ `from` 位置で startSide が競合し例外が発生する。

### 修正

3 種類のデコレーションを **別々の StateField と Effect に分離** する。

```ts
// 1. ノイズ折りたたみ専用 (Decoration.replace)
const setNoiseFoldEffect = StateEffect.define<DecorationSet>();
const noiseFoldField = StateField.define<DecorationSet>({ ... });

// 2. リスク警告バナー専用 (Decoration.widget)
const setRiskBannerEffect = StateEffect.define<DecorationSet>();
const riskBannerField = StateField.define<DecorationSet>({ ... });

// 3. リスク行ボーダー専用 (Decoration.line)
const setRiskLineEffect = StateEffect.define<DecorationSet>();
const riskLineField = StateField.define<DecorationSet>({ ... });
```

また `Decoration.set()` に渡す前に必ず昇順ソートし、try/catch でガードする。

```ts
foldRanges.sort((a, b) => a.from - b.from || a.to - b.to);
try {
  foldDecos = Decoration.set(foldRanges, true);
} catch (err) {
  console.error("Failed to set foldDecos:", err, foldRanges);
}
```

---

## Bug 4: 0行 hunk で `from > to` になりクラッシュ

### 症状

`Ranges must be added sorted by from position` または `Invalid range` エラー。

### 原因

相手側のみの追加（自分側に変更行なし）の場合、
`lineStartRight > lineEndRight` となる hunk が存在し、
`to < from` の逆転範囲が生成されてしまう。

### 修正

```ts
const isZeroLines = startLine > endLine || startLine <= 0;
const effectiveEnd = isZeroLines
  ? effectiveStart
  : Math.max(effectiveStart, Math.min(endLine, docLines));

const to = isZeroLines ? startLineObj.from : endLineObj.to;

// 折りたたみは 0行には適用しない
if (!isZeroLines && from <= to && !processedFoldPos.has(from)) {
  // Decoration.replace を生成
}
```

---

## Prec（優先度）の使い方

複数の `EditorView.decorations` facet を登録するときは優先度を明示する。

```ts
// 折りたたみは最高優先度（他のデコを覆う）
provide: (f) => Prec.highest(EditorView.decorations.from(f))

// バナー・ライン装飾は高優先度
provide: (f) => Prec.high(EditorView.decorations.from(f))
```

---

## 初期デコレーションの反映タイミング

`MergeView` 作成直後に同期 `dispatch` で初期デコレーションを適用する。
`useEffect` の非同期タイミングに任せると初回レンダリングで適用が遅れる。

```ts
const mergeView = new MergeView({ ... });

if (session.hunks && session.hunks.length > 0) {
  const initialLeft = buildDecorationsForEditor(mergeView.a.state.doc, ...);
  mergeView.a.dispatch({
    effects: [
      setNoiseFoldEffect.of(initialLeft.foldDecos),
      setRiskBannerEffect.of(initialLeft.bannerDecos),
      setRiskLineEffect.of(initialLeft.lineDecos),
    ],
  });
  // b も同様
}
```

---

## トラブルシューティングチェックリスト

Widget が描画されない場合に確認する順序。

1. `block: true` を使っていないか → 削除する
2. `MergeView` に `EditorState` を渡していないか → `{ doc, extensions }` に変更する
3. StateField が `baseExtensions` に含まれているか → 配列に追加する
4. デコレーション範囲が `from <= to` か → 0行ガードを追加する
5. ソートが昇順か → `sort((a, b) => a.from - b.from)` を実施する
6. DOM に `.cm-*` クラスが存在するか → DevTools で確認する

```js
// ブラウザ DevTools コンソールで確認
document.querySelectorAll('.cm-noise-fold-widget').length  // > 0 なら描画OK
document.querySelectorAll('.cm-risk-banner-widget').length
```
