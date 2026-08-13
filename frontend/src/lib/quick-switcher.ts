export type QuickSwitcherNote = {
  path: string;
  title: string;
  aliases: string[];
};

export type QuickSwitcherResult =
  | { kind: "note"; note: QuickSwitcherNote; matchedTerm: string }
  | { kind: "create"; name: string };

type MatchRank = "exact" | "prefix" | "substring" | "fuzzy";

const MATCH_ORDER: Record<MatchRank, number> = {
  exact: 0,
  prefix: 1,
  substring: 2,
  fuzzy: 3,
};

export function getQuickSwitcherResults(
  notes: QuickSwitcherNote[],
  query: string,
  recentPaths: string[]
): QuickSwitcherResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    const notesByPath = new Map(notes.map((note) => [note.path, note]));
    return recentPaths.flatMap((path) => {
      const note = notesByPath.get(path);
      return note ? [{ kind: "note" as const, note, matchedTerm: note.title }] : [];
    });
  }

  const matches = notes.flatMap((note) => {
    const match = bestMatch(note, trimmedQuery);
    return match ? [{ kind: "note" as const, note, matchedTerm: match.term, rank: match.rank }] : [];
  });

  matches.sort((left, right) => {
    const rankDifference = MATCH_ORDER[left.rank] - MATCH_ORDER[right.rank];
    return rankDifference || left.note.path.localeCompare(right.note.path);
  });

  const results: QuickSwitcherResult[] = matches.map(({ note, matchedTerm }) => ({
    kind: "note",
    note,
    matchedTerm,
  }));

  if (!notes.some((note) => hasExactMatch(note, trimmedQuery))) {
    results.push({ kind: "create", name: trimmedQuery });
  }

  return results;
}

function bestMatch(note: QuickSwitcherNote, query: string): { term: string; rank: MatchRank } | null {
  const terms = getSearchTerms(note);
  for (const rank of ["exact", "prefix", "substring", "fuzzy"] as const) {
    const term = terms.find((candidate) => matchesAtRank(candidate, query, rank));
    if (term) {
      return { term, rank };
    }
  }
  return null;
}

function hasExactMatch(note: QuickSwitcherNote, query: string): boolean {
  return getSearchTerms(note).some((term) => normalize(term) === normalize(query));
}

function getSearchTerms(note: QuickSwitcherNote): string[] {
  const filename = note.path.split("/").pop() || note.path;
  return [note.title, filename, ...note.aliases];
}

function matchesAtRank(term: string, query: string, rank: MatchRank): boolean {
  const normalizedTerm = normalize(term);
  const normalizedQuery = normalize(query);
  if (!normalizedTerm || !normalizedQuery) {
    return false;
  }

  if (rank === "exact") return normalizedTerm === normalizedQuery;
  if (rank === "prefix") return normalizedTerm.startsWith(normalizedQuery);
  if (rank === "substring") return normalizedTerm.includes(normalizedQuery);
  return isSubsequence(compact(normalizedQuery), compact(normalizedTerm));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compact(value: string): string {
  return value.replace(/[\s_-]/g, "");
}

function isSubsequence(query: string, term: string): boolean {
  let queryIndex = 0;
  for (const character of term) {
    if (character === query[queryIndex]) {
      queryIndex += 1;
    }
  }
  return queryIndex === query.length;
}
