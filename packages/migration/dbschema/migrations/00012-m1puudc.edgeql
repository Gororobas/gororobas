CREATE MIGRATION m1puudca5fxucuugvtlji7eqmnye437bncaainifoukxlz7nc6fnda
    ONTO m1oveqmwwvlqvlj6kxnqzq4x5v3uir2omwv7ebux3kzewxejh5edla
{
  ALTER TYPE default::Vegetable {
      ALTER PROPERTY searchable_names {
          USING (std::array_join((((.names ++ std::array_agg(std::array_join(.varieties.names, ' '))) ++ std::array_agg(std::array_join(.scientific_names, ' '))) ++ [.handle]), ' '));
      };
  };
};
