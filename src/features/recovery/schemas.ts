import { z } from "zod";

export const recoverProfileRowSchema = z.object({
  profile_id: z.string(),
  new_recovery_code: z.string(),
});

export const recoverProfileResponseSchema = z
  .array(recoverProfileRowSchema)
  .min(1);
