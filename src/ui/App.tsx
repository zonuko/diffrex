/**
 * App メインレイアウトコンポーネント (Smalltalk-80 MVC View)
 *
 * Single File Diff (2-Way), Directory Diff (2-pane), 3-Way Merge, Welcome 画面のディスパッチを行う。
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import { DiffSessionModel } from "./model/diff_session_model.ts";
import { DiffController } from "./controller/diff_controller.ts";
import { DirectoryDiffModel } from "./model/dir_diff_model.ts";
import { DirectoryController } from "./controller/dir_controller.ts";
import { ThreeWaySessionModel } from "./model/three_way_session_model.ts";
import { ThreeWayController } from "./controller/three_way_controller.ts";
import { ImageDiffModel } from "./model/image_diff_model.ts";
import { ImageController } from "./controller/image_controller.ts";
import { CsvDiffModel } from "./model/csv_diff_model.ts";
import { CsvController } from "./controller/csv_controller.ts";
import { MenuModel } from "./model/menu_model.ts";
import { MenuController } from "./controller/menu_controller.ts";
import { setupGlobalKeybindings } from "./controller/keymap.ts";
import { MenuBar } from "./components/MenuBar.tsx";
import { Header } from "./components/Header.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { DiffView } from "./components/DiffView.tsx";
import { DirectoryTreeView } from "./components/DirectoryTreeView.tsx";
import { ThreeWayDiffView } from "./components/ThreeWayDiffView.tsx";
import { ImageDiffView } from "./components/ImageDiffView.tsx";
import { CsvDiffView } from "./components/CsvDiffView.tsx";
import { WelcomeView } from "./components/WelcomeView.tsx";
import { ShortcutsModal } from "./components/ShortcutsModal.tsx";
import { AboutModal } from "./components/AboutModal.tsx";
import { ConfidenceSettingsModal } from "./components/ConfidenceSettingsModal.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { OpenSessionModal } from "./components/OpenSessionModal.tsx";
import { TabContainerModel } from "./model/tab_model.ts";
import { TabController } from "./controller/tab_controller.ts";
import { TabBar } from "./components/TabBar.tsx";
import { useModel } from "./hooks/use_model.ts";
import type { DiffSessionData } from "../core/types.ts";

export interface AppProps {
  model?: DiffSessionModel;
  controller?: DiffController;
  dirModel?: DirectoryDiffModel;
  dirController?: DirectoryController;
  threeWayModel?: ThreeWaySessionModel;
  threeWayController?: ThreeWayController;
  menuModel?: MenuModel;
  menuController?: MenuController;
  tabModel?: TabContainerModel;
  tabController?: TabController;
}

function MainContent({
  session,
  model,
  controller,
}: {
  session: DiffSessionData;
  model: DiffSessionModel;
  controller: DiffController;
}) {
  // 1. 画像比較セッションの場合
  if (session.mode === "image" && session.imageSession) {
    const imgModel = new ImageDiffModel(
      session.imageSession.left,
      session.imageSession.right,
    );
    const imgController = new ImageController(imgModel);
    return <ImageDiffView model={imgModel} controller={imgController} />;
  }

  // 2. CSV 比較セッションの場合
  if (session.mode === "csv" && session.csvDiff) {
    const csvModel = new CsvDiffModel(
      session.csvDiff,
      session.files.left.path,
      session.files.right.path,
    );
    const csvController = new CsvController(csvModel);
    return <CsvDiffView model={csvModel} controller={csvController} />;
  }

  // 3. 通常のテキスト Diff (CodeMirror 6)
  return <DiffView model={model} controller={controller} />;
}

export function App(
  {
    model: propModel,
    controller: propController,
    dirModel: propDirModel,
    dirController: propDirController,
    threeWayModel: propThreeWayModel,
    threeWayController: propThreeWayController,
    menuModel: propMenuModel,
    menuController: propMenuController,
    tabModel: propTabModel,
    tabController: propTabController,
  }: AppProps,
) {
  const diffModel = useMemo(
    () => propModel ?? new DiffSessionModel(),
    [propModel],
  );
  const diffController = useMemo(
    () => propController ?? new DiffController(diffModel),
    [propController, diffModel],
  );

  const threeWayModel = useMemo(
    () => propThreeWayModel ?? new ThreeWaySessionModel(),
    [propThreeWayModel],
  );
  const threeWayController = useMemo(
    () =>
      propThreeWayController ??
        new ThreeWayController(threeWayModel, {
          sendMessage: (msg) => diffController.sendIpcMessage(msg),
        }),
    [propThreeWayController, threeWayModel, diffController],
  );

  const tabModel = useMemo(
    () => propTabModel ?? new TabContainerModel(),
    [propTabModel],
  );
  const tabController = useMemo(
    () =>
      propTabController ??
        new TabController(tabModel, {
          onSendMessage: (msg) => diffController.sendIpcMessage(msg),
        }),
    [propTabController, tabModel, diffController],
  );

  const dirModel = useMemo(
    () => propDirModel ?? new DirectoryDiffModel(),
    [propDirModel],
  );
  const dirController = useMemo(
    () =>
      propDirController ??
        new DirectoryController(
          dirModel,
          diffModel,
          diffController,
          tabController,
        ),
    [propDirController, dirModel, diffModel, diffController, tabController],
  );

  const menuModel = useMemo(
    () => propMenuModel ?? new MenuModel(),
    [propMenuModel],
  );
  const menuController = useMemo(
    () =>
      propMenuController ??
        new MenuController(
          menuModel,
          diffModel,
          diffController,
          dirModel,
          dirController,
          threeWayModel,
          threeWayController,
          tabController,
        ),
    [
      propMenuController,
      menuModel,
      diffModel,
      diffController,
      dirModel,
      dirController,
      threeWayModel,
      threeWayController,
      tabController,
    ],
  );

  useEffect(() => {
    dirController.setDiffController(diffController);
    dirController.setTabController(tabController);
    diffController.sendIpcMessage = (msg) => dirController.sendMessage(msg);
  }, [dirController, diffController, tabController]);

  useModel(diffModel);
  useModel(dirModel);
  useModel(threeWayModel);
  useModel(menuModel);
  useModel(tabModel);

  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // 通信接続ライフサイクル
  useEffect(() => {
    const cleanup = dirController.connectWebSocket();
    return cleanup;
  }, [dirController]);

  // 初期タブ設定またはセッション到着時のタブ同期
  useEffect(() => {
    if (dirModel.dirSession) {
      tabController.openDirectorySession(
        dirModel.dirSession,
        dirModel,
        dirController,
        true,
      );
      // Welcome タブが残っていれば閉じる
      const welcome = tabModel.findTabById("welcome");
      if (welcome && tabModel.tabs.length > 1) {
        tabController.closeTabDirectly("welcome");
      }
    } else if (diffModel.session) {
      const tab = tabController.openDiffSession(diffModel.session, true);
      const welcome = tabModel.findTabById("welcome");
      if (welcome && tabModel.tabs.length > 1 && tab.id !== "welcome") {
        tabController.closeTabDirectly("welcome");
      }
    } else if (tabModel.tabs.length === 0) {
      tabController.openWelcomeTab(dirController, true);
    }
  }, [diffModel.session, dirModel.dirSession]);

  // 3-Way セッションの同期リスナー
  useEffect(() => {
    if (diffModel.session && diffModel.session.mode === "3way") {
      threeWayModel.setSession(diffModel.session);
    }
  }, [diffModel.session]);

  // セッション状態・モデル状態に応じたメニュー再構築
  useEffect(() => {
    menuController.setThreeWay(threeWayModel, threeWayController);
    menuController.setTabController(tabController);
    menuController.rebuildMenu();
  }, [
    diffModel.session,
    diffModel.isDirty,
    diffModel.mode,
    diffModel.noiseFolded,
    dirModel.dirSession,
    dirModel.selectedPath,
    dirModel.history,
    dirModel.lastSession,
    dirModel.workspaceState,
    threeWayModel.session,
    tabModel.tabs,
    tabModel.activeTabId,
    menuController,
    threeWayModel,
    threeWayController,
    tabController,
  ]);

  // ウィンドウタイトル & Dirty 状態の同期 (B14-02 & B11-06)
  useEffect(() => {
    const isDirty = tabModel.hasDirtyTabs || diffModel.isDirty;
    dirController.sendMessage({
      type: "window:set_dirty",
      isDirty,
    });
    const activeTab = tabModel.activeTab;
    const baseTitle = activeTab?.title
      ? `${activeTab.title} - Diffrex`
      : document.title.replace(/^\* /, "") || "Diffrex";

    document.title = (isDirty ? "* " : "") + baseTitle;
  }, [
    diffModel.isDirty,
    tabModel.hasDirtyTabs,
    tabModel.activeTabId,
    dirController,
  ]);

  // グローバルキーバインド (Keymap & MenuController)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const handled = menuController.handleGlobalKeyDown(e);
      if (handled) return;
    };

    globalThis.addEventListener("keydown", handleKeyDown, true);

    let unbindKeymap: (() => void) | undefined;
    if (diffModel.session?.mode === "3way") {
      unbindKeymap = setupGlobalKeybindings(threeWayController);
    } else {
      unbindKeymap = setupGlobalKeybindings(diffController);
    }

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown, true);
      if (unbindKeymap) unbindKeymap();
    };
  }, [
    diffController,
    threeWayController,
    menuController,
    diffModel.session?.mode,
  ]);

  // 自動セッションスナップショット保存 (B6-03) & ワークスペース自動保存 (B17-03: 300ms デバウンス)
  useEffect(() => {
    if (diffModel.session) {
      const s = diffModel.session;
      const hunkStatuses: Record<
        string,
        import("../core/types.ts").HunkStatus
      > = {};
      for (const hunk of s.hunks) {
        hunkStatuses[hunk.id] = hunk.status;
      }
      dirController.saveSnapshot({
        timestamp: new Date().toISOString(),
        mode: s.mode,
        leftPath: s.files.left.path,
        rightPath: s.files.right.path,
        basePath: s.files.base?.path,
        outputPath: s.outputPath,
        readOnly: s.files.right.readOnly,
        prompt: s.aiContext?.prompt,
        agent: s.aiContext?.agent,
        model: s.aiContext?.model,
        hunkStatuses,
      });
    } else if (dirModel.dirSession) {
      const ds = dirModel.dirSession;
      dirController.saveSnapshot({
        timestamp: new Date().toISOString(),
        mode: "directory",
        leftPath: ds.baseDir,
        rightPath: ds.targetDir,
        readOnly: ds.readOnly,
        prompt: ds.aiContext?.prompt,
        agent: ds.aiContext?.agent,
        model: ds.aiContext?.model,
      });
    }

    // ワークスペース状態の 300ms デバウンス自動保存 (B17-03)
    const restoreOnStartup = dirModel.workspaceState?.restoreOnStartup ?? true;
    const timer = setTimeout(() => {
      const state = tabController.snapshotWorkspace(restoreOnStartup);
      dirController.saveWorkspaceState(state);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    diffModel.session,
    diffModel.isDirty,
    dirModel.dirSession,
    dirModel.selectedPath,
    dirModel.expandedDirs,
    dirModel.workspaceState?.restoreOnStartup,
    tabModel.tabs,
    tabModel.activeTabId,
    dirController,
    tabController,
  ]);

  // アプリ終了時 / ページ離脱時の即時保存 (B17-03)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const restoreOnStartup = dirModel.workspaceState?.restoreOnStartup ??
        true;
      const state = tabController.snapshotWorkspace(restoreOnStartup);
      dirController.saveWorkspaceState(state);
    };

    globalThis.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      globalThis.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirController, tabController, dirModel.workspaceState?.restoreOnStartup]);

  // グローバルドラッグ＆ドロップ (B6-02)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsGlobalDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsGlobalDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsGlobalDragging(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length < 2) return;

      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as File & { path?: string };
        if (file.path) {
          paths.push(file.path);
        }
      }

      if (paths.length >= 2) {
        dirController.startDropSession(paths);
      }
    };

    globalThis.addEventListener("dragover", handleDragOver);
    globalThis.addEventListener("dragleave", handleDragLeave);
    globalThis.addEventListener("drop", handleDrop);

    return () => {
      globalThis.removeEventListener("dragover", handleDragOver);
      globalThis.removeEventListener("dragleave", handleDragLeave);
      globalThis.removeEventListener("drop", handleDrop);
    };
  }, [dirController]);

  const activeTab = tabModel.activeTab;

  let contentNode = <WelcomeView controller={dirController} />;

  if (activeTab?.sessionType === "directory" && dirModel.dirSession) {
    // ディレクトリモードの場合
    contentNode = (
      <div class="app-container">
        <Header model={diffModel} controller={diffController} />

        <div class="app-split-container">
          <DirectoryTreeView model={dirModel} controller={dirController} />

          <main class="dir-content-pane">
            {dirModel.isLoadingFile
              ? (
                <div class="loading-screen">
                  <span>Diff データを読み込み中...</span>
                </div>
              )
              : dirModel.fileError
              ? (
                <div class="error-screen">
                  <span>エラー: {dirModel.fileError}</span>
                </div>
              )
              : diffModel.session
              ? (
                <MainContent
                  session={diffModel.session}
                  model={diffModel}
                  controller={diffController}
                />
              )
              : (
                <div class="no-selection-screen">
                  <span>左側のツリーからファイルを選択してください</span>
                </div>
              )}
          </main>
        </div>

        <StatusBar model={diffModel} />
      </div>
    );
  } else if (
    activeTab?.sessionType === "3way" &&
    (activeTab.threeWayModel?.session || threeWayModel.session)
  ) {
    // 3-Way マージモードの場合
    const cur3WayModel = activeTab.threeWayModel ?? threeWayModel;
    const cur3WayController = activeTab.threeWayController ??
      threeWayController;
    const curDiffModel = activeTab.diffModel ?? diffModel;
    const curDiffController = activeTab.diffController ?? diffController;

    contentNode = (
      <div class="app-container">
        <Header model={curDiffModel} controller={curDiffController} />
        <main class="app-main-diff">
          <ThreeWayDiffView
            model={cur3WayModel}
            controller={cur3WayController}
          />
        </main>
        <StatusBar model={curDiffModel} />
      </div>
    );
  } else if (
    activeTab &&
    (activeTab.sessionType === "2way" ||
      activeTab.sessionType === "image" ||
      activeTab.sessionType === "csv") &&
    (activeTab.diffModel?.session || diffModel.session)
  ) {
    // 単一ファイル 2-Way Diff / Image Diff / CSV Diff モードの場合
    const curDiffModel = activeTab.diffModel ?? diffModel;
    const curDiffController = activeTab.diffController ?? diffController;
    const curSession = curDiffModel.session ?? diffModel.session!;

    contentNode = (
      <div class="app-container">
        <Header model={curDiffModel} controller={curDiffController} />

        <main class="app-main-diff">
          <MainContent
            session={curSession}
            model={curDiffModel}
            controller={curDiffController}
          />
        </main>

        <StatusBar model={curDiffModel} />
      </div>
    );
  } else if (
    activeTab?.sessionType === "welcome" ||
    tabModel.tabs.length === 0
  ) {
    contentNode = <WelcomeView controller={dirController} />;
  }

  return (
    <div class="app-root-layout">
      <MenuBar model={menuModel} controller={menuController} />
      <TabBar
        model={tabModel}
        controller={tabController}
        onNewTabClick={() => {
          menuModel.setOpenSessionModalOpen(true, "file");
        }}
      />
      <div class="app-body-area">
        {contentNode}
      </div>

      {/* モーダル群 */}
      {menuModel.isShortcutsModalOpen && <ShortcutsModal model={menuModel} />}
      {menuModel.isAboutModalOpen && <AboutModal model={menuModel} />}
      {menuModel.isConfidenceSettingsModalOpen && (
        <ConfidenceSettingsModal
          menuModel={menuModel}
          diffModel={activeTab?.diffModel ?? diffModel}
        />
      )}
      {menuModel.isCommandPaletteOpen && (
        <CommandPalette model={menuModel} controller={menuController} />
      )}
      {menuModel.isOpenSessionModalOpen && (
        <OpenSessionModal model={menuModel} controller={dirController} />
      )}

      {/* グローバルドラッグ＆ドロップ オーバーレイ */}
      {isGlobalDragging && (
        <div class="global-drop-overlay">
          <div class="global-drop-badge">
            <span class="global-drop-icon">📂</span>
            <span class="global-drop-text">
              2つのファイル/フォルダをドロップして比較を開始
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
