import { describe, it, expect, vi, beforeEach } from "vitest";
import { coursesAPI } from "./courses";

// What `getCourses` puts on the query string, which is the half of the filter
// feature the UI cannot show. The controls themselves are in
// `components/courses/courses-filters.render.test.tsx`.
vi.mock("./client", () => ({
  apiClient: { get: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

const EMPTY_PAGE = {
  data: {
    data: [],
    total_count: 0,
    has_more: false,
    page: 1,
    items_per_page: 10,
  },
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(EMPTY_PAGE);
});

describe("getCourses", () => {
  it("asks for the first page with no filters at all by default", async () => {
    await coursesAPI.getCourses();

    expect(get).toHaveBeenCalledWith("/courses", {
      params: { page: 1, items_per_page: 10 },
    });
  });

  it("sends every filter it is given, under the API's names", async () => {
    await coursesAPI.getCourses(2, 25, {
      search: "nitrox",
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
      agency: "tdi",
      status: "completed",
    });

    expect(get).toHaveBeenCalledWith("/courses", {
      params: {
        page: 2,
        items_per_page: 25,
        search: "nitrox",
        date_from: "2025-01-01",
        date_to: "2025-12-31",
        agency: "tdi",
        status: "completed",
      },
    });
  });

  // Not a tidiness rule. The API types `agency` and `status` as enums, and
  // FastAPI answers `?agency=` with a 422 rather than reading it as "any" - so
  // an unset control that sent its empty string would break the list rather
  // than widen it.
  it("leaves an unset filter off the query string entirely", async () => {
    await coursesAPI.getCourses(1, 10, {
      search: "",
      dateFrom: "",
      dateTo: "",
      agency: "",
      status: "",
    });

    expect(get).toHaveBeenCalledWith("/courses", {
      params: { page: 1, items_per_page: 10 },
    });
  });

  it("sends the filters that are set and omits the ones that are not", async () => {
    await coursesAPI.getCourses(1, 10, { status: "planned" });

    expect(get).toHaveBeenCalledWith("/courses", {
      params: { page: 1, items_per_page: 10, status: "planned" },
    });
  });
});
