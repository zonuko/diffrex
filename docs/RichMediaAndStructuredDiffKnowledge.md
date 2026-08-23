# リッチメディア・非テキスト比較（Image / JSON / YAML / CSV Diff）技術ナレッジ & アーキテクチャ仕様

本ドキュメントは、`Diffrex` における **B-5（リッチメディア / 非テキスト比較）** の設計方針、アーキテクチャ、データモデル、アルゴリズム、UI/UX仕様、およびタスク分解を定義する。

---

## 1. 背景と目的

現代のソフトウェア開発および AI 生成コードのレビューでは、ソースコード（テキスト）に留まらず、以下の非テキスト・構造化データの差分レビューが頻繁に発生する：

1. **画像アセット（Image Assets）**: UI アイコン、イラスト、モックアップ、スクリーンショット差分（PNG, JPG, SVG, WebP 等）。
2. **構造化データ（JSON / YAML）**: 設定ファイル、API レスポンス、パッケージ定義。キーの出現順序変更やフォーマット変更による「擬似差分（ノイズ）」の大量発生。
3. **表形式データ（CSV / TSV）**: データセット、辞書データ、設定テーブル。テキストの行差分では「どの列・セルの値が変わったか」を把握しづらい。

`Diffrex` はこれらに対し、専用のビジュアル比較・正規化比較・グリッド比較を提供し、AI レビューの支援を行う。

---

## 2. 画像比較（Image Diff）仕様

