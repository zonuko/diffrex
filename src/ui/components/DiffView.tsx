/**
 * DiffView View コンポーネント (Smalltalk-80 MVC View)
 *
 * CodeMirror 6 MergeView を保持・描画し、Model の activeChunkIndex 変更に応じて
 * ハイライトとスクロールを同期する。また、Noise Hunk の自動折りたたみと
 * Risk Hunk の警告バッジ / 行デコレーションを描画する。
 */

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  EditorState,
  Prec,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  gutter,
  GutterMarker,
  keymap,
  lineNumbers,
  WidgetType,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { MergeView } from "@codemirror/merge";
import { getLanguageExtension } from "../utils/language.ts";
import type { DiffSessionModel } from "../model/diff_session_model.ts";
import type { DiffController } from "../controller/diff_controller.ts";
import type { HunkAnnotation, HunkStatus } from "../../core/types.ts";
import { useModel } from "../hooks/use_model.ts";
import { StructuredToolbar } from "./StructuredToolbar.tsx";
import {
  canonicalizeJson,
  isSemanticallyEqualJson,
} from "../../core/structured/json_canonicalizer.ts";
import {
  canonicalizeYaml,
  isSemanticallyEqualYaml,
} from "../../core/structured/yaml_canonicalizer.ts";

export interface DiffViewProps {
  model: DiffSessionModel;
  controller: DiffController;
}

// Active Hunk をハイライトするための StateEffect & StateField
export const setActiveHunkEffect = StateEffect.define<
  {
    from: number;
    to: number;
  } | null
>();

const activeHunkField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setActiveHunkEffect)) {
        if (!effect.value) {
          return Decoration.none;
        }
        const { from, to } = effect.value;
        const deco = Decoration.mark({
          class: "cm-active-hunk-highlight",
        }).range(from, Math.max(from, to));
        return Decoration.set([deco]);
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 1. ノイズ折りたたみ専用 (Replace)
export const setNoiseFoldEffect = StateEffect.define<DecorationSet>();
const noiseFoldField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setNoiseFoldEffect)) {
        return effect.value;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => Prec.highest(EditorView.decorations.from(f)),
});

// 2. リスク警告バナー専用 (Widget)
export const setRiskBannerEffect = StateEffect.define<DecorationSet>();
const riskBannerField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRiskBannerEffect)) {
        return effect.value;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => Prec.high(EditorView.decorations.from(f)),
});

// 3. リスク行ボーダー専用 (Line)
export const setRiskLineEffect = StateEffect.define<DecorationSet>();
const riskLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRiskLineEffect)) {
        return effect.value;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => Prec.high(EditorView.decorations.from(f)),
});

// 4. レビュー状態ガターマーカー専用 (P4-15)
export class ReviewStatusMarker extends GutterMarker {
  constructor(readonly status: HunkStatus) {
    super();
  }

  override eq(other: ReviewStatusMarker): boolean {
    return other.status === this.status;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = `cm-review-marker cm-review-${this.status}`;
    if (this.status === "accepted") {
      span.textContent = "✓";
      span.title = "Accepted (承認済み)";
    } else if (this.status === "rejected") {
      span.textContent = "✗";
      span.title = "Rejected (拒否・復元済み)";
    } else if (this.status === "edited") {
      span.textContent = "✎";
      span.title = "Edited (手動編集済み)";
    } else {
      span.textContent = "";
      span.title = "Unreviewed (未レビュー)";
    }
    return span;
  }
}

export const setReviewGutterEffect = StateEffect.define<
  RangeSet<GutterMarker>
>();
const reviewGutterField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(markers, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setReviewGutterEffect)) {
        return effect.value;
      }
    }
    return markers.map(tr.changes);
  },
});

const reviewStatusGutter = gutter({
  class: "cm-review-gutter",
  markers: (view) => view.state.field(reviewGutterField),
  initialSpacer: () => new ReviewStatusMarker("unreviewed"),
});

// Noise 折りたたみ用 Widget (P4-08)
class NoiseFoldWidget extends WidgetType {
  constructor(
    readonly hunkId: string,
    readonly linesCount: number,
    readonly summaryTag: string,
    readonly onToggle: () => void,
  ) {
    super();
  }

