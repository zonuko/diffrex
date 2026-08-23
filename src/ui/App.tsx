/**
 * App メインレイアウトコンポーネント (Smalltalk-80 MVC View)
 *
 * Single File Diff (2-Way), Directory Diff (2-pane), 3-Way Merge, Welcome 画面のディスパッチを行う。
 */

import { useEffect, useMemo } from "preact/hooks";
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

  // 1. 3-Way マージモードの場合
  if (diffModel.session?.mode === "3way" && threeWayModel.session) {
    return (
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
  }

  // 2. ディレクトリモードの場合
  if (dirModel.dirSession) {
    return (
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
  }

  // 3. 単一ファイル 2-Way Diff / Image Diff / CSV Diff モードの場合
  if (diffModel.session) {
    return (
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

  // 4. 引数なし起動 (Welcome 画面)
  return <WelcomeView controller={dirController} />;
}
