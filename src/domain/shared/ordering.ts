export type Direction = "up" | "down";

/**
 * Moves one entry up or down a list that is already in display order, and returns the new
 * sortOrder (0, 1, 2, …) for every entry whose value changes. Renumbering also repairs
 * duplicate or gappy sortOrders left by earlier edits. Returns [] when the move is impossible
 * (already first/last, or the id isn't in the list).
 */
export function moveInOrder<T extends { id: string; sortOrder: number }>(
  ordered: readonly T[],
  id: string,
  direction: Direction,
): { id: T["id"]; sortOrder: number }[] {
  const from = ordered.findIndex((e) => e.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) return [];

  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next.flatMap((e, index) => (e.sortOrder === index ? [] : [{ id: e.id, sortOrder: index }]));
}
