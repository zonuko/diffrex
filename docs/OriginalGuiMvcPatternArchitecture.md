# 原初GUI MVCパターン（Smalltalk-80 スタイル）アーキテクチャ解説

本書は、`Diffrex` のフロントエンド（UI/状態管理）に導入した**原初GUI MVCパターン（Smalltalk-80 スタイル）**の設計思想、データフロー、コンポーネント構成、および Web MVC との違いについて解説した技術ナレッジドキュメントです。

---

## 1. 原初GUI MVC と 現代Web MVC の本質的な違い

現代で広く知られる「Web MVC」（Ruby on Rails, Spring MVC, Express など）と、1970年代後半に Smalltalk-80 で生み出された「原初GUI MVC」は、同じ "MVC" という呼称を用いながら**目的とデータフローの構造が根本的に異なります**。

```
【現代の Web MVC（リクエスト-レスポンス型 / サーバーサイドMVC）】
 ユーザー
    │
    ▼ (HTTP Request)
Controller ───> Model (受動的データ / DB)
    │
    ▼ (HTML / JSON レンダリング)
  View ───────> クライアントへレスポンス返却
```

```
【原初GUI MVC（Smalltalk-80 / デスクトップGUI型）】
 ユーザー入力（キー・マウス・IPC）
    │
    ▼
Controller ───(更新指示)───> Model (Active Domain State / Subject)
                             │
                             ▼ (状態変更通知: Observer Pattern)
                            View (画面描画 / Observer)
```

| 項目 | 現代の Web MVC | 原初GUI MVC（Smalltalk-80 スタイル） |
| :--- | :--- | :--- |
| **主な用途** | サーバーサイドのリクエスト処理、画面遷移 | リッチなデスクトップ/GUIアプリケーションの対話的UI |
| **Model** | 受動的なデータ構造・DBクエリラッパ | **能動的なドメインオブジェクト（Active Model）**。状態を保持し、変更時に Observer（View）へ自己通知する |
| **View** | テンプレート（HTMLを生成して破棄） | **永続的なUIコンポーネント**。Model を監視（Subscribe）し、変更通知を受け取って自己の描画を更新する |
| **Controller** | リクエストのエントリポイント（ルーティング担当） | **ユーザー入力の翻訳器（Input Translator / Dispatcher）**。キーやクリックを受け取り、Model や View に対する適切なコマンドに変換して実行する |
| **データフロー** | 一方向（Controller → Model → View → 終了） | **三角形の循環フロー（Input → Controller → Model ─通知─> View）** |

---

## 2. Diffrex における設計とデータフロー

`Diffrex` では、外部の状態管理ライブラリ（Redux, Zustand, MobX, RxJS など）を一切使用せず、**ピュアな TypeScript による Observer パターン**を用いて原初GUI MVCを構築しています。

```mermaid
flowchart TD
    User([ユーザー操作 / キーボード / マウス / IPC]) -->|キーイベント / UIアクション| Controller[DiffController]
    
    subgraph Model Layer [Model (Active Domain State)]
        Observable["Observable&lt;T&gt; (Subject)"]
        Model["DiffSessionModel\n(セッション・Chunks・アクティブ位置・モード)"]
        Observable --> Model
    end
    
    Controller -->|"状態変更メソッド\n(selectNextHunk, setMode 等)"| Model
    Controller -->|"エディタ直接操作\n(マージ適用, フォーカス, スクロール)"| MergeView["CodeMirror 6 MergeView"]
    
    subgraph View Layer [View (Preact Components & Observers)]
        App[App Component]
        Header[Header View]
        StatusBar[StatusBar View]
        DiffView[DiffView Component]
    end
    
    Model -.->|"状態変更通知\n(notify / useModel)"| Header
    Model -.->|"状態変更通知\n(notify / useModel)"| StatusBar
    Model -.->|"状態変更通知\n(notify / useModel)"| DiffView
    Model -.->|"状態変更通知\n(notify / useModel)"| App
    
    DiffView -->|"DOMイベント / 選択変更"| Controller
    MergeView -.->|"Diff Chunks 更新通知"| Controller
```

---

## 3. 各レイヤーの責務と実装詳細

### 3.1. Model 層 (`src/ui/model/`)

Model は UI フレームワーク（Preact や DOM）の具体的な実装に一切依存せず、純粋な TypeScript クラスとして設計されています。

- **`Observable<T>` (`src/ui/model/observable.ts`)**:
  - ピュア TypeScript による汎用 Observer パターン基盤。
  - `subscribe(observer: Observer<T>): Unsubscribe` により購読を管理。
  - `notify(value: T)` により登録された Observer 全体へ安全に変更を通知。
- **`DiffSessionModel` (`src/ui/model/diff_session_model.ts`)**:
  - `Observable<DiffSessionModel>` を継承した Active Model。
  - **保持する状態**:
    - `session`: CLI/Backend から渡された `DiffSessionData`（ファイルパス、内容、メタデータ）
    - `connectionStatus`: バックエンドとの接続状態（`connecting` / `connected` / `disconnected`）
    - `chunks`: CodeMirror が算出した現在の差分ブロック一覧
    - `activeChunkIndex`: 現在フォーカスされている Hunk のインデックス
    - `mode`: ナビゲーションモード（`navigation`）またはエディタ直接編集モード（`editing`）
    - `statusMessage`: ステータスバーに表示する一時通知メッセージ
    - `saveStatus`: 保存状態（Phase 3 連携）
  - **ドメインメソッド**:
    - `selectNextHunk()` / `selectPrevHunk()`: ラップアラウンド（先頭⇔末尾）を考慮した Hunk 移動
    - `setChunks()`, `setActiveChunkIndex()`, `setMode()`, `setStatusMessage()`, `setSaveStatus()` など
    - 状態が変化した際、自動的に `this.notify(this)` を発行してすべての View に更新を伝播。

