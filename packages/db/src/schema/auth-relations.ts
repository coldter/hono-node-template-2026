import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";

export const authRelationsTable = pgTable(
  "auth_relations",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.relation)),
    objectId: text("object_id").notNull(),
    objectType: text("object_type").notNull(),
    relation: text("relation").notNull(),
    subjectId: text("subject_id").notNull(),
    subjectType: text("subject_type").notNull(),
  },
  (t) => [
    uniqueIndex("auth_rel_unique").on(
      t.subjectType,
      t.subjectId,
      t.relation,
      t.objectType,
      t.objectId
    ),
    index("auth_rel_subject_lookup").on(t.subjectType, t.subjectId, t.relation),
    index("auth_rel_object_lookup").on(t.objectType, t.objectId, t.relation),
  ]
);
