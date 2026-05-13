import type { Snapshot } from './components/Gauges';

/**
 * Logarithmic-decay aggregation.
 *
 * Returns a list where:
 *  - the last `n` snapshots are kept as-is (the freshest tail);
 *  - the `n` snapshots before them are merged into one averaged row;
 *  - the `2n` snapshots before that — into one row;
 *  - the `4n` snapshots before that — into one row;
 *  - and so on, doubling each step.
 *
 * Each averaged row carries the timestamp of its newest underlying
 * snapshot and a `count` of how many snapshots were merged into it.
 *
 * Output is ordered oldest -> newest, so it can be appended to a DOM
 * list and the latest row stays at the bottom.
 */
export function aggregateSnapshots(snapshots: Snapshot[], n: number): Snapshot[] {
  if (n < 1) throw new Error(`aggregation N must be >= 1, got ${n}`);
  const K = snapshots.length;
  if (K === 0) return [];

  const rawCount = Math.min(n, K);
  const rawStart = K - rawCount;

  const buckets: Snapshot[] = [];
  let bucketEnd = rawStart;
  let bucketSize = n;
  while (bucketEnd > 0) {
    const bucketStart = Math.max(0, bucketEnd - bucketSize);
    buckets.push(averageSnapshots(snapshots.slice(bucketStart, bucketEnd)));
    bucketEnd = bucketStart;
    bucketSize *= 2;
  }

  const out: Snapshot[] = [];
  for (let i = buckets.length - 1; i >= 0; i--) out.push(buckets[i]);
  for (let i = rawStart; i < K; i++) out.push(snapshots[i]);
  return out;
}

/**
 * Number of rows aggregateSnapshots would produce for the given K and N,
 * without actually doing the averaging. Used to pick N to match a row budget.
 */
export function aggregatedRowCount(K: number, n: number): number {
  if (K <= 0 || n <= 0) return 0;
  const raw = Math.min(n, K);
  let remaining = K - raw;
  let bucketSize = n;
  let rows = raw;
  while (remaining > 0) {
    rows++;
    remaining -= Math.min(bucketSize, remaining);
    bucketSize *= 2;
  }
  return rows;
}

/**
 * Pick the largest N such that aggregatedRowCount(K, N) <= targetRows.
 * If K is already <= targetRows, returns K (no aggregation needed).
 */
export function pickAggregationN(K: number, targetRows: number): number {
  if (K <= 0) return 1;
  if (targetRows <= 0) return 1;
  if (K <= targetRows) return K;
  let lo = 1;
  let hi = targetRows; // raw tail can't exceed the budget
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (aggregatedRowCount(K, mid) <= targetRows) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

function averageSnapshots(bucket: Snapshot[]): Snapshot {
  if (bucket.length === 1) return bucket[0];
  const N = bucket[0].raw.length;
  const sums = new Float64Array(N);
  let totalCount = 0;
  for (const s of bucket) {
    const w = s.count ?? 1;
    totalCount += w;
    for (let i = 0; i < N; i++) sums[i] += s.raw[i] * w;
  }
  const avg = new Uint16Array(N);
  for (let i = 0; i < N; i++) avg[i] = Math.round(sums[i] / totalCount);
  return {
    ts: bucket[bucket.length - 1].ts,
    raw: avg,
    count: totalCount,
  };
}