### 3.2. Controller 層 (`src/ui/controller/`)

Controller はユーザーや環境からの入力を解釈し、Model のドメインメソッドの呼び出しや View へのコマンド実行へ変換する責務を負います。

- **`DiffController` (`src/ui/controller/diff_controller.ts`)**:
  - **キーボード入力の解釈 (`handleKeyDown`)**:
    - `Alt+Down` / `J` → `model.selectNextHunk()`
    - `Alt+Up` / `K` → `model.selectPrevHunk()`
    - `E` / `Enter` → `enterEditMode()`（エディタにフォーカスしカーソルを該当 Hunk に移動）
    - `Escape` → `exitEditMode()`（エディタのフォーカスを解除してナビゲーションモードへ）
    - `Ctrl+R` / `Alt+Right` → `mergeLeftToRight()`（Base のテキストを Target へマージ）
    - `Ctrl+L` / `Alt+Left` → `mergeRightToLeft()`（Target のテキストを Base へマージ）
  - **マージ操作の実行と同期**:
    - `MergeView` のドキュメントに対してトランザクション（`dispatch({ changes: ... })`）を発行し、マージ後の最新 chunks を Model へ反映。
  - **IPC 通信・ライフサイクル管理**:
    - WebSocket 接続の確立・切断ハンドリング。
    - `session:init`, `save:result` 等のメッセージを受信して Model へ反映。
    - `ui:ready`, `save:request`, `exit:request` などの送信を統括。
- **`keymap.ts` (`src/ui/controller/keymap.ts`)**:
  - グローバルキーイベントリスナを Controller の `handleKeyDown` へ接続する薄いラッパー。

### 3.3. View 層 (`src/ui/components/` & `src/ui/hooks/`)

View は Model の状態を描画し、発生したユーザーイベントを Controller へ渡します。

- **`useModel` フック (`src/ui/hooks/use_model.ts`)**:
  - Preact コンポーネントが Model（`Observable`）を購読するためのカスタムフック。
  - Model から `notify()` が届くとコンポーネントのローカル state を更新して再レンダリングをトリガー。
- **`Header.tsx`**:
  - Model の `session`（AI メタデータ、モード）および `connectionStatus` を購読・描画。
- **`StatusBar.tsx`**:
  - Model の `activeChunkIndex`、`chunks.length`（総Hunk数）、`statusMessage`、ショートカットキー案内を描画。
- **`DiffView.tsx`**:
  - CodeMirror 6 `MergeView` を初期化・保持。
  - Model の `activeChunkIndex` の変更を監視し、該当 Hunk のハイライト装飾（`setActiveHunkEffect`）と自動スクロール（`scrollIntoView`）を実行。
  - エディタ内のカーソル移動やクリックを検知して Controller の `handleCursorChunkSelect()` へ通知。
- **`App.tsx`**:
  - Model と Controller を配下の子コンポーネントに配線し、アプリ全体のレイアウトを定義。

---

## 4. このアーキテクチャを採用した理由とメリット

1. **外部依存ゼロによる軽量性と堅牢性**:
   - Redux や Zustand、RxJS などのフレームワークを導入せず、言語標準の TypeScript のみで実装されているため、バンドルサイズが最小限に抑えられ、オフライン単一バイナリ配布（`deno compile` / `deno desktop`）に最適。
2. **高いテスタビリティ（UI 非依存テスト）**:
   - Model および Controller は Preact や DOM に依存しないため、ヘッドレス環境の `deno test` で 100% 高速かつ確実に単体テストが可能。
   - `tests/ui_model_test.ts` と `tests/ui_controller_test.ts` で状態遷移やキー入力の解釈ロジックを網羅的に検証可能。
3. **CodeMirror 6 との無理のない統合**:
   - CodeMirror 6 は独自の Immutable State と Transaction モデルを持っています。原初GUI MVCの Controller が CodeMirror の `MergeView` を直接操作・調停する役割を担うことで、一般的な仮想DOM状態管理との間で起こりがちな「多重管理・無限更新ループ」を防ぎ、スムーズな連携を実現。
4. **今後のフェーズ（Phase 3 / 4）への高い拡張性**:
   - **Phase 3（ファイル保存）**: Controller に `requestSave()` を実装し、Model に `saveStatus` を持たせるだけで自然に拡張可能。
   - **Phase 4（AI静的解析・ノイズ折りたたみ・A/R/E レビュー）**: `DiffSessionModel` に Hunk ごとの `isNoise` や `riskLevel`, `status` (`accepted`/`rejected`) のドメインロジックを追加し、Controller に `handleAccept()` / `handleReject()` を定義するだけで View 側の責務を増やさずに機能追加が可能。
