"use client";

import {
  ListField,
  type ListFieldProps,
  type ListShape,
} from "@/components/ui/list-field";
import {
  MAX_EMERGENCY_CONTACTS,
  MAX_INSURANCE_POLICIES,
} from "@/lib/api/checkin-details";
import {
  emptyEmergencyContact,
  emptyInsurancePolicy,
  type EmergencyContactFormValue,
  type InsurancePolicyFormValue,
} from "@/lib/validations/checkin-details";

const CONTACTS: ListShape<EmergencyContactFormValue> = {
  noun: "contact",
  fields: [
    { member: "name", label: "Name", kind: "text" },
    { member: "phone", label: "Phone number", kind: "tel" },
    {
      member: "relationship",
      label: "Relationship to you",
      kind: "text",
      placeholder: "Partner, parent, friend…",
    },
  ],
  cap: MAX_EMERGENCY_CONTACTS,
  empty: emptyEmergencyContact,
  addLabel: "Add a contact",
  emptyText: "No emergency contacts yet.",
  fullText: `${MAX_EMERGENCY_CONTACTS} contacts at most - remove one to add another.`,
};

const POLICIES: ListShape<InsurancePolicyFormValue> = {
  noun: "policy",
  fields: [
    {
      member: "provider",
      label: "Provider",
      kind: "text",
      placeholder: "DAN Europe, DiveAssure…",
    },
    { member: "number", label: "Policy number", kind: "text" },
    { member: "expires_on", label: "Expires on", kind: "date" },
  ],
  cap: MAX_INSURANCE_POLICIES,
  empty: emptyInsurancePolicy,
  addLabel: "Add a policy",
  emptyText: "No insurance policies yet.",
  fullText: `${MAX_INSURANCE_POLICIES} policies at most - remove one to add another.`,
};

/** The diver's emergency contacts, in the order a shop calls them. */
export function EmergencyContactsField(
  props: ListFieldProps<EmergencyContactFormValue>,
) {
  return <ListField {...props} shape={CONTACTS} />;
}

/** The diver's insurance policies, in the order they keep them. */
export function InsurancePoliciesField(
  props: ListFieldProps<InsurancePolicyFormValue>,
) {
  return <ListField {...props} shape={POLICIES} />;
}
