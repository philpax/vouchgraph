import { useRef, useState } from "react";
import type { useProfileCache } from "../hooks/useProfileCache";
import { UserList, type UserListItem } from "./UserList";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: UserListItem[];
  onSelect: (did: string) => void;
  mode: "dropdown" | "inline";
  profileCache: ReturnType<typeof useProfileCache>;
}

export function SearchBar({
  query,
  onQueryChange,
  results,
  onSelect,
  mode,
  profileCache,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectResult = (did: string) => {
    inputRef.current?.blur();
    onSelect(did);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      selectResult(results[0].did);
    }
    if (e.key === "Escape") {
      onQueryChange("");
      inputRef.current?.blur();
    }
  };

  const showDropdown = mode === "dropdown" && focused && query.trim();

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Search users..."
        className="w-full text-sm px-3 py-2.5 bg-white/10 text-white placeholder-white/30 outline-none"
      />
      {showDropdown && (
        <UserList
          items={results}
          profileCache={profileCache}
          onMouseDown={selectResult}
          className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded overflow-hidden z-10 top-full"
          itemClassName="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 cursor-pointer truncate"
        />
      )}
    </div>
  );
}
