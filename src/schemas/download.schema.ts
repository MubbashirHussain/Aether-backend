import { z } from 'zod';

export const analyzeUrlSchema = z.object({
  url: z.string().url({ message: 'A valid absolute URL configuration is required.' })
});

export const unlockSessionSchema = z.object({
  sessionId: z.string().uuid({ message: 'A valid structural UUID tracking session token is required.' })
});
