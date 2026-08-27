// Ejecuta un archivo .sql de supabase/migrations/ contra DATABASE_URL.
// Uso: node scripts/run-migration.js supabase/migrations/0003_estado_solicitud.sql
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error("Uso: node scripts/run-migration.js <archivo.sql>");
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(archivo), "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log(`Migración aplicada: ${archivo}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
