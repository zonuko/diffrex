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
import { setupGlobalKeybindings } from "./controller/keymap.ts";
import { Header } from "./components/Header.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { DiffView } from "./components/DiffView.tsx";
import { DirectoryTreeView } from "./components/DirectoryTreeView.tsx";
import { ThreeWayDiffView } from "./components/ThreeWayDiffView.tsx";
import { ImageDiffView } from "./components/ImageDiffView.tsx";
import { CsvDiffView } from "./components/CsvDiffView.tsx";
import { WelcomeView } from "./components/WelcomeView.tsx";
import { useModel } from "./hooks/use_model.ts";
import type { DiffSessionData } from "../core/types.ts";

export interface AppProps {
  model?: DiffSessionModel;
  controller?: DiffController;
  dirModel?: DirectoryDiffModel;
  dirController?: DirectoryController;
  threeWayModel?: ThreeWaySessionModel;
  threeWayController?: ThreeWayController;
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

  const dirModel = useMemo(
    () => propDirModel ?? new DirectoryDiffModel(),
    [propDirModel],
  );
  const dirController = useMemo(
    () =>
      propDirController ??
        new DirectoryController(dirModel, diffModel, diffController),
    [propDirController, dirModel, diffModel, diffController],
  );

  dirController.setDiffController(diffController);

  useModel(diffModel);
  useModel(dirModel);
  useModel(threeWayModel);

  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // 通信接続ライフサイクル
  useEffect(() => {
    const cleanup = dirController.connectWebSocket();
    return cleanup;
  }, [dirController]);

  // 3-Way セッションの同期リスナー
  useEffect(() => {
    if (diffModel.session && diffModel.session.mode === "3way") {
      threeWayModel.setSession(diffModel.session);
    }
  }, [diffModel.session]);

  // グローバルキーバインド
  useEffect(() => {
    if (diffModel.session?.mode === "3way") {
      return setupGlobalKeybindings(threeWayController);
    }
    return setupGlobalKeybindings(diffController);
  }, [diffController, threeWayController, diffModel.session?.mode]);

  // 自動セッションスナップショット保存 (B6-03)
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
  }, [
    diffModel.session,
    diffModel.isDirty,
    dirModel.dirSession,
    dirController,
  ]);

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

  let contentNode = <WelcomeView controller={dirController} />;

  // 1. 3-Way マージモードの場合
  if (diffModel.session?.mode === "3way" && threeWayModel.session) {
    contentNode = (
      <div class="app-container">
        <Header model={diffModel} controller={diffController} />
        <main class="app-main-diff">
          <ThreeWayDiffView
            model={threeWayModel}
            controller={threeWayController}
          />
        </main>
        <StatusBar model={diffModel} />
      </div>
    );
  } else if (dirModel.dirSession) {
    // 2. ディレクトリモードの場合
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
  } else if (diffModel.session) {
    // 3. 単一ファイル 2-Way Diff / Image Diff / CSV Diff モードの場合
    contentNode = (
      <div class="app-container">
        <Header model={diffModel} controller={diffController} />

        <main class="app-main-diff">
          <MainContent
            session={diffModel.session}
            model={diffModel}
            controller={diffController}
          />
        </main>

        <StatusBar model={diffModel} />
      </div>
    );
  }

  return (
    <>
      {contentNode}
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
    </>
  );
}
