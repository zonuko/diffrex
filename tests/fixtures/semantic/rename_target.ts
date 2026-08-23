// Rename 検知テスト用 Target: 変数 x -> deltaX, y -> deltaY に一括リネーム

export function calculateDistance(deltaX: number, deltaY: number): number {
  const xSquared = deltaX * deltaX;
  const ySquared = deltaY * deltaY;
  const sum = xSquared + ySquared;
  return Math.sqrt(sum);
}
