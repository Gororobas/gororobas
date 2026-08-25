CREATE MIGRATION m1u4pwqvai5iylfpxt5mw2ptmo7yloxpq2cerwoc7zwdyvdbxd6rbq
    ONTO initial
{
  CREATE EXTENSION pgcrypto VERSION '1.3';
  CREATE EXTENSION auth VERSION '1.0';
  CREATE SCALAR TYPE default::Role EXTENDING enum<ADMIN, USER, MODERATOR>;
  CREATE TYPE default::User {
      CREATE REQUIRED LINK identity: ext::auth::Identity {
          ON TARGET DELETE DELETE SOURCE;
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE PROPERTY created: std::datetime {
          CREATE REWRITE
              INSERT 
              USING (std::datetime_of_statement());
      };
      CREATE PROPERTY email: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE PROPERTY updated: std::datetime {
          CREATE REWRITE
              INSERT 
              USING (std::datetime_of_statement());
          CREATE REWRITE
              UPDATE 
              USING (std::datetime_of_statement());
      };
      CREATE PROPERTY userRole: default::Role {
          SET default := 'USER';
      };
  };
  CREATE GLOBAL default::current_user := (std::assert_single((SELECT
      default::User
  FILTER
      (.identity = GLOBAL ext::auth::ClientTokenIdentity)
  )));
  CREATE ABSTRACT TYPE default::AdminCanDoAnything {
      CREATE ACCESS POLICY admin_can_do_anything
          ALLOW ALL USING (((GLOBAL default::current_user).userRole ?= default::Role.ADMIN));
  };
  CREATE ABSTRACT TYPE default::UserCanInsert {
      CREATE ACCESS POLICY authenticated_user_can_insert
          ALLOW INSERT USING (EXISTS (GLOBAL default::current_user));
  };
  CREATE SCALAR TYPE default::EditSuggestionStatus EXTENDING enum<PENDING_REVIEW, MERGED, UNAPPROVED>;
  CREATE ABSTRACT TYPE default::Auditable {
      CREATE PROPERTY created_at: std::datetime {
          SET default := (std::datetime_of_transaction());
          SET readonly := true;
      };
      CREATE PROPERTY updated_at: std::datetime {
          CREATE REWRITE
              INSERT 
              USING (std::datetime_of_statement());
          CREATE REWRITE
              UPDATE 
              USING (std::datetime_of_statement());
      };
  };
  CREATE TYPE default::EditSuggestion EXTENDING default::Auditable, default::AdminCanDoAnything, default::UserCanInsert {
      CREATE REQUIRED PROPERTY diff: std::json;
      CREATE REQUIRED PROPERTY snapshot: std::json;
      CREATE REQUIRED PROPERTY status: default::EditSuggestionStatus;
  };
  CREATE ABSTRACT TYPE default::PublicRead {
      CREATE ACCESS POLICY public_read_only
          ALLOW SELECT ;
  };
  CREATE TYPE default::Image EXTENDING default::PublicRead, default::Auditable, default::UserCanInsert, default::AdminCanDoAnything {
      CREATE PROPERTY crop: std::json;
      CREATE PROPERTY hotspot: std::json;
      CREATE PROPERTY label: std::str;
      CREATE REQUIRED PROPERTY sanity_id: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
  };
  CREATE ABSTRACT TYPE default::WithHandle {
      CREATE REQUIRED PROPERTY handle: std::str {
          CREATE DELEGATED CONSTRAINT std::exclusive;
          CREATE CONSTRAINT std::min_len_value(2);
          CREATE CONSTRAINT std::regexp('^[a-z0-9-]+$');
          CREATE ANNOTATION std::title := 'An unique (per-type) URL-friendly handle';
      };
  };
  CREATE TYPE default::UserProfile EXTENDING default::WithHandle, default::PublicRead {
      CREATE REQUIRED LINK user: default::User {
          ON TARGET DELETE DELETE SOURCE;
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE LINK photo: default::Image;
      CREATE PROPERTY bio: std::json;
      CREATE PROPERTY location: std::str;
      CREATE REQUIRED PROPERTY name: std::str;
      CREATE ACCESS POLICY owner_can_modify
          ALLOW UPDATE USING ((GLOBAL default::current_user ?= .user));
  };
  CREATE GLOBAL default::current_user_profile := (std::assert_single((SELECT
      default::UserProfile
  FILTER
      (.user = GLOBAL default::current_user)
  )));
  ALTER TYPE default::Auditable {
      CREATE LINK created_by: default::UserProfile {
          SET default := (GLOBAL default::current_user_profile);
          ON TARGET DELETE ALLOW;
      };
  };
  CREATE SCALAR TYPE default::SourceType EXTENDING enum<GOROROBAS, EXTERNAL>;
  CREATE TYPE default::Source EXTENDING default::PublicRead, default::UserCanInsert, default::AdminCanDoAnything {
      CREATE MULTI LINK users: default::UserProfile {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
      CREATE PROPERTY comments: std::json;
      CREATE PROPERTY credits: std::str;
      CREATE PROPERTY origin: std::str;
      CREATE REQUIRED PROPERTY type: default::SourceType;
  };
  CREATE SCALAR TYPE default::NoteType EXTENDING enum<EXPERIMENTO, ENSINAMENTO, DESCOBERTA>;
  CREATE TYPE default::Note EXTENDING default::WithHandle, default::Auditable, default::AdminCanDoAnything {
      CREATE ACCESS POLICY owner_can_do_anything
          ALLOW ALL USING ((GLOBAL default::current_user_profile ?= .created_by));
      CREATE REQUIRED PROPERTY public: std::bool;
      CREATE ACCESS POLICY visible_if_public
          ALLOW SELECT USING (.public);
      CREATE PROPERTY body: std::json;
      CREATE REQUIRED PROPERTY published_at: std::datetime {
          SET default := (std::datetime_of_transaction());
      };
      CREATE REQUIRED PROPERTY title: std::json;
      CREATE REQUIRED MULTI PROPERTY types: default::NoteType;
  };
  CREATE SCALAR TYPE default::TipSubject EXTENDING enum<PLANTIO, CRESCIMENTO, COLHEITA>;
  CREATE TYPE default::VegetableTip EXTENDING default::WithHandle, default::PublicRead, default::Auditable, default::AdminCanDoAnything {
      CREATE MULTI LINK sources: default::Source {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
      CREATE REQUIRED PROPERTY content: std::json;
      CREATE REQUIRED MULTI PROPERTY subjects: default::TipSubject;
  };
  CREATE TYPE default::VegetableVariety EXTENDING default::WithHandle, default::PublicRead, default::Auditable, default::UserCanInsert, default::AdminCanDoAnything {
      CREATE MULTI LINK photos: default::Image {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
          CREATE PROPERTY order_index: std::int16;
      };
      CREATE REQUIRED PROPERTY names: array<std::str>;
  };
  CREATE SCALAR TYPE default::EdiblePart EXTENDING enum<FRUTO, FLOR, FOLHA, CAULE, SEMENTE, CASCA, BULBO, BROTO, RAIZ, TUBERCULO, RIZOMA>;
  CREATE SCALAR TYPE default::Gender EXTENDING enum<FEMININO, MASCULINO, NEUTRO>;
  CREATE SCALAR TYPE default::PlantingMethod EXTENDING enum<BROTO, ENXERTO, ESTACA, RIZOMA, SEMENTE, TUBERCULO>;
  CREATE SCALAR TYPE default::Stratum EXTENDING enum<EMERGENTE, ALTO, MEDIO, BAIXO, RASTEIRO>;
  CREATE SCALAR TYPE default::VegetableLifeCycle EXTENDING enum<SEMESTRAL, ANUAL, BIENAL, PERENE>;
  CREATE SCALAR TYPE default::VegetableUsage EXTENDING enum<ALIMENTO_ANIMAL, ALIMENTO_HUMANO, CONSTRUCAO, MATERIA_ORGANICA, MEDICINAL, COSMETICO, ORNAMENTAL, RITUALISTICO, ECOLOGICO>;
  CREATE SCALAR TYPE default::VegetableWishlistStatus EXTENDING enum<QUERO_CULTIVAR, SEM_INTERESSE, JA_CULTIVEI, ESTOU_CULTIVANDO>;
  CREATE TYPE default::Vegetable EXTENDING default::WithHandle, default::PublicRead, default::Auditable, default::UserCanInsert, default::AdminCanDoAnything {
      CREATE MULTI LINK photos: default::Image {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
          CREATE PROPERTY order_index: std::int16;
      };
      CREATE MULTI LINK sources: default::Source {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
      CREATE MULTI LINK tips: default::VegetableTip {
          ON SOURCE DELETE DELETE TARGET;
          ON TARGET DELETE ALLOW;
          CREATE CONSTRAINT std::exclusive;
          CREATE PROPERTY order_index: std::int16;
      };
      CREATE MULTI LINK varieties: default::VegetableVariety {
          ON SOURCE DELETE DELETE TARGET;
          ON TARGET DELETE ALLOW;
          CREATE CONSTRAINT std::exclusive;
          CREATE PROPERTY order_index: std::int16;
      };
      CREATE PROPERTY content: std::json;
      CREATE MULTI PROPERTY edible_parts: default::EdiblePart;
      CREATE PROPERTY gender: default::Gender;
      CREATE PROPERTY height_max: std::float32;
      CREATE PROPERTY height_min: std::float32;
      CREATE MULTI PROPERTY lifecycles: default::VegetableLifeCycle;
      CREATE REQUIRED PROPERTY names: array<std::str>;
      CREATE PROPERTY origin: std::str;
      CREATE MULTI PROPERTY planting_methods: default::PlantingMethod;
      CREATE PROPERTY scientific_names: array<std::str>;
      CREATE MULTI PROPERTY strata: default::Stratum;
      CREATE PROPERTY temperature_max: std::float32;
      CREATE PROPERTY temperature_min: std::float32;
      CREATE MULTI PROPERTY uses: default::VegetableUsage;
  };
  CREATE TYPE default::VegetableFriendship EXTENDING default::Auditable, default::PublicRead, default::AdminCanDoAnything {
      CREATE REQUIRED MULTI LINK vegetables: default::Vegetable {
          ON TARGET DELETE DELETE SOURCE;
          SET readonly := true;
      };
      CREATE REQUIRED PROPERTY unique_key: std::str {
          SET readonly := true;
      };
      CREATE CONSTRAINT std::exclusive ON (.unique_key);
  };
  CREATE TYPE default::UserWishlist EXTENDING default::PublicRead {
      CREATE REQUIRED LINK user_profile: default::UserProfile {
          ON TARGET DELETE DELETE SOURCE;
      };
      CREATE ACCESS POLICY owner_can_do_anything
          ALLOW ALL USING ((GLOBAL default::current_user_profile ?= .user_profile));
      CREATE REQUIRED LINK vegetable: default::Vegetable {
          ON TARGET DELETE DELETE SOURCE;
      };
      CREATE CONSTRAINT std::exclusive ON ((.user_profile, .vegetable));
      CREATE REQUIRED PROPERTY status: default::VegetableWishlistStatus;
  };
  ALTER TYPE default::Vegetable {
      CREATE MULTI LINK friends := (WITH
          parent_id := 
              .id
      SELECT
          .<vegetables[IS default::VegetableFriendship].vegetables
      FILTER
          (.id != parent_id)
      );
  };
  CREATE SCALAR TYPE default::HistoryAction EXTENDING enum<`INSERT`, `UPDATE`, `DELETE`>;
  CREATE TYPE default::HistoryLog {
      CREATE LINK performed_by: default::UserProfile {
          ON TARGET DELETE ALLOW;
      };
      CREATE LINK target: default::Auditable {
          ON TARGET DELETE ALLOW;
      };
      CREATE REQUIRED PROPERTY action: default::HistoryAction;
      CREATE PROPERTY old: std::json;
      CREATE PROPERTY timestamp: std::datetime {
          SET default := (std::datetime_current());
          SET readonly := true;
      };
      CREATE PROPERTY new: std::json;
  };
  ALTER TYPE default::Auditable {
      CREATE TRIGGER log_delete
          AFTER DELETE 
          FOR EACH DO (INSERT
              default::HistoryLog
              {
                  action := default::HistoryAction.`DELETE`,
                  target := __old__,
                  performed_by := GLOBAL default::current_user_profile,
                  old := <std::json>__old__
              });
      CREATE TRIGGER log_insert
          AFTER INSERT 
          FOR EACH DO (INSERT
              default::HistoryLog
              {
                  action := default::HistoryAction.`INSERT`,
                  target := __new__,
                  performed_by := __new__.created_by,
                  new := <std::json>__new__
              });
      CREATE TRIGGER log_update
          AFTER UPDATE 
          FOR EACH DO (INSERT
              default::HistoryLog
              {
                  action := default::HistoryAction.`UPDATE`,
                  target := __new__,
                  performed_by := GLOBAL default::current_user_profile,
                  old := <std::json>__old__,
                  new := <std::json>__new__
              });
  };
  ALTER TYPE default::EditSuggestion {
      CREATE REQUIRED LINK target_object: default::Vegetable;
  };
  ALTER TYPE default::Image {
      CREATE MULTI LINK sources: default::Source {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
  };
  ALTER TYPE default::Note {
      CREATE MULTI LINK related_notes: default::Vegetable {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
      CREATE MULTI LINK related_vegetables: default::Vegetable {
          ON SOURCE DELETE ALLOW;
          ON TARGET DELETE ALLOW;
      };
  };
  ALTER TYPE default::Vegetable {
      CREATE MULTI LINK wishlisted_by := (WITH
          parent_id := 
              .id
      SELECT
          .<vegetable[IS default::UserWishlist]
      FILTER
          (.status != <default::VegetableWishlistStatus>'SEM_INTERESSE')
      );
  };
};