  override eq(other: NoiseFoldWidget): boolean {
    return (
      other.hunkId === this.hunkId &&
      other.linesCount === this.linesCount &&
      other.summaryTag === this.summaryTag
    );
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-noise-fold-widget";
    wrap.title = "Click to expand folded noise hunk";

    const label = document.createElement("span");
    label.className = "fold-label";
    label.textContent = `[▶ ${this.linesCount} line${
      this.linesCount !== 1 ? "s" : ""
    } of formatting changes folded]`;

    if (this.summaryTag) {
      const tag = document.createElement("span");
      tag.className = "fold-tag";
      tag.textContent = this.summaryTag;
      wrap.appendChild(tag);
    }

    wrap.appendChild(label);

    const hint = document.createElement("span");
    hint.className = "fold-hint";
    hint.textContent = "Click to expand";
    wrap.appendChild(hint);

    wrap.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onToggle();
    });

    return wrap;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

// Risk 警告バッジ用 Widget (P4-10)
class RiskBannerWidget extends WidgetType {
  constructor(
    readonly riskLevel: "warning" | "danger",
    readonly summaryTag: string,
  ) {
    super();
  }

  override eq(other: RiskBannerWidget): boolean {
    return (
      other.riskLevel === this.riskLevel &&
      other.summaryTag === this.summaryTag
    );
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = `cm-risk-banner-widget ${this.riskLevel}`;

    const icon = document.createElement("span");
    icon.className = "risk-icon";
    icon.textContent = this.riskLevel === "danger"
      ? "⚠️ High Risk:"
      : "⚡ Warning:";

    const text = document.createElement("span");
    text.className = "risk-text";
    text.textContent = this.summaryTag ||
      (this.riskLevel === "danger"
        ? "Critical modification"
        : "Potential risk");

    wrap.appendChild(icon);
    wrap.appendChild(text);
    return wrap;
  }
}

/**
 * HunkAnnotation 一覧からエディタ用 foldDecos, bannerDecos, lineDecos, reviewMarkers を構築する。
 */
