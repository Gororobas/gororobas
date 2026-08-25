CREATE MIGRATION m1iyl5govxqjv67mj5li2djwza3mb5u77fycrq767corakr6qm7qbq
    ONTO m16erlzmwbz53lsnwkcickjocwumnzehgeuphtopg4zld5bebkpvqa
{
  CREATE EXTENSION pg_trgm VERSION '1.6';
  ALTER TYPE default::Vegetable {
      ALTER PROPERTY searchable_names {
          USING (std::array_join(((.names ++ std::array_agg(std::array_join(.varieties.names, ' '))) ++ [.handle]), ' '));
      };
  };
};
