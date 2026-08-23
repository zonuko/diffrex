# Tree-sitter & AST セマンティック Diff 技術ナレッジ

本ドキュメントは、`Diffrex` における AST（構文木）セマンティック Diff 解析（B-2）、Tree-sitter WASM のアーキテクチャ、GLR パースアルゴリズム、Move / Rename 検出アルゴリズム、および同種アプローチの先行事例に関する技術仕様と設計ナレッジをまとめたものです。

---

## 1. AST セマンティック Diff の意義と背景

### 1.1 なぜやるのか（一言で言うと）
> **「AI が大量にコードを書き換えたとき、“見かけ上の差分（関数の移動や一括リネーム）”に惑わされず、人間が“本当にレビューすべき本質的なロジック変更”だけに集中できるようにするため」**

### 1.2 従来の「行ベース Diff（Myers Diff）」が抱える課題
Git や一般的な比較ツールが採用する **Myers Diff（行単位の比較）** は、コードの文法・構文（AST）を理解していません。そのため、以下のケースでレビュアーに極めて大きな認知負荷を与えます：

1. **関数の移動（Move）問題**:
   * 関数やクラスの定義位置を上下に入れ替えただけで、**「旧位置での大量削除 ＋ 新位置での大量追加」** として真っ赤＆緑に染まる。
   * レビュアーは「移動しただけなのか、中身のロジックも書き換わっているのか」を目視で 1 行ずつ確認しなければならない。
2. **一括リネーム（Rename）による差分爆発**:
   * 変数名 `x` → `userId` のようなリネームが行われると、ロジックは一切変わっていないにもかかわらず、使われているすべての行が「変更」として差分に現れ、本質的なロジック修正が埋もれてしまう。
3. **正規表現解析の限界**:
   * 正規表現ベースの簡易解析では、ネストしたブロックスコープや複雑な構文の境界判定で誤判定が生じやすい。

### 1.3 AI 生成コード時代における重要性（`Diffrex` の理念との合致）
* **AI（Copilot / Claude / Cursor 等）の挙動特性**:
  * プロンプトでリファクタリングを指示すると、関数の順序を整理したり、変数をわかりやすい名前に一括リネームしたり、コードを別ブロックへ移動させることが日常茶飯事です。
* **レビュアーの課題と解決**:
  * 差分行数が 300 行あっても、そのうち 250 行が「関数の移動」や「リネーム」だった場合、人間は疲弊し、**「本当に潜んでいるバグや危険な変更（50 行分）」を見落とすリスク** が激増します。
  * AST 解析により、見かけの差分を `[Moved]`, `[Rename]` ノイズとして自動認識・ワンキー折りたたみ（`Ctrl+N`）することで、人間の認知負荷を劇的に引き下げます。

### 1.4 行ベース Diff と AST セマンティック Diff の比較

| 項目 | 行ベース Diff（従来） | AST セマンティック Diff（`Diffrex`） |
| :--- | :--- | :--- |
| **関数の移動** | 上で 50 行削除、下で 50 行追加 | **「`calculateTotal()` が移動（変更なし）」** と認識し、ノイズとして折りたたみ |
| **変数リネーム** | 10 行のロジック変更として表示 | **「`x` → `userId` のリネーム（変更なし）」** としてノイズ判定・一括折りたたみ |
| **リスク判定** | 行数や正規表現による推定 | 構文木レベルで **「シグネチャ変更」「戻り値型の破壊」** などを厳密に検出 |

---

## 2. 先行事例・同種アプローチを取るツールと `Diffrex` の独自性

構文木（AST）や Tree-sitter 等を活用してセマンティック Diff を実現している代表的な実在ツール・システムです。

### 2.1 代表的な先行ツール・事例

1. **Difftastic (`difft`)** — CLI 構文 Diff のデファクトスタンダード (Rust 製)
   * 行単位ではなく「AST のノード単位」で比較。
   * 改行位置やインデントが変わっても、構文木が同一なら「差分なし」と判定。
   * ターミナル上でカッコの対応や式の構造を理解して差分をハイライト。
2. **GumTree** — AST Diff アルゴリズムの学術的標準
   * ソフトウェア工学の研究から生まれた、AST 間の精密な差分（Edit Script）を計算するオープンソースエンジン。
   * 単なる「追加・削除」だけでなく、**「Move」「Update」「Insert」「Delete」** を数学的・木構造的に特定するアルゴリズム（Top-down / Bottom-up マッチング）を確立。
3. **SemanticDiff (VS Code 拡張 / サービス)**
   * 関数が別位置に移動した場合の Move 検出や、変数一括リネームの自動検知、コードフォーマットによる擬似差分の不可視化を提供。
4. **JetBrains IDE（IntelliJ IDEA / WebStorm 等）の内蔵 Diff**
   * ファイル内でメソッドやブロックが移動した場合、差分ガターに「Moved」アイコンを表示し、移動先へのリンクを提供。
5. **GitHub Pull Request の「Moved Code」検出**
   * PR レビュー画面で、ブロックが移動された場合に「Code moved」バッジを表示してレビュー負荷を低減。

