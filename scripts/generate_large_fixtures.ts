// 5,000行パフォーマンステスト用サンプル生成
const linesBase: string[] = [];
const linesTarget: string[] = [];

for (let i = 1; i <= 5000; i++) {
  if (i % 200 === 0) {
    // 200行ごとに差分ブロック（Target で変更）
    linesBase.push(`export function func_${i}(arg: number): number {`);
    linesBase.push(`  // Base version ${i}`);
    linesBase.push(`  return arg * 2;`);
    linesBase.push(`}`);

    linesTarget.push(
      `export function func_${i}(arg: number, extra: number = 0): number {`,
    );
    linesTarget.push(`  // Target version ${i} (modified by AI)`);
    linesTarget.push(`  return (arg * 2) + extra;`);
    linesTarget.push(`}`);
  } else {
    linesBase.push(`export const VALUE_${i} = ${i};`);
    linesTarget.push(`export const VALUE_${i} = ${i};`);
  }
}

await Deno.writeTextFile(
  "tests/fixtures/large_base.ts",
  linesBase.join("\n") + "\n",
);
await Deno.writeTextFile(
  "tests/fixtures/large_target.ts",
  linesTarget.join("\n") + "\n",
);
console.log(
  `Generated large files: base=${linesBase.length} lines, target=${linesTarget.length} lines`,
);
