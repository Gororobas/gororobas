CREATE MIGRATION m1jv56mknkiz4ju2bj4pwcja6mtqajefijbhoejvdue2rcxullslea
    ONTO m1csnewtis2f55icqqcl63jd25ot5umeuzzgbmdptwvsmrdff5pp5a
{
  CREATE SCALAR TYPE default::ResourceFormat EXTENDING enum<BOOK, FILM, SOCIAL_MEDIA, VIDEO, ARTICLE, PODCAST, COURSE, ACADEMIC_WORK, DATASET, ORGANIZATION, OTHER>;
  CREATE ABSTRACT TYPE default::WithTags;
  CREATE TYPE default::Resource EXTENDING default::WithHandle, default::WithTags, default::PublicRead, default::Auditable, default::UserCanInsert, default::AdminCanDoAnything {
      CREATE MULTI LINK related_vegetables: default::Vegetable {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
          CREATE PROPERTY order_index: std::int16;
      };
      CREATE LINK thumbnail: default::Image;
      CREATE PROPERTY credit_line: std::str;
      CREATE PROPERTY description: std::json;
      CREATE REQUIRED PROPERTY format: default::ResourceFormat;
      CREATE REQUIRED PROPERTY title: std::str;
      CREATE REQUIRED PROPERTY url: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
  };
  ALTER TYPE default::Vegetable {
      CREATE LINK related_resources := (.<related_vegetables[IS default::Resource]);
  };
  CREATE TYPE default::Tag EXTENDING default::WithHandle, default::PublicRead, default::AdminCanDoAnything {
      CREATE PROPERTY category: std::str {
          CREATE ANNOTATION std::title := 'Arbitrary categories to group tags together in the app';
      };
      CREATE PROPERTY description: std::json;
      CREATE REQUIRED PROPERTY names: array<std::str>;
  };
  ALTER TYPE default::WithTags {
      CREATE MULTI LINK tags: default::Tag {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
          CREATE PROPERTY order_index: std::int16;
      };
  };
  ALTER TYPE default::Tag {
      CREATE LINK mentions := (.<tags[IS default::WithTags]);
  };
};