### 2.2 `Diffrex` が目指す独自性・立ち位置
* **GUI（CodeMirror 6）＋ 双方向マージ**:
  * Difftastic 等の CLI ツールと異なり、GUI 上で直感的にナビゲーション（`J`/`K`）、双方向マージ（`Ctrl+R`/`Ctrl+L`）、編集が可能。
* **AI レビュー支援への特化**:
  * AST で検知した「Move」や「Rename」を、**AI メタデータ（プロンプト・モデル・エージェント）と連動させて「ノイズとしてワンキー折りたたみ（Ctrl+N）」したり「シグネチャ破壊のリスク警告」に変換する**という、AI 時代特化の UX を提供。

---

## 3. Tree-sitter の技術概要とアーキテクチャ

### 3.1 概要
Tree-sitter は GitHub が開発した、テキストエディタや開発ツール向けの高速・インクリメンタル構文解析フレームワークです。Neovim、Zed、Helix、GitHub コード検索、Difftastic 等でデファクトスタンダードとして利用されています。

### 3.2 コンパイラパーサーとの違い

| 比較項目 | 一般的なコンパイラパーサー | Tree-sitter |
| :--- | :--- | :--- |
| **前提コード** | 完全で文法エラーのないコード | 書きかけ・構文エラーを含むコード |
| **エラー時** | エラーを送出して中断 | エラーノードを隔離し、残りを正常パース（**Error Recovery**） |
| **再パースコスト** | ファイル全体をゼロから再構築 | 変更部分のみ更新（**インクリメンタルパース** $O(\log N)$） |
| **応答速度** | 数百ミリ秒〜数秒 | キーストローク追従（数ミリ秒以内） |

### 3.3 コア技術
1. **GLR（Generalized LR）パースアルゴリズム**:
   * 曖昧な文法に遭遇した際に並行してスタックを分岐（Fork）し、後続のトークンで正しい木を確定する。
2. **ゼロ依存 C 言語 ＋ WebAssembly（WASM）**:
   * 各言語の文法定義（`grammar.js`）から純粋な C 言語パーサーが生成され、WASM としてブラウザ・Deno 環境でネイティブ並みの速度・安全度で動作。
3. **S 式クエリ言語**:
   * Scheme 風のパターンマッチング記法で AST ノードを直感的に検索・抽出。

### 3.4 パーサジェネレータとしての生成フローと `grammar.js` の位置づけ

Tree-sitter はパーサそのものではなく **「パーサジェネレータ（Parser Generator）」** です。文法定義から実行可能バイナリ（WASM）に至るビルドチェーンは以下の通りです：

```
[言語の文法定義] (grammar.js)
       │
       ▼  Tree-sitter CLI (ジェネレータ) が解析
[C 言語パーサソース] (parser.c / 状態遷移テーブル)
       │
       ▼  Emscripten 等でコンパイル (tree-sitter build --wasm)
[パーサー本体 WASM] (tree-sitter-<lang>.wasm)
```

#### 本プロジェクト（`Diffrex`）における位置づけ
* `Diffrex` リポジトリ内には `grammar.js` 自体は置かれていません。
* Tree-sitter 公式・コミュニティの上流リポジトリ（例: `tree-sitter/tree-sitter-typescript` の `typescript/grammar.js`）からビルドされた **完成品のパーサーバイナリ（`vendor/tree-sitter/*.wasm`）** を配置・利用しています。

#### 💡 新言語・独自 DSL を追加・拡張する手順
独自言語や社内 DSL などを `Diffrex` でセマンティック Diff したい場合：
1. 対象言語の `grammar.js` を作成（または OSS から取得）。
2. `tree-sitter build --wasm` で `.wasm` バイナリを生成。
3. `vendor/tree-sitter/` に配置し、`src/core/analysis/ast/ast_parser.ts` の拡張子マッピングに登録する。
これだけで、C++ コンパイルやランタイム変更なしに即座に多言語セマンティック Diff を拡張できます。

---

## 4. GLR（Generalized LR）パースアルゴリズム

### 4.1 仕組み
1985 年に富田勝氏が実用化したアルゴリズム（富田パーサー）であり、従来の LR(1) で問題となる **Shift/Reduce 競合** や **Reduce/Reduce 競合** を解決します。

```
【曖昧なトークンに遭遇！】
         ┌── [解釈 A のスタック] ──→ 読み進める ──→ 文法不一致で消滅 ❌
 [解析中] ┤
         └── [解釈 B のスタック] ──→ 読み進める ──→ 正しい木として確定 ⭕
```

* **並行分岐（Forking）**: 競合発生時にスタックを複製し、複数の解釈を並行シミュレーション。
* **枝刈り（Pruning）**: 後続トークンと矛盾した無効ブランチは自動消滅。
* **Graph-Structured Stack (GSS)**: 分岐したスタックが同状態に戻った際に合流させ、計算量とメモリの爆発を抑止。

### 4.2 プログラミング言語での実例
* **TypeScript の JSX vs ジェネリクス**:
  * `const a = <T>(x: T) => x;` （ジェネリクス関数）
  * `const b = <T>Hello</T>;` （JSX タグ）
  * `<T>` の時点では判別不能だが、GLR は両方分岐して後続トークンで確定する。
