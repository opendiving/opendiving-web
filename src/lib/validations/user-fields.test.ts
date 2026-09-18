import { describe, expect, it } from "vitest";

import {
  EMERGENCY_CONTACT_FIELDS,
  INSURANCE_FIELDS,
  userFieldsFromUser,
  userFieldsSchema,
  userFieldsUpdate,
  type UserFieldValues,
} from "./user-fields";
import type { User } from "@/lib/api/auth";
import { todayIsoDate } from "@/lib/gear-service";
import { isoDaysFromNow } from "@/test/local-day";

const values = (over: Partial<UserFieldValues> = {}): UserFieldValues => ({
  name: "Jane Doe",
  username: "janedoe",
  date_of_birth: "",
  phone: "",
  insurance_provider: "",
  insurance_policy_number: "",
  insurance_expires_on: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  ...over,
});

describe("userFieldsSchema", () => {
  const profile = userFieldsSchema(["name", "username"]);

  it("holds the profile bounds it was given", () => {
    expect(profile.safeParse(values()).success).toBe(true);
    expect(profile.safeParse(values({ name: "J" })).success).toBe(false);
    expect(profile.safeParse(values({ name: "a".repeat(31) })).success).toBe(
      false,
    );
    expect(profile.safeParse(values({ username: "JaneDoe" })).success).toBe(
      false,
    );
    expect(profile.safeParse(values({ username: "jane_doe" })).success).toBe(
      false,
    );
    expect(profile.safeParse(values({ username: "jane123" })).success).toBe(
      true,
    );
  });

  it("judges only the fields the form is showing", () => {
    // The form seeds every field from the account and renders some, so a schema
    // covering all of them would fail a dialog about insurance on a stored name it
    // never showed and the diver cannot reach from there.
    const insurance = userFieldsSchema([...INSURANCE_FIELDS]);
    expect(insurance.safeParse(values({ name: "J" })).success).toBe(true);
    expect(
      insurance.safeParse(values({ insurance_policy_number: "P".repeat(65) }))
        .success,
    ).toBe(false);
  });

  it("refuses a birth date in the future, and only where the field is shown", () => {
    const future = isoDaysFromNow(1);

    const aboutYou = userFieldsSchema(["date_of_birth", "phone"]);
    expect(aboutYou.safeParse(values({ date_of_birth: future })).success).toBe(
      false,
    );
    // Today itself is accepted, as it is on the API's own validator.
    expect(
      aboutYou.safeParse(values({ date_of_birth: todayIsoDate() })).success,
    ).toBe(true);
    expect(
      userFieldsSchema([...EMERGENCY_CONTACT_FIELDS]).safeParse(
        values({ date_of_birth: future }),
      ).success,
    ).toBe(true);
  });
});

describe("userFieldsUpdate", () => {
  it("sends the fields shown and no others", () => {
    // `PATCH /user` is `extra="forbid"`, and a body carrying a key the form never
    // displayed would be this dialog saving a value from somewhere else.
    expect(
      userFieldsUpdate(
        [...INSURANCE_FIELDS],
        values({ phone: "0123", insurance_provider: "DAN Europe" }),
      ),
    ).toEqual({
      insurance_provider: "DAN Europe",
      insurance_policy_number: null,
      insurance_expires_on: null,
    });
  });

  it("clears an emptied optional field with an explicit null, and trims", () => {
    expect(
      userFieldsUpdate(
        ["name", "phone"],
        values({ name: "  Jane  ", phone: "  " }),
      ),
    ).toEqual({ name: "Jane", phone: null });
  });
});

describe("userFieldsFromUser", () => {
  it("reads null and absent alike as the empty box", () => {
    const user = {
      uuid: "user-1",
      name: "Jane Doe",
      username: "janedoe",
      email: "jane@example.com",
      units: "metric",
      dive_form_hidden_fields: [],
      phone: null,
    } as User;

    expect(userFieldsFromUser(user)).toEqual(
      values({ name: "Jane Doe", username: "janedoe" }),
    );
  });
});
