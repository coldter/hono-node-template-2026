import { describe, expect, it, vi } from "vitest";
import type {
  CheckRelationInput,
  CreateRelationInput,
  ListRelationsInput,
  RelationTuple,
} from "../drizzle";
import {
  checkRelation,
  checkRelationBatch,
  createRelation,
  deleteRelation,
  listRelations,
} from "../drizzle";

// ---------------------------------------------------------------------------
// Fake table reference -- structural shape only, values are not used in tests
// ---------------------------------------------------------------------------

const fakeTable = {
  subjectType: "subjectType_col",
  subjectId: "subjectId_col",
  relation: "relation_col",
  objectType: "objectType_col",
  objectId: "objectId_col",
  createdBy: "createdBy_col",
};

// ---------------------------------------------------------------------------
// Helpers to build mock db instances
// ---------------------------------------------------------------------------

function makeSelectDb(rows: RelationTuple[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { db: { select: selectFn }, selectFn, fromFn, whereFn, limitFn };
}

function makeSelectDbNoLimit(rows: RelationTuple[]) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { db: { select: selectFn }, selectFn, fromFn, whereFn };
}

function makeInsertDb() {
  const onConflictFn = vi.fn().mockResolvedValue(undefined);
  const valuesFn = vi
    .fn()
    .mockReturnValue({ onConflictDoNothing: onConflictFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { db: { insert: insertFn }, insertFn, valuesFn, onConflictFn };
}

function makeDeleteDb() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
  return { db: { delete: deleteFn }, deleteFn, whereFn };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const subject = { type: "user", id: "usr_1" };
const object = { type: "document", id: "doc_1" };
const relation = "editor";

const checkInput: CheckRelationInput = { subject, relation, object };

const createInput: CreateRelationInput = {
  subject,
  relation,
  object,
  createdBy: "usr_admin",
};

// ---------------------------------------------------------------------------
// checkRelation
// ---------------------------------------------------------------------------

describe("checkRelation", () => {
  it("returns true when a matching row is found", async () => {
    const rows: RelationTuple[] = [
      {
        subjectType: "user",
        subjectId: "usr_1",
        relation: "editor",
        objectType: "document",
        objectId: "doc_1",
      },
    ];
    const { db } = makeSelectDb(rows);
    const result = await checkRelation(db, fakeTable, checkInput);
    expect(result).toBe(true);
  });

  it("returns false when no matching row is found", async () => {
    const { db } = makeSelectDb([]);
    const result = await checkRelation(db, fakeTable, checkInput);
    expect(result).toBe(false);
  });

  it("calls db.select with the subjectId field", async () => {
    const { db, selectFn } = makeSelectDb([]);
    await checkRelation(db, fakeTable, checkInput);
    expect(selectFn).toHaveBeenCalledOnce();
    expect(selectFn).toHaveBeenCalledWith({ id: fakeTable.subjectId });
  });

  it("calls .from with the table reference", async () => {
    const { db, fromFn } = makeSelectDb([]);
    await checkRelation(db, fakeTable, checkInput);
    expect(fromFn).toHaveBeenCalledWith(fakeTable);
  });

  it("calls .limit(1)", async () => {
    const { db, limitFn } = makeSelectDb([]);
    await checkRelation(db, fakeTable, checkInput);
    expect(limitFn).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// checkRelationBatch
// ---------------------------------------------------------------------------

describe("checkRelationBatch", () => {
  it("returns an empty map for empty input without querying", async () => {
    const { db, selectFn } = makeSelectDbNoLimit([]);
    const result = await checkRelationBatch(db, fakeTable, []);
    expect(result.size).toBe(0);
    expect(selectFn).not.toHaveBeenCalled();
  });

  it("initialises all keys to false before querying", async () => {
    const inputs: CheckRelationInput[] = [
      {
        subject: { type: "user", id: "usr_1" },
        relation: "editor",
        object: { type: "doc", id: "d1" },
      },
      {
        subject: { type: "user", id: "usr_2" },
        relation: "viewer",
        object: { type: "doc", id: "d2" },
      },
    ];
    const { db } = makeSelectDbNoLimit([]);
    const result = await checkRelationBatch(db, fakeTable, inputs);
    expect(result.get("user:usr_1:editor:doc:d1")).toBe(false);
    expect(result.get("user:usr_2:viewer:doc:d2")).toBe(false);
  });

  it("sets matched keys to true based on query results", async () => {
    const inputs: CheckRelationInput[] = [
      {
        subject: { type: "user", id: "usr_1" },
        relation: "editor",
        object: { type: "doc", id: "d1" },
      },
      {
        subject: { type: "user", id: "usr_2" },
        relation: "viewer",
        object: { type: "doc", id: "d2" },
      },
    ];
    const rows: RelationTuple[] = [
      {
        subjectType: "user",
        subjectId: "usr_1",
        relation: "editor",
        objectType: "doc",
        objectId: "d1",
      },
    ];
    const { db } = makeSelectDbNoLimit(rows);
    const result = await checkRelationBatch(db, fakeTable, inputs);
    expect(result.get("user:usr_1:editor:doc:d1")).toBe(true);
    expect(result.get("user:usr_2:viewer:doc:d2")).toBe(false);
  });

  it("returns a map with the same number of keys as inputs", async () => {
    const inputs: CheckRelationInput[] = [
      {
        subject: { type: "user", id: "u1" },
        relation: "r1",
        object: { type: "t", id: "o1" },
      },
      {
        subject: { type: "user", id: "u2" },
        relation: "r2",
        object: { type: "t", id: "o2" },
      },
      {
        subject: { type: "user", id: "u3" },
        relation: "r3",
        object: { type: "t", id: "o3" },
      },
    ];
    const { db } = makeSelectDbNoLimit([]);
    const result = await checkRelationBatch(db, fakeTable, inputs);
    expect(result.size).toBe(3);
  });

  it("ignores query rows that do not match any input key", async () => {
    const inputs: CheckRelationInput[] = [
      {
        subject: { type: "user", id: "usr_1" },
        relation: "editor",
        object: { type: "doc", id: "d1" },
      },
    ];
    const rows: RelationTuple[] = [
      // This row was returned by the broad WHERE but does not match the input tuple
      {
        subjectType: "user",
        subjectId: "usr_1",
        relation: "viewer",
        objectType: "doc",
        objectId: "d99",
      },
    ];
    const { db } = makeSelectDbNoLimit(rows);
    const result = await checkRelationBatch(db, fakeTable, inputs);
    expect(result.get("user:usr_1:editor:doc:d1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createRelation
// ---------------------------------------------------------------------------

describe("createRelation", () => {
  it("calls db.insert with the table", async () => {
    const { db, insertFn } = makeInsertDb();
    await createRelation(db, fakeTable, createInput);
    expect(insertFn).toHaveBeenCalledOnce();
    expect(insertFn).toHaveBeenCalledWith(fakeTable);
  });

  it("calls .values with correctly mapped fields", async () => {
    const { db, valuesFn } = makeInsertDb();
    await createRelation(db, fakeTable, createInput);
    expect(valuesFn).toHaveBeenCalledWith({
      subjectType: "user",
      subjectId: "usr_1",
      relation: "editor",
      objectType: "document",
      objectId: "doc_1",
      createdBy: "usr_admin",
    });
  });

  it("calls .onConflictDoNothing to handle duplicates silently", async () => {
    const { db, onConflictFn } = makeInsertDb();
    await createRelation(db, fakeTable, createInput);
    expect(onConflictFn).toHaveBeenCalledOnce();
  });

  it("resolves to undefined", async () => {
    const { db } = makeInsertDb();
    const result = await createRelation(db, fakeTable, createInput);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteRelation
// ---------------------------------------------------------------------------

describe("deleteRelation", () => {
  it("calls db.delete with the table", async () => {
    const { db, deleteFn } = makeDeleteDb();
    await deleteRelation(db, fakeTable, checkInput);
    expect(deleteFn).toHaveBeenCalledOnce();
    expect(deleteFn).toHaveBeenCalledWith(fakeTable);
  });

  it("calls .where with a condition", async () => {
    const { db, whereFn } = makeDeleteDb();
    await deleteRelation(db, fakeTable, checkInput);
    expect(whereFn).toHaveBeenCalledOnce();
    // The condition argument is a drizzle-orm SQL expression; just verify it was passed
    expect(whereFn.mock.calls[0][0]).toBeDefined();
  });

  it("resolves to undefined", async () => {
    const { db } = makeDeleteDb();
    const result = await deleteRelation(db, fakeTable, checkInput);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listRelations
// ---------------------------------------------------------------------------

describe("listRelations", () => {
  function makeListDb(rows: RelationTuple[]) {
    const whereFn = vi.fn().mockResolvedValue(rows);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    return { db: { select: selectFn }, selectFn, fromFn, whereFn };
  }

  const sampleRows: RelationTuple[] = [
    {
      subjectType: "user",
      subjectId: "usr_1",
      relation: "editor",
      objectType: "document",
      objectId: "doc_1",
    },
    {
      subjectType: "user",
      subjectId: "usr_1",
      relation: "viewer",
      objectType: "document",
      objectId: "doc_2",
    },
  ];

  it("returns matching rows", async () => {
    const { db } = makeListDb(sampleRows);
    const input: ListRelationsInput = {
      subject: { type: "user", id: "usr_1" },
    };
    const result = await listRelations(db, fakeTable, input);
    expect(result).toEqual(sampleRows);
  });

  it("passes a condition when subject is provided", async () => {
    const { db, whereFn } = makeListDb([]);
    await listRelations(db, fakeTable, {
      subject: { type: "user", id: "usr_1" },
    });
    expect(whereFn).toHaveBeenCalledWith(expect.anything());
  });

  it("passes a condition when object is provided", async () => {
    const { db, whereFn } = makeListDb([]);
    await listRelations(db, fakeTable, {
      object: { type: "document", id: "doc_1" },
    });
    expect(whereFn).toHaveBeenCalledWith(expect.anything());
  });

  it("passes a condition when relation is provided", async () => {
    const { db, whereFn } = makeListDb([]);
    await listRelations(db, fakeTable, { relation: "editor" });
    expect(whereFn).toHaveBeenCalledWith(expect.anything());
  });

  it("passes undefined condition when no filters are provided", async () => {
    const { db, whereFn } = makeListDb([]);
    await listRelations(db, fakeTable, {});
    expect(whereFn).toHaveBeenCalledWith(undefined);
  });

  it("returns an empty array when no rows match", async () => {
    const { db } = makeListDb([]);
    const result = await listRelations(db, fakeTable, {
      subject: { type: "user", id: "usr_999" },
    });
    expect(result).toEqual([]);
  });

  it("calls .from with the table reference", async () => {
    const { db, fromFn } = makeListDb([]);
    await listRelations(db, fakeTable, {});
    expect(fromFn).toHaveBeenCalledWith(fakeTable);
  });
});
