"use client";

import { type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, KeyRound } from "lucide-react";

import { CREDENTIAL_OPTIONS, type Credential } from "@/lib/openapi-credentials";

const HOST_ATTRIBUTE = "data-od-credential-filter";

interface CredentialFilterProps {
  /** The element Scalar mounts into. */
  container: RefObject<HTMLElement | null>;
  value: Credential | "all";
  onChange: (value: Credential | "all") => void;
}

/**
 * The credential selector, drawn inside Scalar's sidebar under its search box and in its style.
 *
 * Scalar is a Vue app with no slot in its sidebar, so this keeps a host element of its own there
 * and portals into it. There are two sidebars - the wide layout's and the one its mobile menu
 * opens - and Scalar re-renders them when the document changes, which can drop a host, so an
 * observer keeps one in each.
 */
export function CredentialFilter({
  container,
  value,
  onChange,
}: CredentialFilterProps) {
  const [hosts, setHosts] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;

    const attach = () => {
      const found: HTMLElement[] = [];
      for (const sidebar of root.querySelectorAll("aside.t-doc__sidebar")) {
        const searchRow = sidebar.firstElementChild;
        if (!searchRow) continue;
        let host = sidebar.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`);
        if (!host) {
          host = window.document.createElement("div");
          host.setAttribute(HOST_ATTRIBUTE, "");
          host.className = "od-credential-filter";
          searchRow.after(host);
        }
        found.push(host);
      }
      setHosts((current) =>
        current.length === found.length &&
        current.every((host, index) => host === found[index])
          ? current
          : found,
      );
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [container]);

  return hosts.map((host, index) =>
    createPortal(
      <label className="od-credential-filter__field">
        <KeyRound aria-hidden className="od-credential-filter__icon" />
        <span className="sr-only">Show routes for</span>
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value as Credential | "all")
          }
        >
          <option value="all">All routes</option>
          {CREDENTIAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="od-credential-filter__chevron" />
      </label>,
      host,
      String(index),
    ),
  );
}
