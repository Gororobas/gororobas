import { defineConfig, tierPresets } from "sponsorkit";

const tanaincSponsor = {
  sponsor: {
    type: "Organization",
    login: "tanainc",
    name: "Tana, Inc.",
    avatarUrl: "https://avatars.githubusercontent.com/u/77619227?v=4",
    websiteUrl: "https://www.tana.inc",
    linkUrl: "https://github.com/tanainc",
  },
  monthlyDollars: 250,
  privacyLevel: "PUBLIC",
  tierName: "Gold Sponsor",
  createdAt: "2026-03-31T00:00:00.000Z",
  provider: "github",
};

export default defineConfig({
  github: { login: "loro-dev", type: "organization" },
  renderer: "tiers",
  formats: ["svg"],
  width: 900,
  onSponsorsReady(sponsors) {
    if (sponsors.some((s) => s.provider === "github" && s.sponsor.login === "tanainc")) {
      return sponsors;
    }

    return [...sponsors, tanaincSponsor];
  },
  tiers: [
    { title: "Diamond", monthlyDollars: 1000, preset: tierPresets.xl },
    { title: "Gold", monthlyDollars: 250, preset: tierPresets.xl },
    { title: "Silver", monthlyDollars: 100, preset: tierPresets.large },
    { title: "Bronze", monthlyDollars: 50, preset: tierPresets.base },
    { title: "Backer", preset: tierPresets.base },
  ],
});
