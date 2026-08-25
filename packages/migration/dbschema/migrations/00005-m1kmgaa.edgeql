CREATE MIGRATION m1kmgaanbu2vhrpxb2ptsddacdt4shqzjxm2x6xcw2kmtnjdtfm3za
    ONTO m12wjko2cpjqe6fidimsetet2j4jdspvqgegy7rm3s3uqk6dwre2ja
{
  ALTER TYPE default::EditSuggestion {
      CREATE LINK reviewed_by: default::UserProfile;
  };
  ALTER TYPE default::Vegetable EXTENDING default::ModeratorCanUpdate LAST;
  ALTER SCALAR TYPE default::NoteType EXTENDING enum<EXPERIMENTO, ENSINAMENTO, DESCOBERTA, PERGUNTA>;
};
