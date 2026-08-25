CREATE MIGRATION m1owlxvadpmtr2mxf5bleanjneuwvozzygw3m7xbknl6o6jmtmj5ma
    ONTO m1o3kiuhtuwg3v27ffsojzyni3rs75scv6warat3fsmtlkcscyzs7q
{
  ALTER TYPE default::User {
      CREATE ACCESS POLICY admin_has_full_access
          ALLOW ALL USING (((GLOBAL default::current_user).userRole ?= default::Role.ADMIN));
      CREATE ACCESS POLICY current_user_has_full_access
          ALLOW ALL USING ((.id ?= (GLOBAL default::current_user).id));
      CREATE ACCESS POLICY everyone_insert_only
          ALLOW INSERT ;
  };
  ALTER TYPE default::UserProfile {
      ALTER LINK user {
          RESET OPTIONALITY;
      };
  };
};
