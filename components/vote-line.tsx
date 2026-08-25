import { SupervisorLinkedText } from "@/components/supervisor-linked-text";
import type { SupervisorNameLink } from "@/lib/supervisors";

export function VoteLine({
  label,
  names,
  supervisors,
  showWhenEmpty = false,
}: {
  label: string;
  names: string[];
  supervisors: SupervisorNameLink[];
  showWhenEmpty?: boolean;
}) {
  if (!names.length && !showWhenEmpty) return null;
  return (
    <p className={`vote-line vote-line-${label.toLowerCase()}`}>
      <strong>{label}:</strong>{" "}
      {names.length > 0
        ? <SupervisorLinkedText text={names.join(", ")} supervisors={supervisors} />
        : "None"}
    </p>
  );
}
