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
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.relation)),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    relation: text("relation").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
