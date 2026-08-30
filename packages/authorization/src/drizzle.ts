import { and, type Column, eq, inArray, type SQL } from "drizzle-orm";

export interface RelationTuple {
  objectId: string;
  objectType: string;
  relation: string;
  subjectId: string;
  subjectType: string;
}

export interface RelationEntity {
  id: string;
  type: string;
}

export interface CreateRelationInput {
  createdBy: string;
  object: RelationEntity;
  relation: string;
  subject: RelationEntity;
}

export interface CheckRelationInput {
  object: RelationEntity;
  relation: string;
  subject: RelationEntity;
}

export interface ListRelationsInput {
  object?: RelationEntity;
  relation?: string;
  subject?: RelationEntity;
}

type AuthRelationsTable = {
  subjectType: Column;
  subjectId: Column;
  relation: Column;
  objectType: Column;
  objectId: Column;
  createdBy: Column;
};

type SelectChain<TRow> = {
  from: (table: unknown) => {
    where: (condition: unknown) => Promise<TRow[]> & {
      limit: (n: number) => Promise<TRow[]>;
    };
  };
};

export type DrizzleLike = {
  select: <TRow>(fields: Record<string, unknown>) => SelectChain<TRow>;
  insert: (table: unknown) => {
    values: (data: Record<string, unknown>) => {
      onConflictDoNothing: () => Promise<void>;
    };
  };
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<void>;
  };
};

export async function checkRelation(
  db: Pick<DrizzleLike, "select">,
  table: AuthRelationsTable,
  input: CheckRelationInput
): Promise<boolean> {
  const result = await db
    .select<{ id: string }>({ id: table.subjectId })
    .from(table)
    .where(
      and(
        eq(table.subjectType, input.subject.type),
        eq(table.subjectId, input.subject.id),
        eq(table.relation, input.relation),
        eq(table.objectType, input.object.type),
        eq(table.objectId, input.object.id)
      )
    )
    .limit(1);
  return result.length > 0;
}

export async function checkRelationBatch(
  db: Pick<DrizzleLike, "select">,
  table: AuthRelationsTable,
  inputs: CheckRelationInput[]
): Promise<Map<string, boolean>> {
  const keyMap = new Map<string, boolean>();
  for (const input of inputs) {
    keyMap.set(tupleKey(input), false);
  }

  if (inputs.length === 0) {
    return keyMap;
  }

  const results = await db
    .select<RelationTuple>({
      objectId: table.objectId,
      objectType: table.objectType,
      relation: table.relation,
      subjectId: table.subjectId,
      subjectType: table.subjectType,
    })
    .from(table)
    .where(
      and(
        inArray(
          table.subjectId,
          inputs.map((i) => i.subject.id)
        ),
        inArray(table.relation, [...new Set(inputs.map((i) => i.relation))])
      )
    );

  for (const row of results) {
    const key = `${row.subjectType}:${row.subjectId}:${row.relation}:${row.objectType}:${row.objectId}`;
    if (keyMap.has(key)) {
      keyMap.set(key, true);
    }
  }

  return keyMap;
}

export async function createRelation(
  db: Pick<DrizzleLike, "insert">,
  table: AuthRelationsTable,
  input: CreateRelationInput
): Promise<void> {
  await db
    .insert(table)
    .values({
      createdBy: input.createdBy,
      objectId: input.object.id,
      objectType: input.object.type,
      relation: input.relation,
      subjectId: input.subject.id,
      subjectType: input.subject.type,
    })
    .onConflictDoNothing();
}

export async function deleteRelation(
  db: Pick<DrizzleLike, "delete">,
  table: AuthRelationsTable,
  input: CheckRelationInput
): Promise<void> {
  await db
    .delete(table)
    .where(
      and(
        eq(table.subjectType, input.subject.type),
        eq(table.subjectId, input.subject.id),
        eq(table.relation, input.relation),
        eq(table.objectType, input.object.type),
        eq(table.objectId, input.object.id)
      )
    );
}

export async function listRelations(
  db: Pick<DrizzleLike, "select">,
  table: AuthRelationsTable,
  input: ListRelationsInput
): Promise<RelationTuple[]> {
  const conditions: SQL[] = [];
  if (input.subject) {
    conditions.push(eq(table.subjectType, input.subject.type));
    conditions.push(eq(table.subjectId, input.subject.id));
  }
  if (input.object) {
    conditions.push(eq(table.objectType, input.object.type));
    conditions.push(eq(table.objectId, input.object.id));
  }
  if (input.relation) {
    conditions.push(eq(table.relation, input.relation));
  }

  const results = await db
    .select<RelationTuple>({
      objectId: table.objectId,
      objectType: table.objectType,
      relation: table.relation,
      subjectId: table.subjectId,
      subjectType: table.subjectType,
    })
    .from(table)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return results;
}

function tupleKey(input: CheckRelationInput): string {
  return `${input.subject.type}:${input.subject.id}:${input.relation}:${input.object.type}:${input.object.id}`;
}
