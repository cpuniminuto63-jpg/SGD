// Tipos derivados del esquema Drizzle (src/lib/db/schema.ts), en un archivo aparte
// para poder importarlos sin arrastrar el cliente de base de datos (útil en .d.ts).
import type {
  userRoleEnum,
  reviewStatusEnum,
  lineaCpeEnum,
  actorTipoEnum,
  extensionValidaEnum,
  importKindEnum,
  importStatusEnum,
  ruleStatusEnum,
  findingTypeEnum,
  priorityLevelEnum,
} from "./schema";

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
export type LineaCPE = (typeof lineaCpeEnum.enumValues)[number];
export type ActorTipo = (typeof actorTipoEnum.enumValues)[number];
export type ExtensionValida = (typeof extensionValidaEnum.enumValues)[number];
export type ImportKind = (typeof importKindEnum.enumValues)[number];
export type ImportStatus = (typeof importStatusEnum.enumValues)[number];
export type RuleStatus = (typeof ruleStatusEnum.enumValues)[number];
export type FindingType = (typeof findingTypeEnum.enumValues)[number];
export type PriorityLevel = (typeof priorityLevelEnum.enumValues)[number];
