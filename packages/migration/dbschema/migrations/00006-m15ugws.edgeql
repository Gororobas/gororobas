CREATE MIGRATION m15ugwsu5pwnwqwvtzwenpcdt6kcnbsfoynl4hk2jjvcyw5g5aiw2a
    ONTO m1kmgaanbu2vhrpxb2ptsddacdt4shqzjxm2x6xcw2kmtnjdtfm3za
{
  ALTER TYPE default::EditSuggestion {
      DROP EXTENDING default::UserCanSelect;
      EXTENDING default::PublicRead BEFORE default::ModeratorCanUpdate;
  };
};
