// Rename 検知テスト用 Base: 変数 x, y を使用

export function calculateDistance(x: number, y: number): number {
  const xSquared = x * x;
  const ySquared = y * y;
  const sum = xSquared + ySquared;
  return Math.sqrt(sum);
}
