env "local" {
  src = "file://src/db/schema.sql"
  dev = "sqlite://dev?mode=memory"

  migration {
    dir = "file://src/db/migrations-sql"
  }

  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}
