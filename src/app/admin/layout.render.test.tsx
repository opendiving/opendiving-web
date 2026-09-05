import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminLayout from "./layout";
import type { User } from "@/lib/api/auth";

// One object per state, handed back by identity: `useAuthGuard` reads the auth
// context, and a fresh object per render is what has looped page tests here
// before. See "A shared mock response object hides a render loop" in
// DECISIONS.md.
const stable = vi.hoisted(() => ({
  auth: {
    user: null as User | null,
    isAuthenticated: false,
    isLoading: false,
  },
  router: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
}));

const diver = (overrides: Partial<User> = {}): User => ({
  uuid: "user-1",
  name: "Sam Reef",
  username: "samreef",
  email: "sam@example.com",
  units: "metric",
  dive_form_hidden_fields: [],
  ...overrides,
});

const signedOut = () => {
  stable.auth.user = null;
  stable.auth.isAuthenticated = false;
  stable.auth.isLoading = false;
};

const signedInAs = (user: User) => {
  stable.auth.user = user;
  stable.auth.isAuthenticated = true;
  stable.auth.isLoading = false;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/admin/invites");
  signedOut();
});

describe("the admin section's gate", () => {
  it("renders the section for a superuser", () => {
    signedInAs(diver({ is_superuser: true }));

    render(
      <AdminLayout>
        <p>The queue</p>
      </AdminLayout>,
    );

    expect(screen.getByText("The queue")).toBeInTheDocument();
  });

  it("bounces a signed-out visitor to sign-in, carrying where they were headed", async () => {
    render(
      <AdminLayout>
        <p>The queue</p>
      </AdminLayout>,
    );

    await waitFor(() =>
      expect(stable.router.replace).toHaveBeenCalledWith(
        "/signin?next=%2Fadmin%2Finvites",
      ),
    );
    expect(screen.queryByText("The queue")).not.toBeInTheDocument();
  });

  it("shows a signed-in diver who is not a superuser the not-found state", () => {
    // Not a "forbidden" page: a diver who guesses the URL should learn nothing
    // about whether the section exists, which is the answer a uuid that is not
    // theirs already gets.
    signedInAs(diver({ is_superuser: false }));

    render(
      <AdminLayout>
        <p>The queue</p>
      </AdminLayout>,
    );

    expect(screen.getByText("Page not found.")).toBeInTheDocument();
    expect(screen.queryByText("The queue")).not.toBeInTheDocument();
    expect(stable.router.replace).not.toHaveBeenCalled();
  });

  it("refuses a session whose user record carries no such field", () => {
    // An API that predates `is_superuser` omits it, and absent must not open
    // the door.
    signedInAs(diver());

    render(
      <AdminLayout>
        <p>The queue</p>
      </AdminLayout>,
    );

    expect(screen.getByText("Page not found.")).toBeInTheDocument();
  });

  it("renders neither the section nor a refusal while the auth check is in flight", () => {
    // The bootstrap looks signed-out for a moment on every reload; deciding on
    // that would flash "Page not found." at the operator on every visit.
    stable.auth.isLoading = true;

    const { container } = render(
      <AdminLayout>
        <p>The queue</p>
      </AdminLayout>,
    );

    expect(screen.queryByText("The queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Page not found.")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
