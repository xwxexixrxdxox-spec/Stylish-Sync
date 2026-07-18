"use client";

// A plain text input backed by a <datalist> of locations already in use
// elsewhere in the inventory (e.g. "Dry Stock", "Freezer", "Back Room").
// Using a native datalist rather than a custom dropdown keeps this simple
// and accessible: on every platform it still behaves like a normal text
// field (so a brand-new location can always just be typed), but browsers
// that support datalist show the existing options as the customer types or
// focuses the field - "pick an existing one or add your own" without any
// extra UI to build or maintain.
interface Props {
  value: string;
  onChange: (value: string) => void;
  locations: string[];
  listId: string;
  placeholder?: string;
}

export default function LocationField({ value, onChange, locations, listId, placeholder }: Props) {
  return (
    <>
      <input
        className="input"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "e.g. Dry Stock, Freezer, Back Room"}
      />
      <datalist id={listId}>
        {locations.map((loc) => (
          <option key={loc} value={loc} />
        ))}
      </datalist>
    </>
  );
}
