CREATE MIGRATION m14nezhg3pbyhlcrvyi3csp2rni525qcrphoren5nfel27whyhjala
    ONTO m15ugwsu5pwnwqwvtzwenpcdt6kcnbsfoynl4hk2jjvcyw5g5aiw2a
{
  ALTER TYPE default::Vegetable {
      CREATE PROPERTY searchable_names := (((std::array_join(.names, ' ') ++ ' ') ++ .handle));
  };
};
