export interface KeyHandlerController {
  handleKeyDown(e: KeyboardEvent): boolean | void;
}

/**
 * グローバルキーイベントリスナをアタッチする。
 */
export function setupGlobalKeybindings(
  controller: KeyHandlerController,
): () => void {
  const handler = (e: KeyboardEvent) => {
    controller.handleKeyDown(e);
  };

  globalThis.addEventListener("keydown", handler);
  return () => {
    globalThis.removeEventListener("keydown", handler);
  };
}
