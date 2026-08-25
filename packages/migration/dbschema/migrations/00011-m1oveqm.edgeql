CREATE MIGRATION m1oveqmwwvlqvlj6kxnqzq4x5v3uir2omwv7ebux3kzewxejh5edla
    ONTO m1iyl5govxqjv67mj5li2djwza3mb5u77fycrq767corakr6qm7qbq
{
  ALTER SCALAR TYPE default::NoteType EXTENDING enum<EXPERIMENTO, ENSINAMENTO, DESCOBERTA, PERGUNTA, INSPIRACAO>;
};