function buildDecorationsForEditor(
  doc: EditorState["doc"],
  hunks: readonly HunkAnnotation[],
  isLeft: boolean,
  model: DiffSessionModel,
  controller: DiffController,
): {
  foldDecos: DecorationSet;
  bannerDecos: DecorationSet;
  lineDecos: DecorationSet;
  reviewMarkers: RangeSet<GutterMarker>;
} {
  const docLines = doc.lines;
  const foldRanges: Array<{ from: number; to: number; value: Decoration }> = [];
  const bannerRanges: Array<{ from: number; to: number; value: Decoration }> =
    [];
  const lineRanges: Array<{ from: number; to: number; value: Decoration }> = [];
  const reviewPositions: Array<{ pos: number; marker: ReviewStatusMarker }> =
    [];

  const processedFoldPos = new Set<number>();
  const processedBannerPos = new Set<number>();
  const processedLinePos = new Set<number>();
  const processedReviewPos = new Set<number>();

  for (const h of hunks) {
    const startLine = isLeft ? h.lineStartLeft : h.lineStartRight;
    const endLine = isLeft ? h.lineEndLeft : h.lineEndRight;

    // 0行（相手側のみの追加/削除）の場合の判定
    const isZeroLines = startLine > endLine || startLine <= 0;
    const effectiveStart = Math.max(
      1,
      Math.min(startLine > 0 ? startLine : 1, docLines),
    );
    const effectiveEnd = isZeroLines
      ? effectiveStart
      : Math.max(effectiveStart, Math.min(endLine, docLines));

    const startLineObj = doc.line(effectiveStart);
    const endLineObj = doc.line(effectiveEnd);

    const from = startLineObj.from;
    const to = isZeroLines ? startLineObj.from : endLineObj.to;
    const linesCount = isZeroLines ? 0 : Math.max(1, endLine - startLine + 1);

    // レビュー状態ガターマーカー (P4-15)
    reviewPositions.push({
      pos: from,
      marker: new ReviewStatusMarker(h.status),
    });

    const isFolded = model.isHunkFolded(h.id, h.isNoise);

    if (isFolded && h.isNoise) {
      // 自身の側に変更行が存在する場合のみ Replace Widget で折りたたむ
      if (!isZeroLines && from <= to && !processedFoldPos.has(from)) {
        processedFoldPos.add(from);
        const foldWidget = new NoiseFoldWidget(
          h.id,
          linesCount,
          h.summaryTag || "",
          () => controller.toggleHunkFold(h.id),
        );
        foldRanges.push(
          Decoration.replace({ widget: foldWidget }).range(
            from,
            to,
          ),
        );
      }
    } else {
      // Risk バナー & 行ボーダー (P4-10)
      if (h.riskLevel === "danger" || h.riskLevel === "warning") {
        // バナー Widget (先頭位置に配置)
        if (!processedBannerPos.has(from)) {
          processedBannerPos.add(from);
          bannerRanges.push(
            Decoration.widget({
              widget: new RiskBannerWidget(h.riskLevel, h.summaryTag || ""),
              side: -1,
            }).range(from),
          );
        }

        // 該当行に左ボーダーラインデコレーション
        if (!isZeroLines) {
          const cls = h.riskLevel === "danger"
            ? "cm-risk-line-danger"
            : "cm-risk-line-warning";
          for (let l = effectiveStart; l <= effectiveEnd; l++) {
            const line = doc.line(l);
            if (!processedLinePos.has(line.from)) {
              processedLinePos.add(line.from);
              lineRanges.push(
                Decoration.line({ class: cls }).range(line.from),
              );
            }
          }
        }
      }
    }
  }

  // 明示的な昇順ソート
  foldRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  bannerRanges.sort((a, b) => a.from - b.from);
  lineRanges.sort((a, b) => a.from - b.from);
  reviewPositions.sort((a, b) => a.pos - b.pos);

  let foldDecos = Decoration.none;
  let bannerDecos = Decoration.none;
  let lineDecos = Decoration.none;
  const reviewBuilder = new RangeSetBuilder<GutterMarker>();

  for (const p of reviewPositions) {
    if (!processedReviewPos.has(p.pos)) {
      processedReviewPos.add(p.pos);
      reviewBuilder.add(p.pos, p.pos, p.marker);
    }
  }
  const reviewMarkers = reviewBuilder.finish();

  try {
    foldDecos = Decoration.set(foldRanges, true);
  } catch (err) {
    console.error("Failed to set foldDecos:", err, foldRanges);
  }

  try {
    bannerDecos = Decoration.set(bannerRanges, true);
  } catch (err) {
    console.error("Failed to set bannerDecos:", err, bannerRanges);
  }

  try {
    lineDecos = Decoration.set(lineRanges, true);
  } catch (err) {
    console.error("Failed to set lineDecos:", err, lineRanges);
  }

  return { foldDecos, bannerDecos, lineDecos, reviewMarkers };
}

