CREATE MIGRATION m176z2s6sefjq3rhyet7ybf6rwdl6i4dvlxcu5evpyrrhd36gebcoq
    ONTO m1puudca5fxucuugvtlji7eqmnye437bncaainifoukxlz7nc6fnda
{
  ALTER TYPE default::Note {
      CREATE REQUIRED PROPERTY content_plain_text: std::str {
          SET default := '';
          CREATE ANNOTATION std::title := 'Plain text representation of title and body for full-text search';
      };
  };
};
