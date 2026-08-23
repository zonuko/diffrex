/**
 * 画像比較の MVC コントローラ（ImageController: Smalltalk-80 スタイル）。
 */
import type {
  ImageDiffModel,
  ImageViewMode,
} from "../model/image_diff_model.ts";

export class ImageController {
  private model: ImageDiffModel;
  private isDraggingPan = false;
  private isDraggingSlider = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(model: ImageDiffModel) {
    this.model = model;
  }

  public handleKeyDown = (e: KeyboardEvent): void => {
    // 入力フィールド内では無効
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    if (e.key === "1") {
      this.model.setViewMode("2up");
    } else if (e.key === "2") {
      this.model.setViewMode("swipe");
    } else if (e.key === "3") {
      this.model.setViewMode("onion");
    } else if (e.key === "4") {
      this.model.setViewMode("diff");
    } else if (e.key === "0") {
      this.model.resetZoomAndPan();
    } else if (e.key === "+" || e.key === "=") {
      const current = this.model.getState().zoom;
      this.model.setZoom(current * 1.2);
    } else if (e.key === "-" || e.key === "_") {
      const current = this.model.getState().zoom;
      this.model.setZoom(current / 1.2);
    }
  };

  public handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const current = this.model.getState().zoom;
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    this.model.setZoom(current * factor);
  };

  public handlePanMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 || e.button === 1) { // 左クリックまたは中クリック
      this.isDraggingPan = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  };

  public handlePanMouseMove = (e: MouseEvent): void => {
    if (!this.isDraggingPan) return;
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    const state = this.model.getState();
    this.model.setPan(state.panX + dx, state.panY + dy);
  };

  public handlePanMouseUp = (): void => {
    this.isDraggingPan = false;
  };

  public handleSliderMouseDown = (e: MouseEvent): void => {
    e.stopPropagation();
    this.isDraggingSlider = true;
  };

  public handleSliderMouseMove = (
    e: MouseEvent,
    containerRect: DOMRect,
  ): void => {
    if (!this.isDraggingSlider) return;
    const relativeX = e.clientX - containerRect.left;
    const pct = (relativeX / containerRect.width) * 100;
    this.model.setSliderPos(pct);
  };

  public handleSliderMouseUp = (): void => {
    this.isDraggingSlider = false;
  };

  public setMode(mode: ImageViewMode): void {
    this.model.setViewMode(mode);
  }

  public setZoom(zoom: number): void {
    this.model.setZoom(zoom);
  }

  public resetZoom(): void {
    this.model.resetZoomAndPan();
  }

  public setSliderPos(pos: number): void {
    this.model.setSliderPos(pos);
  }

  public setOnionOpacity(opacity: number): void {
    this.model.setOnionOpacity(opacity);
  }

  public setTolerance(tol: number): void {
    this.model.setTolerance(tol);
  }
}
