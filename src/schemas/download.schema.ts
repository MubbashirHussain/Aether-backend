import { z } from 'zod';

export const analyzeUrlSchema = z.object({
  url: z.string().url({ message: 'A valid absolute URL configuration is required.' })
});

export const unlockSessionSchema = z.object({
  sessionId: z.string().uuid({ message: 'A valid structural UUID tracking session token is required.' })
});

export const downloadFormatSchema = z.object({
  url: z.string().url({ message: 'A valid absolute URL configuration is required.' }),
  formatId: z.string().min(1, { message: 'Format ID is required.' }),
  isAudioAvailable: z.boolean().optional().default(false),
});
