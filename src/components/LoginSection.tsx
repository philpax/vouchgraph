import { useEffect, useRef, useState } from "react";
import type { Auth } from "../hooks/useAuth";
import { getHandle } from "../lib/handle-resolver";
import { searchActorsTypeahead, type TypeaheadActor } from "../lib/api";
import { UserRow } from "./UserList";
import { Button } from "./ui";

export function PermissionNotice() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="text-xs text-amber-400/70">
      <span>
        Bluesky will report that all permissions are requested due to{" "}
        <a
          href="https://github.com/bluesky-social/atproto/issues/4479"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          an issue
        </a>{" "}
        in the reference PDS.{" "}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-400/50 hover:text-amber-400/70 cursor-pointer transition-colors"
        >
          [{expanded ? "hide" : "more"}]
        </button>
      </span>
      {expanded && (
        <div className="mt-1 text-amber-400/50">
          vouchgraph only creates and deletes vouch records on api.atvouch.dev
          and never interacts with your Bluesky data.
        </div>
      )}
    </div>
  );
}

export function LoginSection({ auth }: { auth: Auth }) {
  const [handle, setHandleInput] = useState("");
  const [suggestions, setSuggestions] = useState<TypeaheadActor[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanHandle = (v: string) => v.replace(/^@/, "");

  const doLogin = (h: string) => {
    const cleaned = cleanHandle(h).trim();
    if (cleaned) {
      setSuggestions([]);
      setShowSuggestions(false);
      auth.login(cleaned);
    }
  };

  const handleChange = (val: string) => {
    setHandleInput(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const q = cleanHandle(val).trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const abort = new AbortController();
      abortRef.current = abort;
      try {
        const results = await searchActorsTypeahead(q, 5, abort.signal);
        if (!abort.signal.aborted) setSuggestions(results);
      } catch {
        // ignore
      }
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  if (auth.loading) {
    return <div className="text-white/30">Restoring session...</div>;
  }

  if (auth.did) {
    const displayHandle = auth.handle ?? getHandle(auth.did);
    return (
      <div className="flex items-center gap-2">
        {displayHandle ? (
          <a
            href={`#${displayHandle}`}
            className="text-indigo-400 no-underline truncate"
          >
            @{displayHandle}
          </a>
        ) : (
          <span className="text-white/30 truncate">Loading...</span>
        )}
        <button
          onClick={() => auth.logout()}
          className="text-white/30 hover:text-white/50 cursor-pointer transition-colors shrink-0"
        >
          Log out
        </button>
      </div>
    );
  }

  const dropdownVisible =
    showSuggestions && suggestions.length > 0 && handle.trim().length >= 2;

  return (
    <form
      className="flex gap-2 relative"
      onSubmit={(e) => {
        e.preventDefault();
        doLogin(handle);
      }}
    >
      <div className="flex-1 min-w-0 relative">
        <input
          ref={inputRef}
          type="text"
          value={handle}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          }}
          placeholder="handle.bsky.social"
          className="w-full text-xs px-2 py-1.5 bg-white/10 border border-white/10 rounded text-white placeholder-white/30 outline-none focus:border-indigo-400/50"
        />
        {dropdownVisible && (
          <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded overflow-hidden z-10 top-full">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.did}
                onMouseDown={() => {
                  setHandleInput(s.handle);
                  setSuggestions([]);
                  setShowSuggestions(false);
                  doLogin(s.handle);
                }}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs hover:bg-white/10 cursor-pointer truncate"
              >
                <UserRow
                  avatar={s.avatar}
                  handle={s.handle}
                  displayName={s.displayName}
                  size="xs"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        disabled={!handle.trim()}
        className="shrink-0"
      >
        Log in
      </Button>
    </form>
  );
}
