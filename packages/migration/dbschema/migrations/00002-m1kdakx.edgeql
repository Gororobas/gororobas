CREATE MIGRATION m1kdakxaviypvospq4qxwm3kfb33r5z4eiznob3fvddajcdsqgewgq
    ONTO m1u4pwqvai5iylfpxt5mw2ptmo7yloxpq2cerwoc7zwdyvdbxd6rbq
{
  ALTER TYPE default::WithHandle {
      CREATE INDEX ON (.handle);
  };
  ALTER TYPE default::Note {
      DROP LINK related_notes;
  };
  ALTER TYPE default::Note {
      CREATE MULTI LINK related_to_notes: default::Note {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
  };
  ALTER TYPE default::Note {
      CREATE LINK related_notes := ((.related_to_notes UNION .<related_to_notes[IS default::Note]));
  };
  ALTER TYPE default::Note {
      ALTER LINK related_vegetables {
          RENAME TO related_to_vegetables;
      };
  };
  ALTER TYPE default::Vegetable {
      CREATE LINK related_notes := (.<related_to_vegetables[IS default::Note]);
  };
  ALTER TYPE default::VegetableFriendship EXTENDING default::UserCanInsert BEFORE default::AdminCanDoAnything;
  ALTER TYPE default::VegetableTip EXTENDING default::UserCanInsert BEFORE default::AdminCanDoAnything;
};
