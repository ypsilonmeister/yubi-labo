// ポリライン幾何ユーティリティ。迷路の通路判定・弧長パラメータ計算に使う。

export interface PathProjection {
  dist: number; // ポリラインへの最短距離
  s: number; // 弧長パラメータ 0-1
  x: number; // 最近傍点
  y: number;
}

export class PolylinePath {
  readonly points: [number, number][];
  private cumLen: number[]; // 各頂点までの累積弧長
  readonly totalLen: number;

  constructor(points: [number, number][]) {
    this.points = points;
    this.cumLen = [0];
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      acc += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      this.cumLen.push(acc);
    }
    this.totalLen = acc;
  }

  // 点をポリラインへ射影し、最短距離と弧長パラメータを返す
  project(px: number, py: number): PathProjection {
    let best: PathProjection = { dist: Infinity, s: 0, x: this.points[0][0], y: this.points[0][1] };
    for (let i = 1; i < this.points.length; i++) {
      const [ax, ay] = this.points[i - 1];
      const [bx, by] = this.points[i];
      const dx = bx - ax;
      const dy = by - ay;
      const segLen2 = dx * dx + dy * dy;
      const t = segLen2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLen2));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const d = Math.hypot(px - qx, py - qy);
      if (d < best.dist) {
        const segLen = Math.sqrt(segLen2);
        best = {
          dist: d,
          s: this.totalLen === 0 ? 0 : (this.cumLen[i - 1] + t * segLen) / this.totalLen,
          x: qx,
          y: qy,
        };
      }
    }
    return best;
  }

  // 弧長パラメータ s (0-1) 上の点を返す
  pointAt(s: number): [number, number] {
    const target = Math.max(0, Math.min(1, s)) * this.totalLen;
    for (let i = 1; i < this.points.length; i++) {
      if (this.cumLen[i] >= target) {
        const segLen = this.cumLen[i] - this.cumLen[i - 1];
        const t = segLen === 0 ? 0 : (target - this.cumLen[i - 1]) / segLen;
        const [ax, ay] = this.points[i - 1];
        const [bx, by] = this.points[i];
        return [ax + t * (bx - ax), ay + t * (by - ay)];
      }
    }
    return this.points[this.points.length - 1];
  }

  get start(): [number, number] {
    return this.points[0];
  }

  get goal(): [number, number] {
    return this.points[this.points.length - 1];
  }
}
