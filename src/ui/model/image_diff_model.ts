/**
 * 画像比較の MVC モデル（ImageDiffModel: Smalltalk-80 スタイル）。
 */
import type { ImageTarget } from "../../core/types.ts";

export type ImageViewMode = "2up" | "swipe" | "onion" | "diff";

export interface ImageDiffState {
  viewMode: ImageViewMode;
  zoom: number; // 0.1 ~ 8.0
  panX: number;
  panY: number;
  sliderPos: number; // 0 ~ 100 (%)
  onionOpacity: number; // 0 ~ 100 (%)
  tolerance: number; // 0 ~ 100 (RGB tolerance)
  leftImage: ImageTarget;
  rightImage: ImageTarget;
}

export class ImageDiffModel {
  private state: ImageDiffState;
  private listeners: Set<() => void> = new Set();

  constructor(leftImage: ImageTarget, rightImage: ImageTarget) {
    this.state = {
      viewMode: "swipe",
      zoom: 1.0,
      panX: 0,
      panY: 0,
      sliderPos: 50,
      onionOpacity: 50,
      tolerance: 5,
      leftImage,
      rightImage,
    };
  }

  public getState(): Readonly<ImageDiffState> {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public setViewMode(mode: ImageViewMode): void {
    if (this.state.viewMode !== mode) {
      this.state = { ...this.state, viewMode: mode };
      this.notify();
    }
  }

  public setZoom(zoom: number): void {
    const clamped = Math.max(0.1, Math.min(8.0, zoom));
    if (this.state.zoom !== clamped) {
      this.state = { ...this.state, zoom: clamped };
      this.notify();
    }
  }

  public resetZoomAndPan(): void {
    this.state = { ...this.state, zoom: 1.0, panX: 0, panY: 0 };
    this.notify();
  }

  public setPan(panX: number, panY: number): void {
    this.state = { ...this.state, panX, panY };
    this.notify();
  }

  public setSliderPos(pos: number): void {
    const clamped = Math.max(0, Math.min(100, pos));
    if (this.state.sliderPos !== clamped) {
      this.state = { ...this.state, sliderPos: clamped };
      this.notify();
    }
  }

  public setOnionOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(100, opacity));
    if (this.state.onionOpacity !== clamped) {
      this.state = { ...this.state, onionOpacity: clamped };
      this.notify();
    }
  }

  public setTolerance(tolerance: number): void {
    const clamped = Math.max(0, Math.min(100, tolerance));
    if (this.state.tolerance !== clamped) {
      this.state = { ...this.state, tolerance: clamped };
      this.notify();
    }
  }
}
