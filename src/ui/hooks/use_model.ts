/**
 * Preact コンポーネントが Model (Observable) を購読するためのカスタムフック。
 */

import { useEffect, useState } from "preact/hooks";
import type { Observable } from "../model/observable.ts";

/**
 * Model の変更通知を受け取ってコンポーネントを再描画する。
 * どうやってコンポーネントが再描画されるかというと、useEffect内でsetTickを呼び出すことで、
 * Stateが更新され、再描画される。しかしこれだと、Modelに変更があっても、
 * setTickが呼ばれないと再描画されない。そこで、Modelにsubscribeメソッドを実装し、
 * Modelが変更されたときに、subscribeメソッドを呼び出すことで、Stateが更新され、
 * 再描画される。
 */
export function useModel<T extends Observable<T>>(model: T): T {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = model.subscribe(() => {
      setTick((tick) => tick + 1);
    });
    return unsubscribe;
  }, [model]);

  return model;
}
