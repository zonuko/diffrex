# Diffrex パフォーマンス改善 & 不具合改修 TODO

本ドキュメントは、アプリ利用時に発生している「タブ・履歴が開けない」「ワークツリーが重い/開けない」「PC全体が重くなる・固まる（メモリリーク/プロセス増殖）」等のパフォーマンス問題および機能的バグを根本解決するための改修タスクリストです。

既存のロードマップ `docs/TODO.md` とは独立して、安定化・高速化・不具合修正に特化して管理します。

---

## 修正の基本ルール

1. **フェーズ順に進める**: 各タスクの受入条件（AC）を満たし、`deno task check`（251テスト以上）が常に green であることを確認しながら進める。
2. **タスク ID**: コミットメッセージや PR タイトルに `FIX-01` などの ID を付与する（例: `fix: FIX-01 FileWatcher の .git 除外と Worktree 多重作成ストームの遮断`）。
3. **安全第一**: 既存の機能（Smalltalk-80 MVC、文字コード・改行保持、ASTセマンティック解析等）を壊さない最小かつ本質的な変更とする。

---

## 検出された課題サマリー

| 課題ID | 重大度 | 事象 | 根本原因 |
| :--- | :--- | :--- | :--- |
| **ISSUE-1** | 🔴 致命的 | PC自体が激重になり固まる（メモリ/CPU/ディスク飽和） | `FileWatcher` が `.git` や `.git/worktrees` を除外しておらず、一時 Worktree 作成のたびに変更イベントが発火し、前回の Worktree を未解放のまま無限に Worktree と Git プロセスが自己増殖するストーム。 |
| **ISSUE-2** | 🔴 致命的 | タブで別のものが開けない / 最近使ったものが開けない | `dirModel.dirSession` と `diffModel.session` の状態排他不整合。一度ディレクトリを開くと `dirModel.dirSession` がクリアされず、`App.tsx` の `useEffect` でファイル比較タブが絶対に開かれない。 |
| **ISSUE-3** | 🟠 高 | ワークツリー比較が重すぎるまたは開けない | Git Worktree 比較時に Git 差分を利用せず、全ファイル（数万件）を走査して SHA-256 を直列計算している。また Worktree の一覧情報が欠落し UI セレクターが消失する。 |
| **ISSUE-4** | 🟡 中 | Myers Diff のメモリ急増とGCストール | `diff.ts`（`computeLineDiff`）で先頭・末尾の共通行トリミングを行わず、イテレーションごとに `new Map(v)` を生成して大量蓄積している。 |
| **ISSUE-5** | 🟡 中 | フォルダ比較時の直列ハッシュ計算によるブロック | `dir_diff.ts` で `mtime` と `size` が一致していても全ファイルを直列でハッシュ計算している。 |
| **ISSUE-6** | 🟡 中 | `saveSnapshot` の非デバウンス即時I/O | `App.tsx` でツリーの開閉やタブ操作のたびにデバウンス外で即時ディスク書き込みが走る。 |
| **ISSUE-7** | 🟡 中 | 3-Way マージタブで `Ctrl+S`（保存）が動作しない | メニューやキー判定でアクティブタブではなくグローバルな `diffModel.session?.mode` を参照している。 |
| **ISSUE-8** | 🟢 低 | Windows パス不一致による改行コード/BOM破壊リスク | `metadataMap` のキー正規化（小文字化・区切り文字統一）の欠落。 |
| **ISSUE-9** | 🟢 低 | 異常終了時の一時 Worktree 残骸残留 | プロセス終了時やセッション破棄時のクリーンアップ漏れ。 |

---

## 改修フェーズ & タスク一覧

### Phase 1: 致命的ループ・負荷の遮断（即効性の高い安定化）

