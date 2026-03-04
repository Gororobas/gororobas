/**
 * Gel to SQLite Migration CLI
 */
import { main } from "./migration.js"

// Configuration - in a real implementation, this would come from environment variables or config file
const config = {
  gelConnectionString: process.env.GEL_CONNECTION_STRING || "gel://localhost:5656/gororobas",
  sqliteConnectionString: process.env.SQLITE_CONNECTION_STRING || "file:migration.db",
}

// Run the migration
void main(config)
