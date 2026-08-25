CREATE MIGRATION m16erlzmwbz53lsnwkcickjocwumnzehgeuphtopg4zld5bebkpvqa
    ONTO m1g3jylvhh4x6tg6zqznuuawhytby3ktxh6su5hsvmpdo4q7e3asya
{
  ALTER TYPE default::Image {
      ALTER LINK sources {
          CREATE PROPERTY order_index: std::int16;
      };
  };
  ALTER TYPE default::Vegetable {
      ALTER LINK sources {
          CREATE PROPERTY order_index: std::int16;
      };
  };
  ALTER TYPE default::VegetableTip {
      ALTER LINK sources {
          CREATE PROPERTY order_index: std::int16;
      };
  };
};
