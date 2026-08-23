/**
 * ピュア TypeScript による型安全な Observer / Observable 基盤。
 * 外部ライブラリは一切使用しない。
 */

export type Observer<T> = (value: T) => void;
export type Unsubscribe = () => void;

/**
 * 汎用 Observable クラス (Subject)
 */
export class Observable<T> {
  private observers: Set<Observer<T>> = new Set();

  /**
   * Observer を登録し、購読解除関数を返す。
   */
  subscribe(observer: Observer<T>): Unsubscribe {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  /**
   * 登録された全 Observer に変更を通知する。
   */
  notify(value: T): void {
    for (const observer of this.observers) {
      try {
        observer(value);
      } catch (err) {
        console.error("Error in Observable observer callback:", err);
      }
    }
  }

  /**
   * 登録されている Observer の数。
   */
  get observerCount(): number {
    return this.observers.size;
  }

  /**
   * 全 Observer の登録を解除する。
   */
  clear(): void {
    this.observers.clear();
  }
}
