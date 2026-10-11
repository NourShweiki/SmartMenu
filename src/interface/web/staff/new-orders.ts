/**
 * Which orders are NEW to this screen since the last look: the ones that get the sound and the notice.
 *
 * `seen` is everything this screen has already shown (null = the screen has only just opened: what is there now is
 * the starting point, not news). An order is announced once: it stays in `seen` after it moves on or leaves the
 * queue, so it can never ring again.
 */
export function arrivals(seen: ReadonlySet<string> | null, current: readonly string[]): { arrived: string[]; seen: Set<string> } {
  const next = new Set(seen ?? []);
  const arrived: string[] = [];
  for (const id of current) {
    if (!next.has(id)) {
      next.add(id);
      if (seen !== null) arrived.push(id);
    }
  }
  return { arrived, seen: next };
}
