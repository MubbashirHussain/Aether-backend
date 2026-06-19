import { Context } from 'hono';
import { adConfigService } from '../services/adConfig.service.js';

export class AdsController {
  public getConfig(c: Context) {
    return c.json(adConfigService.fetchActivePlacements());
  }
}

export const adsController = new AdsController();
