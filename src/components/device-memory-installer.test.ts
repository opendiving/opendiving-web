import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_MEMORY_OPT_OUT_KEY } from "@/lib/device-memory";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// The whole objection switch rests on one line of JSX in the root layout, and
// that line has no runtime consequence anything else in this suite would miss:
// `/privacy` and `/settings` pull `lib/device-memory.ts` in through the control
// itself, so deleting the layout's `<DeviceMemoryInstaller />` leaves every
// other test here green while `/dashboard` - the one route with mount-effect
// writers and no switch on it - silently starts storing view keys again for a
// diver who objected. That is the exact failure the component's own comment
// describes, and it needs a test rather than a comment.
//
// Two checks, because neither is sufficient alone. The first is behavioural and
// pins the half that is about this module: importing it arms the suppression,
// with nothing rendered and nothing called. The second is a source-text
// tripwire in the spirit of `lib/storage-keys.test.ts`'s writer list, and it is
// worth being honest about what it does and does not prove: it shows the layout
// still names the component, not that Next puts the module in every route's
// client bundle. Nothing under jsdom can show the latter - `app/layout.tsx` is
// an async Server Component and the bundling decision belongs to the build - so
// the tripwire covers the mistake that is actually plausible, someone tidying
// away a component that renders `null`.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAYOUT = path.join(SRC, "app", "layout.tsx");

beforeEach(() => {
  useStorage(memoryStorage());
});

describe("the device-memory installer", () => {
  it("arms the suppression by being evaluated, with nothing rendered", async () => {
    vi.resetModules();
    window.localStorage.setItem(DEVICE_MEMORY_OPT_OUT_KEY, "1");

    const { DeviceMemoryInstaller } = await import("./device-memory-installer");

    // No render, no call - the import is the whole of it. React runs child
    // effects before parent effects, so anything that waited for this
    // component to render would land after the two dashboard cards have
    // already written their view keys.
    window.localStorage.setItem("theme", "dark");
    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(DeviceMemoryInstaller()).toBeNull();
  });

  it("is still rendered by the root layout", () => {
    const layout = readFileSync(LAYOUT, "utf8");

    expect(layout).toContain('from "@/components/device-memory-installer"');
    expect(layout).toContain("<DeviceMemoryInstaller />");
  });
});
