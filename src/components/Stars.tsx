import { useState } from "react";

export function Stars({
  value,
  onChange,
  size = "text-base",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div
      className={`inline-flex items-center ${size} select-none ${onChange ? "cursor-pointer" : ""}`}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onMouseEnter={() => onChange && setHover(n)}
          onClick={(e) => {
            e.stopPropagation();
            if (!onChange) return;
            onChange(value === n ? 0 : n);
          }}
          className={n <= display ? "text-yellow-400" : "text-neutral-700"}
        >
          ★
        </span>
      ))}
    </div>
  );
}
