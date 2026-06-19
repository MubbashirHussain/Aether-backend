export class AdConfigService {
  public fetchActivePlacements() {
    return {
      interstitialDelay: 5,
      enableBottomAnchor: true,
      enableSidebar: true,
      enableLeaderboard: true,
      enableNativeAds: true
    };
  }
}

export const adConfigService = new AdConfigService();