### 2.1 対応フォーマット & 判定
- **拡張子**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif`, `.bmp`, `.ico`, `.avif`
- **判定ロジック**: ファイル拡張子およびマジックナンバー（ファイル先頭バイト列）で判定。バイナリ判定（NULバイト検出）で即時エラー終了とせず、画像フォーマットの場合は `image` モードへ分岐する。

### 2.2 データフロー & IPC
- **Backend**:
  - 画像ファイルを読み込み、MIME タイプを付与して Base64 Data URL (`data:image/png;base64,...`) として UI に送信（またはローカルエンドポイント経由）。
  - SVG の場合はテキスト（SVG XML）としても扱えるため、コード差分とプレビュー差分の相互切り替えをサポート。
  - メタデータ（ファイルサイズ、解像度 width/height）を抽出して送信。
- **データ構造**:
```typescript
export interface ImageTarget {
  path: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface ImageDiffSessionData {
  sessionId: string;
  timestamp: string;
  mode: "image";
  left: ImageTarget;
  right: ImageTarget;
  readOnly: boolean;
}
```

### 2.3 4つのビジュアル比較モード
UI では上部ツールバーで以下の4モードをワンクリック（またはショートカットキー `1`〜`4`）で切り替え可能とする：

1. **2-Up（Side-by-Side: 左右並列）**:
   - 左右に Base と Target を並べて配置。
   - 各画像の下に解像度（例: `1920x1080` vs `1920x1080`）およびファイルサイズ（例: `142 KB` vs `128 KB (-10%)`）を表示。
2. **Swipe / Split Slider（スプリットスライダー）**:
   - 1つの枠内で画像を重ね、中央の垂直スライダーバーをマウスドラッグ（左右移動）することで、左右の表示割合をリアルタイムに切り替える。
3. **Onion Skin（透過ブレンド）**:
   - 2枚の画像を重ね合わせ、スライダーで Base / Target の不透明度（Opacity: 0% 〜 100%）を調整する。
4. **Difference Highlight（ピクセル差分ハイライト）**:
   - HTML5 Canvas 2D Context（`getImageData`）を用いてピクセルごとの色差（RGB絶対値差分）を算出。
   - 変化のないピクセルは暗転/グレースケール化し、差分ピクセルを鮮烈なマゼンタ/ネオンレッド（`#ff0055`）でハイライト表示。
   - 許容差（Tolerance / Threshold: 0%〜20%）スライダーで微小な圧縮ノイズを無視可能。

### 2.4 Synchronized Pan & Zoom（同期パン＆ズーム）
- マウスホイールで拡大縮小（10%〜800%）、ドラッグでパン移動。
- 2-Up モード時も左右のキャンバスが同一のズーム率・スクロール位置で完全に同期して追従。

---

## 3. 構造化データ比較（JSON / YAML Canonical Diff）仕様

### 3.1 課題と解決策
- **課題**: JSON / YAML では、オブジェクトのキー順序が変更されただけで Git や従来のテキスト Diff では全体が差分として検出され、本質的な値の変更が埋もれてしまう。
- **解決策**:
  1. **Canonical JSON / YAML 正規化**:
     - JSON / YAML をパースし、オブジェクトのキーをアルファベット順に再帰的にソート（Canonicalize）。
     - 一定のインデント（2スペース）で再シリアライズしたテキスト同士で Myers Diff を実行。
  2. **Raw Diff と Canonical Diff のトグル**:
     - ツールバー上に「Normalized (Canonical) Mode」トグルスイッチを配置。
     - ワンクリックで「生のテキスト差分」と「正規化後の実質差分」を切り替え。
  3. **ノイズ判定連携**:
     - パース結果のデータツリーが完全一致する場合、テキスト差分が存在しても `isNoise = true`, `summaryTag = "[Format] Key reordering / formatting"` と自動アノテーション。

---

## 4. テーブル・表形式データ比較（CSV / TSV Diff）仕様

### 4.1 課題と解決策
- **課題**: CSV / TSV などの表形式データは、1行が長くなると行単位のテキスト差分では「どのカラムのセルが変更されたのか」の特定が困難。
- **解決策**:
  1. **CSV / TSV パーサー**:
     - クォートやカンマ・改行を含む RFC 4180 準拠のパーサー。
  2. **Grid / Table Diff View**:
     - スプレッドシート（表）形式でデータをレンダリング。
     - 1行目をヘッダーとして認識。
     - 行の追加（緑）、行の削除（赤）、行内のセル変更（黄色/オレンジのセル背景ハイライト）を可視化。
  3. **Diff View 切替**:
     - 通常の CodeMirror テキスト差分と「Table View」をツールバーからシームレスに切り替え。

---

## 5. アーキテクチャと設計方針

### 5.1 全体構成
```
src/
├── core/
│   ├── types.ts                   # ImageTarget, CsvDiffData などの型定義追加
│   ├── file_io.ts                 # 画像・CSV・JSONの判定と安全なローダー
│   ├── media/
│   │   └── image_detector.ts      # 画像マジックナンバー判定とメタデータ抽出
│   └── structured/
│       ├── json_canonicalizer.ts  # キーソート・正規化
│       ├── yaml_canonicalizer.ts  # YAMLパース・正規化
│       └── csv_parser.ts          # RFC 4180 CSV/TSV パースと行・セル差分判定
├── ui/
│   ├── model/
│   │   ├── image_diff_model.ts    # 画像比較状態（ズーム、モード、スライダー位置）
│   │   └── csv_diff_model.ts      # CSV比較状態（ソート、フィルタ、表示モード）
│   ├── controller/
│   │   ├── image_controller.ts    # 画像操作イベントハンドラ
│   │   └── csv_controller.ts      # CSV操作イベントハンドラ
│   └── components/
│       ├── ImageDiffView.tsx      # 画像比較コンポーネント（2-Up, Swipe, Onion, Diff）
│       ├── CsvDiffView.tsx        # テーブルグリッド差分コンポーネント
│       ├── StructuredToolbar.tsx  # JSON/YAML Canonical 切り替えバー
│       └── App.tsx                # モードに応じた View の動的ルーティング
```

### 5.2 MVC パターン（Smalltalk-80 スタイル）の堅持
- **Model**: UI 状態（`zoomLevel`, `activeMode`, `sliderPosition`, `tolerance` 等）を保持し、変更時に `notifyListeners()` を発火。
- **View**: TSX コンポーネント。Model の変更を購読して DOM / Canvas を再描画。
- **Controller**: ユーザーのマウス・キーボード入力を受け付け、Model のメソッドを呼び出す。

### 5.3 ディレクトリ比較（B-1）との連携
- ディレクトリツリー（`DirectoryTreeView`）でファイルを選択した際、拡張子・MIME に応じて：
  - `.png`, `.jpg`, `.svg` 等 → 右ペインに `ImageDiffView` を遅延ロード表示。
  - `.csv`, `.tsv` → 右ペインに `CsvDiffView` またはテキスト Diff を表示。
  - `.json`, `.yaml` → 右ペインに `MergeView` + `StructuredToolbar` を表示。

---

## 6. TODO タスク細分化（B-5）

- [ ] **B5-01** `src/core/types.ts` & `src/core/media/image_detector.ts` に画像用データ構造（`ImageTarget`, `ImageDiffSessionData`）とフォーマット・マジックナンバー判定・メタデータ抽出を実装。
- [ ] **B5-02** `src/core/file_io.ts` & `src/desktop/ipc.ts` で画像ファイルのバイナリ読み込みおよび Base64 Data URL 変換と IPC 配信を実装。
- [ ] **B5-03** `src/ui/model/image_diff_model.ts` & `src/ui/controller/image_controller.ts` に画像比較の MVC モデル・コントローラ（ズーム、パン、4モード切替、スライダー位置、トレランス）を実装。
- [ ] **B5-04** `src/ui/components/ImageDiffView.tsx` に 2-Up、Swipe（スライダー分割）、Onion Skin（透過）、Difference（Canvas ピクセル差分ハイライト）と同期ズーム＆パンを実装。
- [ ] **B5-05** `src/core/structured/json_canonicalizer.ts` & `yaml_canonicalizer.ts` に JSON / YAML のキー順序ソート正規化および擬似差分（ノイズ）判定を実装。
- [ ] **B5-06** `src/ui/components/StructuredToolbar.tsx` に Raw Diff / Canonical Diff の切替 UI を実装し、エディタと連動。
- [ ] **B5-07** `src/core/structured/csv_parser.ts` に RFC 4180 CSV / TSV パーサーおよび行・セル単位の差分検出ロジックを実装。
- [ ] **B5-08** `src/ui/model/csv_diff_model.ts` & `src/ui/components/CsvDiffView.tsx` にテーブルグリッド差分ビュー（追加・削除・変更セルのハイライト）を実装。
- [ ] **B5-09** `src/ui/App.tsx` & `src/cli/args.ts` に画像および構造化データの自動モード判定・単独起動・ディレクトリツリー内での動的切り替えを統合。
- [ ] **B5-10** テスト: `tests/image_diff_test.ts`, `tests/canonical_diff_test.ts`, `tests/csv_diff_test.ts` を追加し検証。
