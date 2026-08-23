/**
 * 画像比較ビューコンポーネント（ImageDiffView）。
 * 2-Up（並列）、Swipe（スライダー）、Onion Skin（透過）、Difference（Canvas ピクセル差分）を提供。
 */
import { useEffect, useRef, useState } from "preact/hooks";
import type { ImageDiffModel } from "../model/image_diff_model.ts";
import type { ImageController } from "../controller/image_controller.ts";

export interface ImageDiffViewProps {
  model: ImageDiffModel;
  controller: ImageController;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImageDiffView({ model, controller }: ImageDiffViewProps) {
  const [state, setState] = useState(model.getState());
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unsubscribe = model.subscribe(() => {
      setState(model.getState());
    });
    return unsubscribe;
  }, [model]);

  // キーボードイベントの登録
  useEffect(() => {
    globalThis.addEventListener("keydown", controller.handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", controller.handleKeyDown);
    };
  }, [controller]);

  // Difference モード用ピクセル差分 Canvas レンダリング
  useEffect(() => {
    if (state.viewMode !== "diff" || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imgLeft = new Image();
    const imgRight = new Image();

    let loadedCount = 0;
    const onLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        const w = Math.max(
          imgLeft.naturalWidth || 1,
          imgRight.naturalWidth || 1,
        );
        const h = Math.max(
          imgLeft.naturalHeight || 1,
          imgRight.naturalHeight || 1,
        );

        canvas.width = w;
        canvas.height = h;

        // 一時 canvas で Left と Right の ImageData を取得
        const tempCanvas1 = document.createElement("canvas");
        tempCanvas1.width = w;
        tempCanvas1.height = h;
        const c1 = tempCanvas1.getContext("2d")!;
        c1.drawImage(imgLeft, 0, 0);
        const data1 = c1.getImageData(0, 0, w, h);

        const tempCanvas2 = document.createElement("canvas");
        tempCanvas2.width = w;
        tempCanvas2.height = h;
        const c2 = tempCanvas2.getContext("2d")!;
        c2.drawImage(imgRight, 0, 0);
        const data2 = c2.getImageData(0, 0, w, h);

        const diffData = ctx.createImageData(w, h);
        const tol = (state.tolerance / 100) * 255;

        let diffPixelCount = 0;
        const len = data1.data.length;

        for (let i = 0; i < len; i += 4) {
          const r1 = data1.data[i];
          const g1 = data1.data[i + 1];
          const b1 = data1.data[i + 2];
          const a1 = data1.data[i + 3];

          const r2 = data2.data[i];
          const g2 = data2.data[i + 1];
          const b2 = data2.data[i + 2];
          const a2 = data2.data[i + 3];

          const diffR = Math.abs(r1 - r2);
          const diffG = Math.abs(g1 - g2);
          const diffB = Math.abs(b1 - b2);
          const diffA = Math.abs(a1 - a2);

          const maxDiff = Math.max(diffR, diffG, diffB, diffA);

          if (maxDiff > tol) {
            // 差分ピクセル: 鮮やかなマゼンタ/レッド (#ff0055)
            diffData.data[i] = 255;
            diffData.data[i + 1] = 0;
            diffData.data[i + 2] = 85;
            diffData.data[i + 3] = 255;
            diffPixelCount++;
          } else {
            // 一致ピクセル: 背景を淡いグレースケール化
            const gray = (r2 * 0.299 + g2 * 0.587 + b2 * 0.114) * 0.3;
            diffData.data[i] = gray;
            diffData.data[i + 1] = gray;
            diffData.data[i + 2] = gray;
            diffData.data[i + 3] = Math.max(a1, a2) ? 180 : 0;
          }
        }

        ctx.putImageData(diffData, 0, 0);
      }
    };

    imgLeft.crossOrigin = "anonymous";
    imgRight.crossOrigin = "anonymous";
    imgLeft.onload = onLoaded;
    imgRight.onload = onLoaded;
    imgLeft.src = state.leftImage.dataUrl;
    imgRight.src = state.rightImage.dataUrl;
  }, [
    state.viewMode,
    state.tolerance,
    state.leftImage.dataUrl,
    state.rightImage.dataUrl,
  ]);

  const sizeDiffPct = state.leftImage.sizeBytes > 0
    ? (((state.rightImage.sizeBytes - state.leftImage.sizeBytes) /
      state.leftImage.sizeBytes) * 100).toFixed(1)
    : "0";

  return (
    <div className="image-diff-container">
      {/* ツールバー */}
      <div className="image-diff-toolbar">
        <div className="image-toolbar-group">
          <button
            type="button"
            className={`btn-mode ${state.viewMode === "2up" ? "active" : ""}`}
            onClick={() => controller.setMode("2up")}
            title="2-Up: 左右並列表示 (1)"
          >
            2-Up
          </button>
          <button
            type="button"
            className={`btn-mode ${state.viewMode === "swipe" ? "active" : ""}`}
            onClick={() => controller.setMode("swipe")}
            title="Swipe: スプリットスライダー (2)"
          >
            Swipe
          </button>
          <button
            type="button"
            className={`btn-mode ${state.viewMode === "onion" ? "active" : ""}`}
            onClick={() => controller.setMode("onion")}
            title="Onion Skin: 透過ブレンド (3)"
          >
            Onion Skin
          </button>
          <button
            type="button"
            className={`btn-mode ${state.viewMode === "diff" ? "active" : ""}`}
            onClick={() => controller.setMode("diff")}
            title="Difference: ピクセル差分ハイライト (4)"
          >
            Difference
          </button>
        </div>

        {/* モード別スライダー */}
        {state.viewMode === "onion" && (
          <div className="image-toolbar-control">
            <span className="control-label">
              Opacity: {state.onionOpacity}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={state.onionOpacity}
              onInput={(e) =>
                controller.setOnionOpacity(
                  Number((e.target as HTMLInputElement).value),
                )}
            />
          </div>
        )}

        {state.viewMode === "diff" && (
          <div className="image-toolbar-control">
            <span className="control-label">Tolerance: {state.tolerance}%</span>
            <input
              type="range"
              min="0"
              max="50"
              value={state.tolerance}
              onInput={(e) =>
                controller.setTolerance(
                  Number((e.target as HTMLInputElement).value),
                )}
            />
          </div>
        )}

        {/* ズーム操作 */}
        <div className="image-toolbar-group zoom-group">
          <button
            type="button"
            className="btn-tool"
            onClick={() => controller.setZoom(state.zoom / 1.2)}
            title="Zoom Out (-)"
          >
            -
          </button>
          <span className="zoom-text">{Math.round(state.zoom * 100)}%</span>
          <button
            type="button"
            className="btn-tool"
            onClick={() => controller.setZoom(state.zoom * 1.2)}
            title="Zoom In (+)"
          >
            +
          </button>
          <button
            type="button"
            className="btn-tool"
            onClick={() => controller.resetZoom()}
            title="Reset Zoom (0)"
          >
            Reset
          </button>
        </div>

        {/* メタデータバッジ */}
        <div className="image-metadata-badge">
          <span className="meta-left">
            Base: {state.leftImage.width
              ? `${state.leftImage.width}x${state.leftImage.height}`
              : "SVG/Img"} ({formatBytes(state.leftImage.sizeBytes)})
          </span>
          <span className="meta-sep">→</span>
          <span className="meta-right">
            Target: {state.rightImage.width
              ? `${state.rightImage.width}x${state.rightImage.height}`
              : "SVG/Img"} ({formatBytes(state.rightImage.sizeBytes)}{" "}
            <span className={Number(sizeDiffPct) > 0 ? "size-inc" : "size-dec"}>
              {Number(sizeDiffPct) >= 0
                ? `+${sizeDiffPct}%`
                : `${sizeDiffPct}%`}
            </span>
            )
          </span>
        </div>
      </div>

      {/* メイン表示領域 */}
      <div
        ref={containerRef}
        className="image-diff-viewport"
        onWheel={controller.handleWheel}
        onMouseDown={controller.handlePanMouseDown}
        onMouseMove={(e) => {
          controller.handlePanMouseMove(e);
          if (containerRef.current && state.viewMode === "swipe") {
            controller.handleSliderMouseMove(
              e,
              containerRef.current.getBoundingClientRect(),
            );
          }
        }}
        onMouseUp={() => {
          controller.handlePanMouseUp();
          controller.handleSliderMouseUp();
        }}
        onMouseLeave={() => {
          controller.handlePanMouseUp();
          controller.handleSliderMouseUp();
        }}
      >
        <div
          className="image-diff-canvas-wrapper"
          style={{
            transform:
              `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`,
          }}
        >
          {/* 2-Up モード */}
          {state.viewMode === "2up" && (
            <div className="image-2up-container">
              <div className="image-pane image-pane-left">
                <div className="pane-header">Base (Left)</div>
                <div className="image-box">
                  <img
                    src={state.leftImage.dataUrl}
                    alt="Base"
                    draggable={false}
                  />
                </div>
              </div>
              <div className="image-pane image-pane-right">
                <div className="pane-header">Target (Right)</div>
                <div className="image-box">
                  <img
                    src={state.rightImage.dataUrl}
                    alt="Target"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Swipe モード */}
          {state.viewMode === "swipe" && (
            <div className="image-swipe-container">
              {/* 下層: Right (Target) */}
              <div className="image-swipe-underlay">
                <img
                  src={state.rightImage.dataUrl}
                  alt="Target"
                  draggable={false}
                />
              </div>
              {/* 上層: Left (Base) クリップ表示 */}
              <div
                className="image-swipe-overlay"
                style={{
                  clipPath:
                    `polygon(0 0, ${state.sliderPos}% 0, ${state.sliderPos}% 100%, 0 100%)`,
                }}
              >
                <img
                  src={state.leftImage.dataUrl}
                  alt="Base"
                  draggable={false}
                />
              </div>
              {/* スプリッターバー */}
              <div
                className="image-swipe-divider"
                style={{ left: `${state.sliderPos}%` }}
                onMouseDown={controller.handleSliderMouseDown}
              >
                <div className="divider-handle">◀ ▶</div>
              </div>
            </div>
          )}

          {/* Onion Skin モード */}
          {state.viewMode === "onion" && (
            <div className="image-onion-container">
              <div className="image-onion-underlay">
                <img
                  src={state.leftImage.dataUrl}
                  alt="Base"
                  draggable={false}
                />
              </div>
              <div
                className="image-onion-overlay"
                style={{ opacity: state.onionOpacity / 100 }}
              >
                <img
                  src={state.rightImage.dataUrl}
                  alt="Target"
                  draggable={false}
                />
              </div>
            </div>
          )}

          {/* Difference モード */}
          {state.viewMode === "diff" && (
            <div className="image-diff-pixel-container">
              <canvas ref={canvasRef} className="pixel-diff-canvas" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
