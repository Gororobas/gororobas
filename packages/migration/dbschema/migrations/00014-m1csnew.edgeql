CREATE MIGRATION m1csnewtis2f55icqqcl63jd25ot5umeuzzgbmdptwvsmrdff5pp5a
    ONTO m176z2s6sefjq3rhyet7ybf6rwdl6i4dvlxcu5evpyrrhd36gebcoq
{
  CREATE SCALAR TYPE default::NotePublishStatus EXTENDING enum<PRIVATE, COMMUNITY, PUBLIC>;
  ALTER TYPE default::Note {
      CREATE REQUIRED PROPERTY publish_status: default::NotePublishStatus {
          SET default := (SELECT
              ('PUBLIC' IF .public ELSE 'PRIVATE')
          );
      };
      ALTER ACCESS POLICY visible_if_public USING ((.publish_status = default::NotePublishStatus.PUBLIC));
      CREATE ACCESS POLICY visible_to_community
          ALLOW SELECT USING (((.publish_status = default::NotePublishStatus.COMMUNITY) AND EXISTS (GLOBAL default::current_user_profile)));
      ALTER PROPERTY public {
          CREATE ANNOTATION std::deprecated := 'Use publish_status instead.';
      };
  };
};
