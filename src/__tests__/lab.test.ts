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

import { balanceParts, isDiscovery, leftWeights, MAX_TILT, tiltOf } from '../modes/seesaw/physics';
import { balancePairs, buildQuestion, decisionValue, validateQuestion } from '../core/engine/questions';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';

describe('v2.3 シーソー', () => {
  it('釣り合えば水平、重い方へ傾き、傾きには上限がある', () => {
    expect(tiltOf([8], [5, 3])).toBe(0);
    expect(tiltOf([8], [5])).toBeLessThan(0);
    expect(tiltOf([5], [8])).toBeGreaterThan(0);
    expect(Math.abs(tiltOf([1], [10, 10]))).toBe(MAX_TILT);
  });

  it('本課題: 全組み合わせで、正しい重りだけが釣り合い、範囲検証を通る', () => {
    for (const [t, c] of balancePairs()) {
      const q = buildQuestion('balance', [t, c], 'mode_f_seesaw', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
      expect(validateQuestion(q)).toEqual([]);
      const left = leftWeights(t);
      expect(left.every((w) => w >= 1 && w <= 10)).toBe(true);
      const x = decisionValue(q);
      expect(tiltOf(left, [c, x])).toBe(0);
      for (const d of q.distractors) expect(tiltOf(left, [c, d])).not.toBe(0);
    }
  });

  it('図鑑の釣り合いは左右を入れかえても同じ記録', () => {
    expect(balanceParts([8], [5, 3])).toEqual(balanceParts([3, 5], [8]));
    expect(balanceParts([8], [5, 3])).toEqual([8, 0, 5, 3]);
    expect(isDiscovery([8], [5, 3])).toBe(true);
    expect(isDiscovery([4], [4])).toBe(false);
    expect(isDiscovery([4], [])).toBe(false);
  });
});
