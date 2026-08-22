import { SearchApp } from "@/components/search-app";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const parameters = await searchParams;
  return (
    <SearchApp
      initialQuery={first(parameters.q)}
      initialYear={first(parameters.year)}
      initialKind={first(parameters.kind)}
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
