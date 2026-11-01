import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  filenameFromContentDisposition,
  isFirefoxIOS,
  saveApiDownload,
} from "./download";
import {
  downloadTicketsAPI,
  ticketedDownloadUrl,
} from "@/lib/api/download-tickets";
import { navigateToDownload } from "@/lib/navigation";

vi.mock("@/lib/api/download-tickets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/download-tickets")>()),
  downloadTicketsAPI: { create: vi.fn() },
}));

vi.mock("@/lib/navigation", () => ({
  navigateToDownload: vi.fn(),
}));

// The parser exists for one header the app actually meets - the export endpoints'
// `attachment; filename="opendiving-alex-20260814.zip"` - but it is the thing standing
// between a server-chosen string and `link.download`, so the cases worth pinning are
// the ones where it should decline to answer rather than the happy path.

describe("filenameFromContentDisposition", () => {
  it("reads the plain quoted form the export endpoints send", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="opendiving-alex-20260814.zip"',
      ),
    ).toBe("opendiving-alex-20260814.zip");
  });

  it("reads an unquoted filename", () => {
    expect(
      filenameFromContentDisposition("attachment; filename=dives.uddf"),
    ).toBe("dives.uddf");
  });

  it("is case-insensitive about the parameter name", () => {
    expect(
      filenameFromContentDisposition('attachment; FileName="dives.csv"'),
    ).toBe("dives.csv");
  });

  it("prefers the RFC 6266 extended form, which is the one that can carry non-ASCII", () => {
    // A server sending both means the plain parameter to be the lossy fallback for
    // clients that cannot read `filename*`. Picking the lossy one when the good one
    // is right there would be choosing to mangle the name.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"opendiving-jarnsaxa.zip\"; filename*=UTF-8''opendiving-j%C3%A4rns%C3%A4xa.zip",
      ),
    ).toBe("opendiving-järnsäxa.zip");
  });

  it("falls back to the plain form when the extended one is malformed", () => {
    // A stray `%` is a `decodeURIComponent` throw, not a bad character. A
    // wrong-but-present name beats failing the download.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"export.zip\"; filename*=UTF-8''bad%zz.zip",
      ),
    ).toBe("export.zip");
  });

  it("falls back to the plain form for a charset it cannot decode", () => {
    // `decodeURIComponent` only speaks UTF-8, so `%E9` in a Latin-1 name is not a
    // character it can produce. Declining by the declared charset rather than by
    // catching the throw is the difference between a decision and an accident.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"cafe.zip\"; filename*=ISO-8859-1''caf%E9.zip",
      ),
    ).toBe("cafe.zip");
  });

  it("accepts an extended form with no charset declared", () => {
    // RFC 8187 requires one, but a server that omits it is percent-encoding ASCII,
    // which is exactly what `decodeURIComponent` does anyway.
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=''plain%20name.zip",
      ),
    ).toBe("plain name.zip");
  });

  it("strips a directory part rather than passing it to `link.download`", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="../../etc/passwd"'),
    ).toBe("passwd");
    expect(
      filenameFromContentDisposition(
        'attachment; filename="C:\\Windows\\system.ini"',
      ),
    ).toBe("system.ini");
  });

  it.each([
    // What a cross-origin response without `Access-Control-Expose-Headers` actually
    // hands JS: the header is on the wire, and `response.headers[...]` is undefined.
    // This is the case that runs in production today, so the callers' fallback name
    // is not a defensive branch - it is the normal path.
    ["a missing header", undefined],
    ["an explicit null", null],
    ["an empty header", ""],
    ["a header with no filename at all", "attachment"],
    ["an empty quoted filename", 'attachment; filename=""'],
    ["a filename that is only a path separator", 'attachment; filename="/"'],
  ])("returns null for %s", (_label, header) => {
    expect(filenameFromContentDisposition(header)).toBeNull();
  });
});

