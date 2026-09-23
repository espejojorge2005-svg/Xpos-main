const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("=== Comprobando tablas públicas en Supabase ===");
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"
  );

  for (const table of tables) {
    const tableName = table.tablename;
    console.log(`Habilitando RLS en tabla: "${tableName}"...`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY;`
    );
  }

  console.log("=== Verificando estado final de RLS ===");
  const updatedTables = await prisma.$queryRawUnsafe(
    "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename ASC;"
  );
  console.table(updatedTables);
  console.log("¡RLS habilitado con éxito en todas las tablas!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
