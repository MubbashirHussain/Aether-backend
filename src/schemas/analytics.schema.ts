import { z } from 'zod';

export const trackEventSchema = z.object({
  event: z.enum([
    'url_analyzed',
    'download_clicked',
    'download_unlocked',
    'ad_view',
    'ad_closed',
    'history_reused'
  ])
});
