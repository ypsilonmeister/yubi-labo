// v2.3 じっけんラボ（§19）の純粋関数
import { describe, expect, it } from 'vitest';
import { arrange, gaps, isPrime, isRectangle, primeFound, rowsToTry, TILE_MAX } from '../modes/tiles/scenes';

describe('v2.3 タイル・リアクター', () => {
  it('並べ方: 列ごとに上から。r = 2 は偶奇プレートと同じ（奇数は最後の列の上だけ）', () => {
    expect(arrange(7, 2).slice(-1)[0]).toEqual({ col: 3, row: 0 });
    expect(gaps(7, 2)).toEqual([{ col: 3, row: 1 }]);
    expect(gaps(12, 3)).toEqual([]);
    expect(gaps(12, 5)).toEqual([{ col: 2, row: 2 }, { col: 2, row: 3 }, { col: 2, row: 4 }]);
  });

  it('1〜36 で、6行まで試せば素数かどうかが必ず分かる', () => {
    for (let n = 1; n <= TILE_MAX; n++) {
      const composite = n >= 4 && !isPrime(n);
      // 合成数なら、試す行のどこかで長方形ができる
      if (composite) expect(rowsToTry(n).some((r) => isRectangle(n, r))).toBe(true);
      // 全部試すと、素数のときだけ石が見つかる
      expect(primeFound(n, rowsToTry(n))).toBe(isPrime(n));
      // 全部試していないうちは見つからない（2 と 3 は試す行がないので最初から）
      if (rowsToTry(n).length > 1) expect(primeFound(n, rowsToTry(n).slice(1))).toBe(false);
    }
  });

  it('長方形は2行以上・2列以上で欠けがないときだけ', () => {
    expect(isRectangle(12, 3)).toBe(true);
    expect(isRectangle(12, 5)).toBe(false);
    expect(isRectangle(12, 1)).toBe(false);
    expect(isRectangle(4, 4)).toBe(false); // 1列だけ
  });
});