* **C/C++ のキャスト vs 乗算**:
  * `(T) * x;`（型 `T` へのキャストか、変数 `T` と `x` の掛け算か）

---

## 5. `Diffrex` における AST セマンティック解析の実装仕様

### 5.1 モジュール構成 (`src/core/analysis/ast/`)

```
src/core/analysis/ast/
├── index.ts           # AST 解析統合インターフェース
├── ast_parser.ts      # web-tree-sitter 初期化・言語 WASM ローダー
├── ast_nodes.ts       # 関数・クラス・メソッド等のブロックノード抽出・正規化
├── move_detector.ts   # Move（コードブロック移動）検出
└── rename_detector.ts # Rename（一括リネーム）検出
```

### 5.2 Move（ブロック移動）検出アルゴリズム (B2-02)
1. **ノード抽出**: Base と Target の AST から主要ブロックノード（関数宣言、クラス宣言、メソッド、アロー関数等）を抽出。
2. **正規化コード比較**: コメントと連続空白を除去した `normalizedText` が 100% 一致し、かつ開始・終了行番号が異なるペアを探索。
3. **アノテーション**:
   * HunkAnnotation に `isNoise: true`, `noiseReason: "move"`, `summaryTag: "[Moved] <kind> <name>"`, `moveInfo` を付与。
   * 移動元・移動先の行範囲を記録し、UI 上で `[Moved]` としてノイズ折りたたみの対象にする。

### 5.3 Rename（一括リネーム）検出アルゴリズム (B2-03)
1. **構文シグネチャ照合**: 2 つのノード間でノード種別・演算子・リテラル・制御構造の深さが等しいか（`syntaxSignature`）を検証。
2. **識別子マッピング**: ノード内の全 `identifier` を走査し、置換マップ（例: `x` $\to$ `deltaX`, `y` $\to$ `deltaY`）を一貫して作成できるか検証。
3. **アノテーション**:
   * 識別子のみが規則的に置換されており、構文木構造に変更がない場合、`isNoise: true`, `noiseReason: "rename"`, `summaryTag: "[Rename] x -> deltaX, y -> deltaY"` を付与。

### 5.4 オフライン WASM 管理と Graceful Fallback（段階的縮退）

未対応言語や破損したコードが渡された場合でも、アプリがクラッシュ・エラー停止することは一切ありません。

```
[ファイル拡張子を判定]
       │
       ├─▶ 対応言語（TS/JS, Python, Rust, Go, Ruby）
       │      └─▶ AST セマンティック解析（Move / Rename 検出）
       │
       └─▶ 未対応言語（.md, .txt, .html, .java 等）またはパース例外
              └─▶ null を安全に返却
                     │
                     ▼
           [従来の行ベース Diff（Myers Diff ＋ 行ベースノイズ/リスク判定）を適用]
```

* **言語未対応時**: `.md`, `.txt`, `.json`, `.css`, 未対応のプログラミング言語の場合、`detectLanguageFromFilename` が `null` を返し、即座に行ベース Diff を返します。
* **例外の二重保護**: WASM のロード失敗や極端な構文破損時も `try...catch` で安全に捕捉され、従来の行ベース Diff にフォールバックします。

---

## 6. 新しい言語を追加する際の実装手順ガイド

将来的に新しい言語（例: C++, Java, Ruby, PHP 等）を `Diffrex` の AST セマンティック Diff に追加する場合の手順です。

### Step 1: WASM バイナリの配置
1. 対象言語の Tree-sitter WASM ファイル（`tree-sitter-<lang>.wasm`）を入手またはビルド（`tree-sitter build --wasm`）。
2. `vendor/tree-sitter/tree-sitter-<lang>.wasm` に配置。

### Step 2: 言語ローダーの定義更新 (`src/core/analysis/ast/ast_parser.ts`)
```typescript
// 1. サポート言語 ID に追加
export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "java"; // 追加

// 2. 拡張子マッピングに追加
export function detectLanguageFromFilename(filename: string): SupportedLanguage | null {
  ...
  if (lower.endsWith(".java")) return "java";
  return null;
}
```

### Step 3: AST ブロックノード抽出ルールの追加 (`src/core/analysis/ast/ast_nodes.ts`)
対象言語の Tree-sitter 文法における「関数宣言」「クラス定義」「メソッド定義」等のノード型名と、名前フィールドの取得ルールを `extractBlockNodes()` 内に数行追加します。

```typescript
// 例: Java の場合
else if (node.type === "method_declaration") {
  const nameNode = node.childForFieldName("name");
  blockInfo = { name: nameNode?.text || "method", kind: "method" };
} else if (node.type === "class_declaration") {
  const nameNode = node.childForFieldName("name");
  blockInfo = { name: nameNode?.text || "class", kind: "class" };
}
```

### Step 4: テストの追加 (`tests/ast_diff_test.ts`)
1. `tests/fixtures/semantic/` に対象言語のサンプルコード（Base / Target）を配置。
2. `tests/ast_diff_test.ts` にパースと Move / Rename 検知のテストケースを追加して `deno task check` を実行。

