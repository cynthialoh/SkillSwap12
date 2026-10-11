export const authorizationMatrix = {
  member: {
    account: ["read-self", "update-self", "complete-onboarding"],
    admin: [],
  },
  admin: {
    account: ["read-operational-summary"],
    admin: ["read-audit-events", "manage-platform"],
  },
} as const;

export type AppRole = keyof typeof authorizationMatrix;
