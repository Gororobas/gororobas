CREATE MIGRATION m1o3kiuhtuwg3v27ffsojzyni3rs75scv6warat3fsmtlkcscyzs7q
    ONTO m1jv56mknkiz4ju2bj4pwcja6mtqajefijbhoejvdue2rcxullslea
{
  CREATE TYPE default::BlueskyPost EXTENDING default::Auditable, default::AdminCanDoAnything {
      CREATE REQUIRED PROPERTY text: std::str;
  };
  CREATE ABSTRACT TYPE default::PostableToBluesky;
  ALTER TYPE default::BlueskyPost {
      CREATE REQUIRED LINK content: default::PostableToBluesky {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
          CREATE CONSTRAINT std::exclusive;
      };
  };
  ALTER TYPE default::Note EXTENDING default::PostableToBluesky LAST;
  ALTER TYPE default::PostableToBluesky {
      CREATE PROPERTY has_been_posted_to_bluesky := (EXISTS (.<content[IS default::BlueskyPost]));
  };
  ALTER TYPE default::Vegetable EXTENDING default::PostableToBluesky LAST;
  ALTER TYPE default::Resource EXTENDING default::PostableToBluesky LAST;
};
