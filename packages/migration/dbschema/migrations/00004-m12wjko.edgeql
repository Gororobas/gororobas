CREATE MIGRATION m12wjko2cpjqe6fidimsetet2j4jdspvqgegy7rm3s3uqk6dwre2ja
    ONTO m1kkrjwoakklotem566vq6yg5hqdizyk5ve5uz23dfcbdacubppniq
{
  CREATE ABSTRACT TYPE default::UserCanUpdate {
      CREATE ACCESS POLICY authenticated_user_can_update
          ALLOW UPDATE USING (EXISTS (GLOBAL default::current_user));
  };
  ALTER TYPE default::Image {
      EXTENDING default::UserCanUpdate BEFORE default::AdminCanDoAnything;
      ALTER PROPERTY sanity_id {
          SET readonly := true;
      };
  };
  ALTER TYPE default::Source {
      EXTENDING default::Auditable BEFORE default::PublicRead;
      EXTENDING default::UserCanUpdate LAST;
  };
};
