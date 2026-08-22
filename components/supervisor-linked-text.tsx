import Link from "next/link";
import type { ReactNode } from "react";
import type { SupervisorNameLink } from "@/lib/supervisors";

type Props = {
  text: string;
  supervisors: SupervisorNameLink[];
};

type NameMatcher = {
  byName: Map<string, SupervisorNameLink>;
  expression: RegExp;
};

const matcherCache = new WeakMap<SupervisorNameLink[], NameMatcher>();

export function SupervisorLinkedText({ text, supervisors }: Props) {
  const matcher = getMatcher(supervisors);
  if (!matcher) return text;
  const { byName, expression } = matcher;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(expression)) {
    const index = match.index;
    const matchedName = match[0];
    const supervisor = byName.get(matchedName.toLocaleLowerCase("en-US"));
    if (!supervisor || !startsLikeAName(matchedName)) continue;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(
      <Link
        key={`${index}-${supervisor.slug}`}
        href={`/supervisors/${supervisor.slug}`}
        className="supervisor-name-link"
        title={`View ${supervisor.displayName} supervisor profile`}
      >
        {matchedName}
      </Link>,
    );
    cursor = index + matchedName.length;
  }

  if (!nodes.length) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function getMatcher(supervisors: SupervisorNameLink[]): NameMatcher | null {
  const cached = matcherCache.get(supervisors);
  if (cached) return cached;
  const names = supervisors.flatMap((supervisor) =>
    supervisor.names.map((name) => ({ name, supervisor })),
  );
  if (!names.length) return null;
  const byName = new Map(
    names.map(({ name, supervisor }) => [name.toLocaleLowerCase("en-US"), supervisor]),
  );
  const alternatives = [...byName.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegularExpression)
    .join("|");
  const matcher = {
    byName,
    expression: new RegExp(
      `(?<![\\p{L}\\p{N}@._-])(${alternatives})(?![\\p{L}\\p{N}@._-])`,
      "giu",
    ),
  };
  matcherCache.set(supervisors, matcher);
  return matcher;
}

function startsLikeAName(value: string) {
  const firstLetter = value.match(/\p{L}/u)?.[0];
  return !firstLetter || firstLetter === firstLetter.toLocaleUpperCase("en-US");
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