- [x] **FIX-01: FileWatcher の内部ディレクトリ除外強化**
  - **対象**: `src/core/watcher.ts`
  - **内容**:
    - `isIgnoredWatcherFile` に `.git/**`, `.git/worktrees/**`, `node_modules/**`, `.deno/**`, `dist/**` の判定を追加。
    - Windows のパス区切り（`\`）と小文字化を考慮し、メタディレクトリ配下のイベントを確実に破棄。
  - **受入条件 (AC)**:
    - リポジトリ内で Git 操作や一時 Worktree 作成が行われても、ファイル監視イベントが誤発火しない。

- [x] **FIX-02: 一時 Worktree（temp_worktree）の二重生成・リーク防止**
  - **対象**: `src/core/git/status.ts`, `src/desktop/window.ts`
  - **内容**:
    - `buildGitDirectoryDiffSession` や `fileWatcher.onChange`, `dir:reload_request` において、新しい一時 Worktree を作成する前に必ず既存の `tempWorktreePath` を安全に解放（`cleanupTempWorktreeByPath`）する。
    - 同一ブランチ・同一 HEAD の場合は既存の一時 Worktree を再利用し、無駄な `git worktree add` を防止。
  - **受入条件 (AC)**:
    - 監視イベントやリロードが複数回連続しても、ディスク上の一時 Worktree が 1 つに保たれ、PC が重くならない。

---

### Phase 2: タブ・セッション・履歴オープンの排他正常化

- [x] **FIX-03: UI セッション状態の排他管理とクリア処理**
  - **対象**: `src/ui/controller/dir_controller.ts`, `src/ui/model/dir_diff_model.ts`, `src/ui/model/diff_session_model.ts`
  - **内容**:
    - バックエンドから `session:init`（ファイル比較）が届いた際、古いディレクトリセッション `dirModel.dirSession` を `null` にクリア。
    - バックエンドから `dir:tree_data`（ディレクトリ比較）が届いた際、古いファイル比較セッション `diffModel.session` をクリア（または非アクティブ化）。
  - **受入条件 (AC)**:
    - ディレクトリ比較を開いた後でも、メニューや Welcome 画面からファイル比較が問題なく開ける。

- [x] **FIX-04: App.tsx のタブ同期ディスパッチ修正**
  - **対象**: `src/ui/App.tsx`, `src/ui/controller/tab_controller.ts`
  - **内容**:
    - `useEffect([diffModel.session, dirModel.dirSession])` の安易な `if (dirModel.dirSession)` 優先ロジックを是正。
    - 新しいセッションデータが到着した際、現在開いているセッションタイプに関わらず、対応する新規タブを作成または既存タブを切り替える。
    - 別のディレクトリを開いた場合も、既存の `"dir-root"` タブの内容・タイトルが最新セッション情報で正しく更新される。
  - **受入条件 (AC)**:
    - ディレクトリ比較を開いている最中に、「最近使ったもの」から別のファイルやディレクトリをクリックすると、確実に新しいタブとして開く。
    - タブの「＋」ボタンからの新規オープンが正常に動作する。

- [x] **FIX-05: 3-Way マージタブおよび各種タブでの保存・メニュー判定修正**
  - **対象**: `src/ui/controller/menu_controller.ts`, `src/ui/App.tsx`
  - **内容**:
    - `rebuildMenu` や `Ctrl+S` のハンドラにおいて、グローバルモデルではなく `activeTab` のセッションタイプとモデル（`activeTab.threeWayModel`, `activeTab.diffModel`）を参照するように修正。
  - **受入条件 (AC)**:
    - 3-Way マージタブがアクティブな状態で `Ctrl+S` を押すと、正常に 3-Way マージ保存が実行される。

---

### Phase 3: Git Worktree 比較の超高速化 & 正常化

- [ ] **FIX-06: Git Worktree 比較専用の高速差分セッション生成**
  - **対象**: `src/core/git/status.ts`, `src/desktop/window.ts`
  - **内容**:
    - `parsed.worktreePath` が指定された場合、全ファイル走査（`compareDirectories`）を行わず、Git コマンド（`git diff --name-status` 等）を利用して変更されたファイルのみを特定する高速ビルダー（`buildGitWorktreeDiffSession`）を導入。
    - セッションに `worktrees` 一覧（`session.git.worktrees`）および対象 Worktree のブランチ名を正しくセット。
  - **受入条件 (AC)**:
    - 数万ファイル規模のリポジトリでも、Worktree 比較が 0.5 秒以内に開き、UI 上の Worktree セレクターが消失しない。

- [ ] **FIX-07: Worktree 比較時のファイル内容読み込み修正**
  - **対象**: `src/desktop/window.ts` (`file:diff_request`)
  - **内容**:
    - Worktree 比較時、左ペインは Worktree パス（`parsed.worktreePath`）の実体ローカルファイルを直接読み込むよう修正（不要な `git show HEAD:...` を防止）。
  - **受入条件 (AC)**:
    - Worktree 比較でツリー内のファイルをクリックした際、Worktree 側の内容が正確に表示される。

---

### Phase 4: パフォーマンス最適化 & 堅牢化

- [ ] **FIX-08: Myers Diff の高速化（共通行スキップ & Map生成削減）**
  - **対象**: `src/core/diff.ts`
  - **内容**:
    - `computeLineDiff` の前処理として、先頭および末尾の完全一致行を高速スキップする Common Prefix / Suffix Stripping を導入。
    - `trace` 配列での大量の `new Map(v)` 生成を抑制し、TypedArray または必要なスライスのみを記録する方式に改善。
  - **受入条件 (AC)**:
    - 数千行の差分比較でもメモリが跳ね上がらず、GC ストールが発生しない。

- [ ] **FIX-09: ディレクトリ比較（compareDirectories）の最適化**
  - **対象**: `src/core/dir_diff.ts`
  - **内容**:
    - `mtime`（更新日時）と `size`（ファイルサイズ）が完全に一致している通常ファイルは、SHA-256 ハッシュ計算をスキップして `identical` と判定するクイック比較を導入。
    - ファイルペア比較ループのチャンク並列化（`Promise.all`）。
  - **受入条件 (AC)**:
    - 変更のないファイルの比較が瞬時に完了し、I/O 負荷が激減する。

- [ ] **FIX-10: saveSnapshot のデバウンス統合とパス正規化**
  - **対象**: `src/ui/App.tsx`, `src/desktop/window.ts`
  - **内容**:
    - `dirController.saveSnapshot` を 300ms デバウンスタイマー内に統合し、ツリー開閉や文字入力ごとの過剰なファイル書き込みを防止。
    - Windows 環境における `metadataMap` のキーパスを `normalizeWatcherPath` で統一し、改行コードや BOM の保持を保証。
    - アプリ終了時・ウィンドウ閉鎖時の一時 Worktree 一括クリーンアップを強化。
  - **受入条件 (AC)**:
    - ツリー操作やタブ切り替えが軽快になり、一時フォルダに残骸が残らない。

---

## 進捗確認コマンド

改修作業中および各タスク完了時は、必ず以下を実行してリグレッションがないことを確認する。

```powershell
deno task check
deno test -A tests/
```
