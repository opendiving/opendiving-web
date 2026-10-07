import { describe, expect, it } from "vitest";

import {
  CHECKIN_GROUPS,
  checkinDetailsPatch,
  checkinDetailsSchema,
  checkinFormValues,
  EMPTY_CHECKIN_FORM_VALUES,
  type CheckinDetailsFormValues,
} from "./checkin-details";
import { todayIsoDate } from "@/lib/gear-service";
import { isoDaysFromNow } from "@/test/local-day";

const values = (
  over: Partial<CheckinDetailsFormValues> = {},
): CheckinDetailsFormValues => ({ ...EMPTY_CHECKIN_FORM_VALUES, ...over });

const contact = (name: string, over = {}) => ({
  name,
  phone: "",
  relationship: "",
  ...over,
});
const policy = (provider: string, over = {}) => ({
  provider,
  number: "",
  expires_on: "",
  ...over,
});

describe("checkinDetailsSchema", () => {
  const about = checkinDetailsSchema(CHECKIN_GROUPS.about);
  const contacts = checkinDetailsSchema(CHECKIN_GROUPS.emergency);
  const policies = checkinDetailsSchema(CHECKIN_GROUPS.insurance);

  it("judges only the members the form is showing", () => {
    // A dialog about insurance must not fail on a stored value it never showed.
    expect(
      policies.safeParse(values({ date_of_birth: isoDaysFromNow(1) })).success,
    ).toBe(true);
  });

  it("refuses a birth date in the future and takes today", () => {
    expect(
      about.safeParse(values({ date_of_birth: isoDaysFromNow(1) })).success,
    ).toBe(false);
    expect(
      about.safeParse(values({ date_of_birth: todayIsoDate() })).success,
    ).toBe(true);
  });

  it("takes an empty email or an address, and nothing else", () => {
    expect(about.safeParse(values({ email: "" })).success).toBe(true);
    expect(
      about.safeParse(values({ email: " desk@example.org " })).success,
    ).toBe(true);
    expect(about.safeParse(values({ email: "desk at example" })).success).toBe(
      false,
    );
  });

  it("refuses a contact without a name and a policy without a provider, naming the row", () => {
    const noName = contacts.safeParse(
      values({
        emergency_contacts: [contact("Alex"), contact("  ", { phone: "0456" })],
      }),
    );
    expect(noName.error?.issues).toEqual([
      expect.objectContaining({ path: ["emergency_contacts", 1, "name"] }),
    ]);

    const noProvider = policies.safeParse(
      values({ insurance_policies: [policy("", { number: "P-1" })] }),
    );
    expect(noProvider.error?.issues).toEqual([
      expect.objectContaining({ path: ["insurance_policies", 0, "provider"] }),
    ]);
  });

  it("takes the API's bounds, and its cap of five a list", () => {
    expect(
      contacts.safeParse(
        values({
          emergency_contacts: [contact("a", { relationship: "r".repeat(65) })],
        }),
      ).success,
    ).toBe(false);
    expect(
      policies.safeParse(
        values({
          insurance_policies: [policy("DAN", { number: "n".repeat(65) })],
        }),
      ).success,
    ).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => contact(`C${i}`));
    expect(
      contacts.safeParse(values({ emergency_contacts: five })).success,
    ).toBe(true);
    expect(
      contacts.safeParse(
        values({ emergency_contacts: [...five, contact("One more")] }),
      ).success,
    ).toBe(false);
  });
});

describe("checkinDetailsPatch", () => {
  it("sends the members shown and no other key", () => {
    // A key the form never showed would be this surface reverting another's group
    // from a stale copy.
    expect(
      checkinDetailsPatch(
        CHECKIN_GROUPS.insurance,
        values({
          phone: "0123",
          insurance_policies: [policy(" DAN Europe ", { number: "  " })],
        }),
      ),
    ).toEqual({
      insurance_policies: [
        { provider: "DAN Europe", number: null, expires_on: null },
      ],
    });
  });

  it("clears an emptied scalar with null and an emptied list with [], trimming", () => {
    expect(
      checkinDetailsPatch(
        [...CHECKIN_GROUPS.about, ...CHECKIN_GROUPS.emergency],
        values({ email: "  desk@example.org ", phone: "  " }),
      ),
    ).toEqual({
      date_of_birth: null,
      phone: null,
      email: "desk@example.org",
      emergency_contacts: [],
    });
  });

  it("keeps a list in the order the form holds it", () => {
    expect(
      checkinDetailsPatch(
        CHECKIN_GROUPS.emergency,
        values({ emergency_contacts: [contact("Second"), contact("First")] }),
      ).emergency_contacts?.map(({ name }) => name),
    ).toEqual(["Second", "First"]);
  });
});

describe("checkinFormValues", () => {
  it("reads null as the empty box, row by row", () => {
    expect(
      checkinFormValues({
        email: null,
        phone: "0123",
        date_of_birth: null,
        emergency_contacts: [{ name: "Alex", phone: null, relationship: null }],
        insurance_policies: [],
      }),
    ).toEqual(values({ phone: "0123", emergency_contacts: [contact("Alex")] }));
  });
});