// Firefox for iOS's own UA, from its `UserAgentBuilder`: the `FxiOS/` token is the
// only thing separating it from Safari on the same device.
const FIREFOX_IOS_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/604.1";
const FIREFOX_IOS_IPAD_MOBILE =
  "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/604.1";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1";
const FIREFOX_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0";
const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
// What Firefox sends in desktop mode, an iPad's default - desktop Safari's UA.
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15";

describe("isFirefoxIOS", () => {
  it.each([
    ["on an iPhone", FIREFOX_IOS_IPHONE],
    ["on an iPad in mobile mode", FIREFOX_IOS_IPAD_MOBILE],
  ])("recognises Firefox for iOS %s", (_label, ua) => {
    expect(isFirefoxIOS(ua)).toBe(true);
  });

  it.each([
    ["Safari on iOS", SAFARI_IOS],
    ["Chrome on iOS", CHROME_IOS],
    ["desktop Firefox", FIREFOX_DESKTOP],
    ["desktop Chrome", CHROME_DESKTOP],
    ["an iPad in desktop mode, whichever browser", IPAD_DESKTOP_MODE],
  ])("leaves %s alone", (_label, ua) => {
    expect(isFirefoxIOS(ua)).toBe(false);
  });
});

describe("saveApiDownload", () => {
  const blob = new Blob(["bytes"]);
  const fetchFile = vi.fn();
  let click: MockInstance<HTMLAnchorElement["click"]>;
  let clickedAnchor: HTMLAnchorElement | null;

  function useUserAgent(ua: string) {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  }

  beforeEach(() => {
    fetchFile.mockReset();
    fetchFile.mockResolvedValue({ blob, filename: "dive.fit" });
    vi.mocked(downloadTicketsAPI.create).mockReset();
    vi.mocked(navigateToDownload).mockReset();
    // jsdom has no object URLs and does not navigate on an anchor click.
    URL.createObjectURL = vi.fn(() => "blob:http://localhost/abc");
    URL.revokeObjectURL = vi.fn();
    clickedAnchor = null;
    click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this;
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([SAFARI_IOS, CHROME_IOS, FIREFOX_DESKTOP, CHROME_DESKTOP])(
    "saves the fetched blob under its name, minting nothing, in %s",
    async (ua) => {
      useUserAgent(ua);

      // Nothing left to wait on: the bytes are already in hand.
      await expect(saveApiDownload("/export/archive", fetchFile)).resolves.toBe(
        0,
      );

      expect(fetchFile).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(clickedAnchor?.download).toBe("dive.fit");
      expect(clickedAnchor?.href).toBe("blob:http://localhost/abc");
      expect(downloadTicketsAPI.create).not.toHaveBeenCalled();
      expect(navigateToDownload).not.toHaveBeenCalled();
    },
  );

  it("navigates to the ticketed route in Firefox for iOS, fetching nothing", async () => {
    useUserAgent(FIREFOX_IOS_IPHONE);
    vi.mocked(downloadTicketsAPI.create).mockResolvedValue({
      ticket: "t.k-n_",
      expires_in: 300,
    });

    // The response is out of the page's sight, so the ticket's lifetime is the only
    // bound on how long the download may still need the session.
    await expect(saveApiDownload("/dive/d1/file/f1", fetchFile)).resolves.toBe(
      300_000,
    );

    expect(downloadTicketsAPI.create).toHaveBeenCalledWith("/dive/d1/file/f1");
    // The URL itself is `ticketedDownloadUrl`'s, tested beside it.
    expect(navigateToDownload).toHaveBeenCalledWith(
      ticketedDownloadUrl("/dive/d1/file/f1", "t.k-n_"),
    );
    expect(fetchFile).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("rejects without navigating when the ticket cannot be minted", async () => {
    useUserAgent(FIREFOX_IOS_IPHONE);
    const failure = new Error("429");
    vi.mocked(downloadTicketsAPI.create).mockRejectedValue(failure);

    await expect(saveApiDownload("/export/csv", fetchFile)).rejects.toBe(
      failure,
    );
    expect(navigateToDownload).not.toHaveBeenCalled();
  });
});
