CREATE MIGRATION m1g3jylvhh4x6tg6zqznuuawhytby3ktxh6su5hsvmpdo4q7e3asya
    ONTO m14nezhg3pbyhlcrvyi3csp2rni525qcrphoren5nfel27whyhjala
{
  ALTER TYPE default::Vegetable {
      CREATE PROPERTY development_cycle_max: std::int16;
      CREATE PROPERTY development_cycle_min: std::int16;
      ALTER PROPERTY searchable_names {
          USING (((((std::array_join(.names, ' ') ++ ' ') ++ std::array_join(.varieties.names, ' ')) ++ ' ') ++ .handle));
      };
  };
};
