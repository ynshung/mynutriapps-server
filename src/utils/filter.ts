import { PgSelect } from "drizzle-orm/pg-core";
import { foodProductPublicView, GoalType } from "../db/schema";
import { desc, sql } from "drizzle-orm";

export const SortEnum = {
  NAME_ASC: "name_asc",
  NAME_DESC: "name_desc",
  CREATED_AT_ASC: "created_at_asc",
  CREATED_AT_DESC: "created_at_desc",
  HEALTHINESS_ASC: "healthiness_asc",
  HEALTHINESS_DESC: "healthiness_desc",
};

export type SortType = keyof typeof SortEnum;

export function getSortKey(value?: string): SortType | undefined {
  return Object.entries(SortEnum).find(([, enumValue]) => enumValue === value)?.[0] as SortType | undefined;
}

export function withSort<T extends PgSelect>(
	qb: T,
  sortBy: SortType = "CREATED_AT_DESC",
  goalType: GoalType = "improveHealth",
) {
  switch (sortBy) {
    case "NAME_ASC":
      return qb.orderBy(foodProductPublicView.name);
    case "NAME_DESC":
      return qb.orderBy(desc(foodProductPublicView.name));
    case "CREATED_AT_ASC":
      return qb.orderBy(foodProductPublicView.createdAt);
    case "HEALTHINESS_ASC":
      return qb.orderBy(sql`(${foodProductPublicView.score}->${goalType}::text->>'score')::numeric`);
    case "HEALTHINESS_DESC":
      return qb.orderBy(desc(sql`(${foodProductPublicView.score}->${goalType}::text->>'score')::numeric`));
    default:
      return qb.orderBy(desc(foodProductPublicView.createdAt));
  }
}

// Note with query builder: where will overwrite instead of appending
// See https://github.com/drizzle-team/drizzle-orm/issues/1644#issuecomment-1877442097

export function withPagination<T extends PgSelect>(
	qb: T,
	page: number = 1,
	pageSize: number = 10,
) {
	return qb.limit(pageSize).offset((page - 1) * pageSize);
}
