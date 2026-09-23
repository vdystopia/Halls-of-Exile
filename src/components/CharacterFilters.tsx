import Form from "next/form";
import Link from "next/link";
import { SORTS, type CharacterQuery } from "@/lib/character-filters";

/**
 * Sort and filter a league's characters through the query string, so a
 * filtered view is a link that can be bookmarked or sent. A plain GET form:
 * it works without JavaScript and `next/form` turns it into a client
 * navigation when JavaScript is there.
 */
export function CharacterFilters({
  action,
  query,
  classes,
  skills,
  shown,
  total,
}: {
  action: string;
  query: CharacterQuery;
  classes: string[];
  skills: string[];
  shown: number;
  total: number;
}) {
  const active = Boolean(query.sort || query.className || query.skill);
  // A filter from a link can name a value this league does not hold. It stays
  // selectable, or the select would show "Any" while the list reads empty.
  const withCurrent = (options: string[], current: string) =>
    current && !options.some((option) => option.toLowerCase() === current.toLowerCase())
      ? [...options, current]
      : options;
  const classOptions = withCurrent(classes, query.className);
  const skillOptions = withCurrent(skills, query.skill);
  const selected = (options: string[], current: string) =>
    options.find((option) => option.toLowerCase() === current.toLowerCase()) ?? "";
  return (
    <Form action={action} className="panel mb-4 flex flex-wrap items-end gap-3 p-3">
      <div className="min-w-[10rem] flex-1">
        <label className="label" htmlFor="sort">
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={query.sort} className="input">
          {SORTS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[10rem] flex-1">
        <label className="label" htmlFor="class">
          Class
        </label>
        <select id="class" name="class" defaultValue={selected(classOptions, query.className)} className="input">
          <option value="">Any class</option>
          {classOptions.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[10rem] flex-1">
        <label className="label" htmlFor="skill">
          Main skill
        </label>
        <select id="skill" name="skill" defaultValue={selected(skillOptions, query.skill)} className="input">
          <option value="">Any skill</option>
          {skillOptions.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn px-3 py-2 text-xs">
          Apply
        </button>
        {active ? (
          <Link href={action} className="link-gold text-xs">
            Clear
          </Link>
        ) : null}
      </div>
      {active ? (
        <p className="w-full text-xs text-muted">
          Showing {shown} of {total}
        </p>
      ) : null}
    </Form>
  );
}
