/**
 * Query keys centralizadas para invalidations consistentes entre hooks e mutações.
 * Nunca crie a mesma chave inline em outro lugar — importe daqui.
 */
export const qk = {
  session: () => ["session"] as const,
  taxonomy: (eventId: string) => ["taxonomy", eventId] as const,
  ownProfile: (eventId: string) => ["own-profile", eventId] as const,
  ownMatches: (eventId: string) => ["own-matches", eventId] as const,
  publicStats: (eventId: string) => ["stats", eventId] as const,
  staffQueue: (eventId: string) => ["staff-queue", eventId] as const,
} as const;
