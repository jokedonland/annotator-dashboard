"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UserSwitcher({
  directory,
  current,
}: {
  directory: { name: string; email: string; role: string }[];
  current: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return directory.slice(0, 8);
    return directory
      .filter(
        (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [q, directory]);

  function pick(email: string) {
    setOpen(false);
    setQ("");
    router.push(email ? `/?as=${encodeURIComponent(email)}` : "/");
  }

  return (
    <div ref={boxRef} className="relative w-64">
      <input
        type="search"
        placeholder="View as… (name or email)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-lg border border-baseline bg-surface px-3 py-1.5 text-xs outline-none focus:border-series-1"
        aria-label="Admin: view another user's dashboard"
      />
      {open && (
        <ul className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-borderc bg-surface py-1 shadow-lg">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">No matches</li>
          )}
          {matches.map((u) => (
            <li key={u.email}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u.email)}
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-page ${
                  u.email === current ? "font-semibold" : ""
                }`}
              >
                <span className="block truncate">{u.name}</span>
                <span className="block truncate text-muted">
                  {u.email} · {u.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
