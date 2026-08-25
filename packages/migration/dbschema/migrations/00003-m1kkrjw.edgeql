CREATE MIGRATION m1kkrjwoakklotem566vq6yg5hqdizyk5ve5uz23dfcbdacubppniq
    ONTO m1kdakxaviypvospq4qxwm3kfb33r5z4eiznob3fvddajcdsqgewgq
{
  CREATE ABSTRACT TYPE default::ModeratorCanUpdate {
      CREATE ACCESS POLICY moderator_can_update
          ALLOW UPDATE USING (((GLOBAL default::current_user).userRole ?= default::Role.MODERATOR));
  };
  CREATE ABSTRACT TYPE default::UserCanSelect {
      CREATE ACCESS POLICY authenticated_user_can_select
          ALLOW SELECT USING (EXISTS (GLOBAL default::current_user));
  };
  ALTER TYPE default::EditSuggestion EXTENDING default::UserCanSelect,
  default::ModeratorCanUpdate LAST;
  ALTER SCALAR TYPE default::EditSuggestionStatus EXTENDING enum<PENDING_REVIEW, MERGED, REJECTED>;
};