export function DiffView({ model, controller }: DiffViewProps) {
  useModel(model);

  const containerRef = useRef<HTMLDivElement>(null);
  const internalMergeViewRef = useRef<MergeView | null>(null);

  const session = model.session;
  const rawLeftContent = session?.files.left.content ?? "";
  const rawRightContent = session?.files.right.content ?? "";
  const leftPath = session?.files.left.path ?? "";
  const rightPath = session?.files.right.path ?? "";
  const isRightReadOnly = Boolean(session?.files.right.readOnly);
  const ignoreWhitespace = Boolean(session?.options?.ignoreSpace);

  // JSON / YAML 判定
  const isJson = leftPath.toLowerCase().endsWith(".json") &&
    rightPath.toLowerCase().endsWith(".json");
  const isYaml = (leftPath.toLowerCase().endsWith(".yaml") ||
    leftPath.toLowerCase().endsWith(".yml")) &&
    (rightPath.toLowerCase().endsWith(".yaml") ||
      rightPath.toLowerCase().endsWith(".yml"));

  const [isCanonical, setIsCanonical] = useState(false);

  const isSemanticallyEqual = useMemo(() => {
    if (isJson) return isSemanticallyEqualJson(rawLeftContent, rawRightContent);
    if (isYaml) return isSemanticallyEqualYaml(rawLeftContent, rawRightContent);
    return false;
  }, [isJson, isYaml, rawLeftContent, rawRightContent]);

  const leftContent = useMemo(() => {
    if (!isCanonical) return rawLeftContent;
    if (isJson) return canonicalizeJson(rawLeftContent).content;
    if (isYaml) return canonicalizeYaml(rawLeftContent).content;
    return rawLeftContent;
  }, [isCanonical, isJson, isYaml, rawLeftContent]);

  const rightContent = useMemo(() => {
    if (!isCanonical) return rawRightContent;
    if (isJson) return canonicalizeJson(rawRightContent).content;
    if (isYaml) return canonicalizeYaml(rawRightContent).content;
    return rawRightContent;
  }, [isCanonical, isJson, isYaml, rawRightContent]);

  // MergeView の初期化
  useEffect(() => {
    if (!containerRef.current || !session) return;

    // 既存の MergeView があればクリア
    containerRef.current.innerHTML = "";

    const leftLang = getLanguageExtension(leftPath);
    const rightLang = getLanguageExtension(rightPath);

    const baseExtensions = [
      lineNumbers(),
      reviewGutterField,
      reviewStatusGutter,
      history(),
      EditorView.lineWrapping,
      oneDark,
      activeHunkField,
      noiseFoldField,
      riskBannerField,
      riskLineField,
      keymap.of([...defaultKeymap, ...historyKeymap]),
    ];

    // クリックやフォーカス移動・編集内容変更時に Controller に通知するリスナ
    const cursorListener = EditorView.updateListener.of((update) => {
      if (
        update.docChanged &&
        update.view === internalMergeViewRef.current?.b
      ) {
        controller.handleDocumentChanged();
      }
      if (update.selectionSet) {
        const pos = update.state.selection.main.head;
        const currentChunks = internalMergeViewRef.current?.chunks ?? [];
        const isA = update.view === internalMergeViewRef.current?.a;
        const chunkIndex = currentChunks.findIndex(
          (c: { fromA: number; toA: number; fromB: number; toB: number }) =>
            isA
              ? (pos >= c.fromA && pos <= c.toA)
              : (pos >= c.fromB && pos <= c.toB),
        );
        if (chunkIndex >= 0) {
          controller.handleCursorChunkSelect(chunkIndex);
        }
      }
    });

    const mergeView = new MergeView({
      a: {
        doc: leftContent,
        extensions: [
          ...baseExtensions,
          cursorListener,
          ...leftLang,
          EditorState.readOnly.of(true),
        ],
      },
      b: {
        doc: rightContent,
        extensions: [
          ...baseExtensions,
          cursorListener,
          ...rightLang,
          ...(isRightReadOnly ? [EditorState.readOnly.of(true)] : []),
        ],
      },
      parent: containerRef.current,
      collapseUnchanged: undefined,
      diffConfig: {
        scanLimit: 5000,
      },
    });

    internalMergeViewRef.current = mergeView;
    controller.attachMergeView(mergeView);

    // 初期デコレーションをディスパッチ
    if (session.hunks && session.hunks.length > 0) {
      const initialLeft = buildDecorationsForEditor(
        mergeView.a.state.doc,
        session.hunks,
        true,
        model,
        controller,
      );
      const initialRight = buildDecorationsForEditor(
        mergeView.b.state.doc,
        session.hunks,
        false,
        model,
        controller,
      );

      mergeView.a.dispatch({
        effects: [
          setNoiseFoldEffect.of(initialLeft.foldDecos),
          setRiskBannerEffect.of(initialLeft.bannerDecos),
          setRiskLineEffect.of(initialLeft.lineDecos),
          setReviewGutterEffect.of(initialLeft.reviewMarkers),
        ],
      });
      mergeView.b.dispatch({
        effects: [
          setNoiseFoldEffect.of(initialRight.foldDecos),
          setRiskBannerEffect.of(initialRight.bannerDecos),
          setRiskLineEffect.of(initialRight.lineDecos),
          setReviewGutterEffect.of(initialRight.reviewMarkers),
        ],
      });
    }

    const chunks = mergeView.chunks;
    controller.handleChunksUpdated(chunks, chunks.length > 0 ? 0 : -1);

    return () => {
      mergeView.destroy();
      internalMergeViewRef.current = null;
      controller.attachMergeView(null);
    };
  }, [
    session,
    leftContent,
    rightContent,
    leftPath,
    rightPath,
    isRightReadOnly,
    ignoreWhitespace,
  ]);

  // activeChunkIndex が変化したときにハイライトとスクロール同期を適用
  useEffect(() => {
    const mergeView = internalMergeViewRef.current;
    if (!mergeView) return;

    const chunks = mergeView.chunks;
    const activeIndex = model.activeChunkIndex;

    if (
      activeIndex < 0 || activeIndex >= chunks.length ||
      chunks.length === 0
    ) {
      // ハイライト解除
      mergeView.a.dispatch({
        effects: setActiveHunkEffect.of(null),
      });
      mergeView.b.dispatch({
        effects: setActiveHunkEffect.of(null),
      });
      return;
    }

    const chunk = chunks[activeIndex];

    // Left (A) と Right (B) にハイライトを適用
    mergeView.a.dispatch({
      effects: [
        setActiveHunkEffect.of({ from: chunk.fromA, to: chunk.toA }),
        EditorView.scrollIntoView(chunk.fromA, { y: "center" }),
      ],
    });

    mergeView.b.dispatch({
      effects: [
        setActiveHunkEffect.of({ from: chunk.fromB, to: chunk.toB }),
        EditorView.scrollIntoView(chunk.fromB, { y: "center" }),
      ],
    });
  }, [model.activeChunkIndex, model.chunks]);

  // Noise Fold, Risk バナー, Review ガターマーカーのデコレーション更新
  useEffect(() => {
    const mergeView = internalMergeViewRef.current;
    if (!mergeView || !session?.hunks) return;

    const left = buildDecorationsForEditor(
      mergeView.a.state.doc,
      session.hunks,
      true,
      model,
      controller,
    );

    const right = buildDecorationsForEditor(
      mergeView.b.state.doc,
      session.hunks,
      false,
      model,
      controller,
    );

    mergeView.a.dispatch({
      effects: [
        setNoiseFoldEffect.of(left.foldDecos),
        setRiskBannerEffect.of(left.bannerDecos),
        setRiskLineEffect.of(left.lineDecos),
        setReviewGutterEffect.of(left.reviewMarkers),
      ],
    });

    mergeView.b.dispatch({
      effects: [
        setNoiseFoldEffect.of(right.foldDecos),
        setRiskBannerEffect.of(right.bannerDecos),
        setRiskLineEffect.of(right.lineDecos),
        setReviewGutterEffect.of(right.reviewMarkers),
      ],
    });
  }, [
    session?.hunks,
    model.noiseFolded,
    model.expandedHunkIds,
    model.chunks,
    model.state,
  ]);

  return (
    <div class="diff-view-container">
      {(isJson || isYaml) && (
        <StructuredToolbar
          fileType={isJson ? "json" : "yaml"}
          isCanonical={isCanonical}
          isSemanticallyEqual={isSemanticallyEqual}
          onToggleCanonical={(can) => setIsCanonical(can)}
        />
      )}
      <div class="diff-view-panes-header">
        <div class="pane-title">
          <span class="pane-label">Left (Base)</span>
          <span class="pane-path">{leftPath || "base"}</span>
          <span class="badge readonly">Read-Only</span>
        </div>
        <div class="pane-title">
          <span class="pane-label">Right (Target)</span>
          <span class="pane-path">{rightPath || "target"}</span>
          <span class={`badge ${isRightReadOnly ? "readonly" : "writable"}`}>
            {isRightReadOnly ? "Read-Only" : "Writable"}
          </span>
        </div>
      </div>
      <div class="diff-view-editor-wrapper" ref={containerRef} />
    </div>
  );
}
