import type { PulseCard } from "../../types";

export function pulseCardValueOptions(card: PulseCard, effects: any[] = []): number[] {
  const prismFixedZero = effects.some((e) => e?.type === "prism_fixed_zero");
  if (card.suit === "prism") {
    if (prismFixedZero) return [0];
    const out: number[] = [];
    if (card.prismRange === "6-10") {
      for (let v = 6; v <= 10; v += 1) out.push(v);
    } else {
      for (let v = 1; v <= 5; v += 1) out.push(v);
    }
    return out;
  }

  const zeroJolly = effects.find((e) => e?.type === "zero_count_as_jolly_delta");
  const base = card.value ?? 0;
  if (zeroJolly && base === 0 && Array.isArray(zeroJolly.amount) && zeroJolly.amount.length === 2) {
    const min = Number(zeroJolly.amount[0]) || 0;
    const max = Number(zeroJolly.amount[1]) || 0;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const out: number[] = [];
    for (let v = lo; v <= hi; v += 1) out.push(v);
    return out;
  }

  return [base];
}

export function bestFitTotal(valueOptionsByCard: number[][], min: number, max: number): number {
  const mid = (min + max) / 2;
  let bestTotal = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestMid = Number.POSITIVE_INFINITY;

  function recur(i: number, sum: number) {
    if (i >= valueOptionsByCard.length) {
      const dist = sum < min ? min - sum : sum > max ? sum - max : 0;
      const midDist = Math.abs(sum - mid);
      if (dist < bestDist || (dist === bestDist && midDist < bestMid)) {
        bestDist = dist;
        bestMid = midDist;
        bestTotal = sum;
      }
      return;
    }
    for (const v of valueOptionsByCard[i]!) {
      recur(i + 1, sum + v);
    }
  }

  recur(0, 0);
  return bestTotal;
}
