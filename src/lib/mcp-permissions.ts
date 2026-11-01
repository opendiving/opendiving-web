const RESOURCE_LABELS = new Map([
  ["certifications", "Certifications"],
  ["checkin", "Check-in"],
  ["contacts", "Contacts"],
  ["courses", "Courses"],
  ["dives", "Dives"],
  ["drafts", "Drafts"],
  ["export", "Exports"],
  ["files", "Files"],
  ["gear", "Gear"],
  ["import", "Imports"],
  ["people", "People"],
  ["preferences", "Preferences"],
  ["presets", "Presets"],
  ["profile", "Profile"],
  ["sites", "Dive sites"],
  ["tags", "Tags"],
  ["trips", "Trips"],
]);

const ACTION_LABELS = new Map([
  ["read", { label: "Read", order: 0 }],
  ["write", { label: "Create & edit", order: 1 }],
  ["delete", { label: "Delete", order: 2 }],
  ["share", { label: "Share", order: 3 }],
]);

interface Permission {
  scope: string;
  action: string;
  label: string;
  order: number;
}

interface PermissionGroup {
  resource: string;
  label: string;
  permissions: Permission[];
}

export function groupMcpPermissions(scopes: string[]): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();
  for (const scope of scopes) {
    const separator = scope.indexOf(":");
    const resource = separator < 0 ? scope : scope.slice(0, separator);
    const action = separator < 0 ? scope : scope.slice(separator + 1);
    const group = groups.get(resource) ?? {
      resource,
      label: RESOURCE_LABELS.get(resource) ?? resource.replace(/-/g, " "),
      permissions: [],
    };
    group.permissions.push({
      scope,
      action,
      label: ACTION_LABELS.get(action)?.label ?? action.replace(/-/g, " "),
      order: ACTION_LABELS.get(action)?.order ?? 4,
    });
    groups.set(resource, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    permissions: group.permissions.sort((a, b) => a.order - b.order),
  }));
}
