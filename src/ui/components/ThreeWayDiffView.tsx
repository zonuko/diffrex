/**
 * ThreeWayDiffView View コンポーネント (Smalltalk-80 MVC View for 3-Way Merge)
 *
 * 3ペイン横並びレイアウト（左: Local, 中央: Result/Merged, 右: Remote）を提供し、
 * 相互スクロール同期、コンフリクトハイライト、クイック解決アクションを描画する。
 */

import { useEffect, useRef } from "preact/hooks";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { getLanguageExtension } from "../utils/language.ts";
import type { ThreeWaySessionModel } from "../model/three_way_session_model.ts";
import type { ThreeWayController } from "../controller/three_way_controller.ts";
import { useModel } from "../hooks/use_model.ts";

export interface ThreeWayDiffViewProps {
  model: ThreeWaySessionModel;
  controller: ThreeWayController;
}

export function ThreeWayDiffView(
  { model, controller }: ThreeWayDiffViewProps,
) {
  const modelState = useModel(model);
  const session = modelState.session;

  const localContainerRef = useRef<HTMLDivElement>(null);
  const mergedContainerRef = useRef<HTMLDivElement>(null);
  const remoteContainerRef = useRef<HTMLDivElement>(null);

  const localViewRef = useRef<EditorView | null>(null);
  const mergedViewRef = useRef<EditorView | null>(null);
  const remoteViewRef = useRef<EditorView | null>(null);

  const isScrollingSyncRef = useRef<boolean>(false);

  // エディタの初期化
  useEffect(() => {
    if (
      !session || !localContainerRef.current || !mergedContainerRef.current ||
      !remoteContainerRef.current
    ) {
      return;
    }

    const localPath = session.files.left.path;
    const langExt = getLanguageExtension(localPath);

    // スクロール同期リスナー
    const syncScroll = (source: EditorView) => {
      if (isScrollingSyncRef.current) return;
      isScrollingSyncRef.current = true;

      const scrollTop = source.scrollDOM.scrollTop;
      const scrollLeft = source.scrollDOM.scrollLeft;

      const targets = [
        localViewRef.current,
        mergedViewRef.current,
        remoteViewRef.current,
      ].filter((v): v is EditorView => v !== null && v !== source);

      for (const target of targets) {
        target.scrollDOM.scrollTop = scrollTop;
        target.scrollDOM.scrollLeft = scrollLeft;
      }

      requestAnimationFrame(() => {
        isScrollingSyncRef.current = false;
      });
    };

    const scrollListenerExtension = EditorView.domEventHandlers({
      scroll(_e, view) {
        syncScroll(view);
        return false;
      },
    });

    // 1. Local Editor (Left)
    const localState = EditorState.create({
      doc: session.files.left.content,
      extensions: [
        lineNumbers(),
        oneDark,
        langExt,
        EditorView.editable.of(false),
        scrollListenerExtension,
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": {
            fontFamily: "Consolas, 'Cascadia Code', monospace",
          },
        }),
      ],
    });

    const localView = new EditorView({
      state: localState,
      parent: localContainerRef.current,
    });
    localViewRef.current = localView;

    // 2. Merged Editor (Center - Editable)
    const mergedState = EditorState.create({
      doc: model.mergedContent,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        oneDark,
        langExt,
        EditorView.editable.of(!model.isReadOnly),
        scrollListenerExtension,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            model.setMergedContent(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": {
            fontFamily: "Consolas, 'Cascadia Code', monospace",
          },
        }),
      ],
    });

    const mergedView = new EditorView({
      state: mergedState,
      parent: mergedContainerRef.current,
    });
    mergedViewRef.current = mergedView;

    // 3. Remote Editor (Right)
    const remoteState = EditorState.create({
      doc: session.files.right.content,
      extensions: [
        lineNumbers(),
        oneDark,
        langExt,
        EditorView.editable.of(false),
        scrollListenerExtension,
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": {
            fontFamily: "Consolas, 'Cascadia Code', monospace",
          },
        }),
      ],
    });

    const remoteView = new EditorView({
      state: remoteState,
      parent: remoteContainerRef.current,
    });
    remoteViewRef.current = remoteView;

    return () => {
      localView.destroy();
      mergedView.destroy();
      remoteView.destroy();
      localViewRef.current = null;
      mergedViewRef.current = null;
      remoteViewRef.current = null;
    };
  }, [session?.sessionId]);

  // Model の mergedContent がボタン操作等で変わったときに中央エディタへ反映
  useEffect(() => {
    const mergedView = mergedViewRef.current;
    if (!mergedView) return;

    const currentDoc = mergedView.state.doc.toString();
    if (currentDoc !== model.mergedContent) {
      mergedView.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: model.mergedContent,
        },
      });
    }
  }, [modelState.mergedContent]);

  if (!session) {
    return (
      <div className="three-way-loading">
        3-Way セッションを読み込み中...
      </div>
    );
  }

  const activeHunk = modelState.activeHunk;

  return (
    <div className="three-way-container">
      {/* 3-Way マージ操作アクションバー */}
      <div className="three-way-action-bar">
        <div className="three-way-conflict-info">
          <span className="badge badge-warning">
            3-Way Merge
          </span>
          <span className="conflict-count-text">
            競合: {modelState.resolvedConflictsCount} /{" "}
            {modelState.totalConflicts} 解決済み
          </span>
          {modelState.remainingConflictsCount === 0
            ? (
              <span className="badge badge-success">
                全競合解決済み（保存可能）
              </span>
            )
            : (
              <span className="badge badge-danger">
                未解決: {modelState.remainingConflictsCount} 件
              </span>
            )}
        </div>

        <div className="three-way-actions">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => controller.prevConflict()}
            title="前の競合へ (K / Alt+Up)"
          >
            ▲ 前の競合
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => controller.nextConflict()}
            title="次の競合へ (J / Alt+Down)"
          >
            ▼ 次の競合
          </button>

          {activeHunk && activeHunk.type === "conflict" && (
            <div className="hunk-resolve-group">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => controller.resolveActiveHunk("local")}
                title="Local を採用 (1 / L)"
              >
                ← Accept Local
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => controller.resolveActiveHunk("remote")}
                title="Remote を採用 (2 / R)"
              >
                Accept Remote →
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => controller.resolveActiveHunk("base")}
                title="Base を採用 (3 / B)"
              >
                Reset to Base
              </button>
            </div>
          )}

          <div className="batch-actions">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => controller.resolveAll("local")}
              title="すべて Local で解決"
            >
              All Local
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => controller.resolveAll("remote")}
              title="すべて Remote で解決"
            >
              All Remote
            </button>
          </div>
        </div>
      </div>

      {/* 3ペイン エディタ領域 */}
      <div className="three-way-panes">
        {/* 左: Local (Ours) */}
        <div className="three-way-pane pane-local">
          <div className="pane-header">
            <span className="pane-tag tag-local">LOCAL (Ours)</span>
            <span className="pane-path" title={session.files.left.path}>
              {session.files.left.path}
            </span>
          </div>
          <div className="pane-editor-container" ref={localContainerRef} />
        </div>

        {/* 中央: Merged (Result / Output) */}
        <div className="three-way-pane pane-merged">
          <div className="pane-header">
            <span className="pane-tag tag-merged">
              MERGED (Result / Output)
            </span>
            <span
              className="pane-path"
              title={session.outputPath ?? session.files.left.path}
            >
              {session.outputPath ?? session.files.left.path}
            </span>
          </div>
          <div className="pane-editor-container" ref={mergedContainerRef} />
        </div>

        {/* 右: Remote (Theirs) */}
        <div className="three-way-pane pane-remote">
          <div className="pane-header">
            <span className="pane-tag tag-remote">REMOTE (Theirs)</span>
            <span className="pane-path" title={session.files.right.path}>
              {session.files.right.path}
            </span>
          </div>
          <div className="pane-editor-container" ref={remoteContainerRef} />
        </div>
      </div>
    </div>
  );
}
