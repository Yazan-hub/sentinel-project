// What this revision actually did — the one 5D/6D number worth putting on a publish.
//
// Sentinel's standing doctrine is that 4D/5D/6D are thin DERIVATIONS off the shared snapshot spine,
// never products Sentinel owns. This module holds that line: it prices a diff that already exists,
// at rate and factor tables it does not author, and it refuses to state a figure without also
// stating whose numbers produced it. The moment a reader cannot see the basis, an indicative
// ballpark starts being quoted as a cost plan — and that is the failure mode of every 5D tool here.
//
// Pure: no I/O. cde-store composes it with the snapshot reads.

const round = (n, dp = 0) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

/** kg → t once the number is big enough that kilograms stop being readable. */
export function formatCarbon(kg) {
  const v = Number(kg) || 0;
  return Math.abs(v) >= 1000 ? `${round(v / 1000, 1)} t` : `${round(v)} kg`;
}

export function formatMoney(amount, currency) {
  const v = Number(amount) || 0;
  const a = Math.abs(v);
  const n = a >= 1_000_000 ? `${round(v / 1_000_000, 2)}M` : a >= 1000 ? `${round(v / 1000, 1)}k` : `${round(v)}`;
  return `${n} ${currency || ""}`.trim();
}

const signed = (n, fmt) => `${(Number(n) || 0) > 0 ? "+" : ""}${fmt}`;

/**
 * One sentence a coordinator can read, plus the basis that keeps it honest.
 * `churn` is surfaced whenever the gross move dwarfs the net one: offsetting swaps move real money
 * and real carbon that a bottom line hides completely.
 */
export function deltaHeadline(summary, cost, carbon, basis = {}) {
  const parts = [];
  const s = summary || {};
  parts.push(`${s.added || 0} added, ${s.deleted || 0} removed, ${s.changed || 0} changed`);
  if (cost) parts.push(`${signed(cost.net, formatMoney(cost.net, basis.currency))}`);
  if (carbon) parts.push(`${signed(carbon.net, formatCarbon(carbon.net))} CO₂e`);
  const headline = `This revision: ${parts.join(" · ")}.`;

  const notes = [];
  const churny = (net, gross) => gross > 0 && Math.abs(net) * 4 < gross;
  if (cost && churny(cost.net, cost.gross))
    notes.push(`${formatMoney(cost.gross, basis.currency)} of budget churned to move the bottom line by ${formatMoney(cost.net, basis.currency)} — offsetting changes the net figure hides.`);
  if (carbon && churny(carbon.net, carbon.gross))
    notes.push(`${formatCarbon(carbon.gross)} CO₂e churned for a net move of ${formatCarbon(carbon.net)}.`);
  if (!s.added && !s.deleted && !s.changed) notes.push("No element changed between these revisions.");

  return {
    headline,
    notes,
    // Never a bare number: the reader is told whose rates and whose factors produced it, every time.
    basis: {
      currency: basis.currency ?? null,
      rates: basis.rates ?? "bridge default rate table",
      carbon_factors: basis.carbon_factors ?? "bridge default carbon factors",
      caveat: "Indicative only — derived from the model's own quantities at reference rates and factors. Replace both with the project's cost plan and its EPD/EC3 data before this figure leaves the room.",
    },
  };
}
