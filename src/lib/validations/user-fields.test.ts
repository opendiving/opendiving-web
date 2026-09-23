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

  it("takes the columns' bounds", () => {
    const contact = userFieldsSchema([...EMERGENCY_CONTACT_FIELDS]);
    const insurance = userFieldsSchema([...INSURANCE_FIELDS]);
    expect(
      contact.safeParse(values({ emergency_contact_name: "a".repeat(255) }))
        .success,
    ).toBe(true);
    expect(
      contact.safeParse(values({ emergency_contact_name: "a".repeat(256) }))
        .success,
    ).toBe(false);
    expect(
      contact.safeParse(
        values({
          emergency_contact_name: "Alex",
          emergency_contact_relationship: "a".repeat(64),
        }),
      ).success,
    ).toBe(true);
    expect(
      contact.safeParse(
        values({
          emergency_contact_name: "Alex",
          emergency_contact_relationship: "a".repeat(65),
        }),
      ).success,
    ).toBe(false);
    expect(
      insurance.safeParse(values({ insurance_provider: "a".repeat(255) }))
        .success,
    ).toBe(true);
    expect(
      insurance.safeParse(values({ insurance_provider: "a".repeat(256) }))
        .success,
    ).toBe(false);
  });

  it("requires a contact's name and an insurance's provider once anything else of it is set", () => {
    const contact = userFieldsSchema([...EMERGENCY_CONTACT_FIELDS]);
    const insurance = userFieldsSchema([...INSURANCE_FIELDS]);

    const noName = contact.safeParse(
      values({ emergency_contact_name: "  ", emergency_contact_phone: "0456" }),
    );
    expect(noName.success).toBe(false);
    // The API's own sentence, on the field it names.
    expect(noName.error?.issues).toEqual([
      expect.objectContaining({
        path: ["emergency_contact_name"],
        message:
          "Required while the emergency contact has a phone or a relationship",
      }),
    ]);

    const noProvider = insurance.safeParse(
      values({ insurance_expires_on: "2027-03-01" }),
    );
    expect(noProvider.error?.issues).toEqual([
      expect.objectContaining({
        path: ["insurance_provider"],
        message:
          "Required while the insurance has a policy number or an expiry date",
      }),
    ]);

    // An empty group is not a contact at all, and one with its anchor is whole.
    expect(contact.safeParse(values()).success).toBe(true);
    expect(
      insurance.safeParse(
        values({ insurance_provider: "DAN", insurance_policy_number: "P-1" }),
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
