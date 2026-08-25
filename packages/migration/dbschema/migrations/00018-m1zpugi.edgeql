CREATE MIGRATION m1zpugir6q365uznvpi6m37b5hnsnvrr7i7nystx2r7mc6mhjaashq
    ONTO m1owlxvadpmtr2mxf5bleanjneuwvozzygw3m7xbknl6o6jmtmj5ma
{
  ALTER TYPE default::Auditable {
      ALTER TRIGGER log_delete USING (INSERT
          default::HistoryLog
          {
              action := default::HistoryAction.`DELETE`,
              target := __old__,
              performed_by := GLOBAL default::current_user_profile,
              old := <std::json>__old__ {
                  **
              }
          });
      ALTER TRIGGER log_insert USING (INSERT
          default::HistoryLog
          {
              action := default::HistoryAction.`INSERT`,
              target := __new__ {
                  **
              },
              performed_by := __new__.created_by,
              new := <std::json>__new__ {
                  **
              }
          });
      ALTER TRIGGER log_update USING (INSERT
          default::HistoryLog
          {
              action := default::HistoryAction.`UPDATE`,
              target := __new__,
              performed_by := GLOBAL default::current_user_profile,
              old := <std::json>__old__ {
                  **
              },
              new := <std::json>__new__ {
                  **
              }
          });
  };
};
