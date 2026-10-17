"use client";

import { useEffect, useState } from "react";

// How long to wait after the last keystroke before asking the server, matching
// the pickers' own debounce: long enough that typing a name is one request
// rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * A list's search box: what it holds, and the term actually asked for - the
 * box trimmed, once typing pauses. Splitting the two is what keeps the debounce
 * off the input's own responsiveness.
 */
export function useDebouncedSearch() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  return { input, setInput, term };
}
