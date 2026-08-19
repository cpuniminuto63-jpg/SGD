/* Corrige el clúster de 3 sedes que en el archivo fuente original
 * (BASE_UNIFICADA_4_COORDINADORES_1.xlsx, filas 128-130) compartían por error
 * el mismo "código DANE sede" (244847800284) y el mismo nombre de sede genérico
 * ("SD PPAL"), lo que provocó que solo una institución sobreviviera al choque
 * de la restricción única (dane_code, sede_name) durante la importación original,
 * perdiendo 2 de las 306 sedes esperadas.
 *
 * Verificado contra "ASIGNACIÓN UNIMINUTO FINAL.xlsx" (columna CODIGO_DANE_SEDE):
 * los códigos reales y distintos de cada sede son:
 *   - ISABEL JUSAYU:            244847800284
 *   - FÁTIMA DE NAZARETH:       244847003984
 *   - YERICA GUTIERREZ FAJARDO: 244847003291
 *
 * La fila que sobrevivió en la base (dane_code=244847800284, que en realidad es
 * el código correcto de ISABEL JUSAYU) quedó con los datos de YERICA (la última
 * fila duplicada procesada). Este script:
 *   1) Corrige esa fila para que sea ISABEL JUSAYU (su dane_code ya es correcto).
 *   2) Inserta FÁTIMA DE NAZARETH y YERICA GUTIERREZ FAJARDO como instituciones nuevas.
 *   3) Asigna las 3 a Andrea (coordinadora según el archivo de asignación).
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/fix-jusayu-cluster.ts <admin_profile_id>
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const [adminProfileId] = process.argv.slice(2);
if (!adminProfileId) {
  console.error("Uso: npx tsx scripts/fix-jusayu-cluster.ts <admin_profile_id>");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const [andrea] = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.email, "andrea.ortega.j@uniminuto.edu"))
    .limit(1);
  if (!andrea) throw new Error("No se encontró el perfil de Andrea");

  // 1) Corregir la fila existente para que vuelva a ser ISABEL JUSAYU.
  const [existing] = await db
    .select()
    .from(schema.institutions)
    .where(eq(schema.institutions.daneCode, "244847800284"))
    .limit(1);
  if (!existing) throw new Error("No se encontró la institución con dane_code 244847800284");

  await db
    .update(schema.institutions)
    .set({
      sedeName: "SD PPAL",
      institutionName: "INSTITUCION ETNOEDUCTIVA INTEGRAL RURAL ISABEL JUSAYU",
      department: "GUAJIRA",
      municipality: "URIBIA",
      linea: "L3",
      coordinatorName: "ANGÉLICA",
      mentorName: "JAIRIS CHARRIS",
      mentorIdentifier: "1124521587",
    })
    .where(eq(schema.institutions.id, existing.id));
  console.log(`✓ Corregida: ${existing.id} -> ISABEL JUSAYU (dane_code 244847800284)`);

  // 2) Insertar las 2 sedes que faltaban.
  const toCreate = [
    {
      daneCode: "244847003984",
      sedeName: "SD PPAL",
      institutionName: "INSTITUCION ETNOEDUCATIVA INTEGRAL RURAL DE NUESTRA SEÑORA DE FATIMA DE NAZARETH",
      department: "GUAJIRA",
      municipality: "URIBIA",
      linea: "L1" as const,
      coordinatorName: "ANGÉLICA",
      mentorName: "PAOLA ANDREA FORERO BARRERA",
      mentorIdentifier: "36695870",
    },
    {
      daneCode: "244847003291",
      sedeName: "SD PPAL",
      institutionName: "INSTITUCION ETNOEDUCATIVA INTEGRAL RURAL YERICA GUTIERREZ FAJARDO",
      department: "GUAJIRA",
      municipality: "URIBIA",
      linea: "L1" as const,
      coordinatorName: "ANGÉLICA",
      mentorName: "LUIS JOSE SILVA POLO",
      mentorIdentifier: "1124029695",
    },
  ];

  const institutionIds = [existing.id];
  for (const inst of toCreate) {
    const [already] = await db
      .select({ id: schema.institutions.id })
      .from(schema.institutions)
      .where(eq(schema.institutions.daneCode, inst.daneCode))
      .limit(1);
    if (already) {
      console.log(`= Ya existía: ${inst.institutionName} (${inst.daneCode})`);
      institutionIds.push(already.id);
      continue;
    }
    const [created] = await db.insert(schema.institutions).values(inst).returning();
    console.log(`+ Creada: ${inst.institutionName} (${inst.daneCode}) -> ${created.id}`);
    institutionIds.push(created.id);
  }

  // 3) Asignar las 3 a Andrea (idempotente: profileId + institutionId).
  for (const institutionId of institutionIds) {
    const [exists] = await db
      .select({ id: schema.reviewerAssignments.id })
      .from(schema.reviewerAssignments)
      .where(and(eq(schema.reviewerAssignments.profileId, andrea.id), eq(schema.reviewerAssignments.institutionId, institutionId)));
    if (exists) {
      console.log(`= Asignación ya existe: Andrea -> institución ${institutionId}`);
      continue;
    }
    await db.insert(schema.reviewerAssignments).values({
      profileId: andrea.id,
      institutionId,
      assignedBy: adminProfileId,
      active: true,
    });
    console.log(`+ Asignada a Andrea: institución ${institutionId}`);
  }

  const countResult = await db.execute(sql`select count(*)::int as count from institutions`);
  const total = (countResult as unknown as { count: number }[])[0]?.count;
  console.log("Total instituciones ahora:", total);

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
