"use client";

/**
 * Pick the skill a character was built around, by typing.
 *
 * A native `<input list>` against a `<datalist>` rather than a hand-written
 * combobox. The browser already narrows the options as characters are typed,
 * against its own matching, and does it with the keyboard behaviour, the screen
 * reader semantics and the touch handling that a bespoke listbox spends hundreds
 * of lines getting wrong. There is nothing here worth owning.
 *
 * It suggests without constraining, which is what this field wants rather than a
 * limitation to apologise for: a transfigured gem is not in the list, because
 * RePoE does not publish them, so "Frostblink of Wintry Blast" has to be typed
 * in full and must keep working. `gemArt` resolves it through its base gem.
 *
 * The options are rendered once per page by `SkillOptions` and referenced by
 * every input, because the import page mounts one field per character and a
 * list per field would be forty copies of the same three hundred options. They
 * arrive as a prop: the list is generated from RePoE and read on the server,
 * the same rule the art and colour indexes follow.
 */

/** The id both halves agree on. One list per page is enough for any number of fields. */
const LIST_ID = "skill-names";

export function SkillOptions({ options }: { options: string[] }) {
  return (
    <datalist id={LIST_ID}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  );
}

export function SkillSelect({
  id,
  name,
  defaultValue,
  placeholder,
  className = "input",
  "aria-label": ariaLabel,
}: {
  id?: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <input
      id={id}
      name={name}
      list={LIST_ID}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      spellCheck={false}
      className={className}
    />
  );
}
