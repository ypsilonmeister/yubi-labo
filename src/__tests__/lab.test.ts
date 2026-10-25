// v2.3 じっけんラボ（§19）の純粋関数
import { describe, expect, it } from 'vitest';
import { arrange, gaps, isPrime, isRectangle, primeFound, rowsToTry, TILE_MAX } from '../core/math/tiles';

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

import { canGrow, evenSplit, fromBlocks, GROW_MAX, mergeAll, placeBlocks, powerOf, split, total } from '../modes/doubling/scenes';

describe('v2.3 ばいばいラボ', () => {
  it('まとまりで見せても数は変わらない', () => {
    for (const n of [0, 1, 9, 10, 64, 128, 1024, 59049, GROW_MAX]) expect(fromBlocks(placeBlocks(n))).toBe(n);
    expect(placeBlocks(1024)).toEqual([4, 2, 0, 1, 0]);
    expect(canGrow(65536, 2)).toBe(false);
    expect(canGrow(32768, 2)).toBe(true);
  });

  it('倍々の発見は、同じ倍率で2日以上すすんだときだけ', () => {
    expect(powerOf([2, 2, 2])).toEqual({ factor: 2, days: 3, value: 8 });
    expect(powerOf([2])).toBeNull();
    expect(powerOf([2, 3])).toBeNull();
    expect(powerOf([10, 10, 10])?.value).toBe(1000);
  });

  it('わけても合体しても合計はいつも 1。全部合体すると 1 にもどる', () => {
    let p = [1];
    p = split(p, 0);
    expect(evenSplit(p)).toBe(2);
    p = split(split(p, 0), 2);
    expect(p).toEqual([4, 4, 4, 4]);
    expect(evenSplit(p)).toBe(4);
    p = split(p, 1);
    expect(total(p)).toBeCloseTo(1);
    expect(evenSplit(p)).toBeNull();
    expect(mergeAll(p)).toEqual([1]);
    // 16 より細かくはしない
    expect(split([16], 0)).toEqual([16]);
  });
});

import { isPeriodDiscovery, lcm, meetingAt, stepTrains, TRACK, type Trains } from '../modes/trains/scenes';

describe('v2.3 ぼうの れっしゃ', () => {
  it('1歩ずつのばすと、端がそろうのは公倍数のところだけで、最初は最小公倍数', () => {
    for (let a = 1; a <= 10; a++)
      for (let b = 1; b <= 10; b++) {
        let t: Trains | null = { a, b, lenA: 0, lenB: 0 };
        const meets: number[] = [];
        for (;;) {
          t = stepTrains(t);
          if (!t) break;
          const m = meetingAt(t);
          if (m !== null) meets.push(m);
          expect(t.lenA % a).toBe(0);
          expect(t.lenB % b).toBe(0);
        }
        const L = lcm(a, b);
        const expected = Array.from({ length: Math.floor(TRACK / L) }, (_, i) => (i + 1) * L);
        expect(meets).toEqual(expected);
      }
  });

  it('図鑑に残すのは、ちがう長さでどちらも2以上のとき', () => {
    expect(isPeriodDiscovery(3, 4)).toBe(true);
    expect(isPeriodDiscovery(4, 4)).toBe(false);
    expect(isPeriodDiscovery(1, 4)).toBe(false);
  });
});
