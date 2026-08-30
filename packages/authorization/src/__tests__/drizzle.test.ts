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

type FakeTable = Parameters<typeof checkRelation>[1];

const fakeTable = {
  createdBy: "createdBy_col",
  objectId: "objectId_col",
  objectType: "objectType_col",
  relation: "relation_col",
  subjectId: "subjectId_col",
  subjectType: "subjectType_col",
} as unknown as FakeTable;

function makeSelectDb(rows: RelationTuple[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { db: { select: selectFn }, fromFn, limitFn, selectFn, whereFn };
}

function makeSelectDbNoLimit(rows: RelationTuple[]) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { db: { select: selectFn }, fromFn, selectFn, whereFn };
}

function makeInsertDb() {
  const onConflictFn = vi.fn().mockResolvedValue(undefined);
  const valuesFn = vi
    .fn()
    .mockReturnValue({ onConflictDoNothing: onConflictFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { db: { insert: insertFn }, insertFn, onConflictFn, valuesFn };
}

function makeDeleteDb() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
  return { db: { delete: deleteFn }, deleteFn, whereFn };
}

const subject = { id: "usr_1", type: "user" };
const object = { id: "doc_1", type: "document" };
const relation = "editor";

const checkInput: CheckRelationInput = { object, relation, subject };

const createInput: CreateRelationInput = {
  createdBy: "usr_admin",
  object,
  relation,
  subject,
};

describe("checkRelation", () => {
  it("returns true when a matching row is found", async () => {
    const rows: RelationTuple[] = [
      {
        objectId: "doc_1",
        objectType: "document",
        relation: "editor",
        subjectId: "usr_1",
        subjectType: "user",
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
        object: { id: "d1", type: "doc" },
        relation: "editor",
        subject: { id: "usr_1", type: "user" },
      },
      {
        object: { id: "d2", type: "doc" },
        relation: "viewer",
        subject: { id: "usr_2", type: "user" },
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
        object: { id: "d1", type: "doc" },
        relation: "editor",
        subject: { id: "usr_1", type: "user" },
      },
      {
        object: { id: "d2", type: "doc" },
        relation: "viewer",
        subject: { id: "usr_2", type: "user" },
      },
    ];
    const rows: RelationTuple[] = [
      {
        objectId: "d1",
        objectType: "doc",
        relation: "editor",
        subjectId: "usr_1",
        subjectType: "user",
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
        object: { id: "o1", type: "t" },
        relation: "r1",
        subject: { id: "u1", type: "user" },
      },
      {
        object: { id: "o2", type: "t" },
        relation: "r2",
        subject: { id: "u2", type: "user" },
      },
      {
        object: { id: "o3", type: "t" },
        relation: "r3",
        subject: { id: "u3", type: "user" },
      },
    ];
    const { db } = makeSelectDbNoLimit([]);
    const result = await checkRelationBatch(db, fakeTable, inputs);
    expect(result.size).toBe(3);
  });

  it("ignores query rows that do not match any input key", async () => {
    const inputs: CheckRelationInput[] = [
      {
        object: { id: "d1", type: "doc" },
        relation: "editor",
        subject: { id: "usr_1", type: "user" },
      },
    ];
    const rows: RelationTuple[] = [
      {
        objectId: "d99",
        objectType: "doc",
        relation: "viewer",
        subjectId: "usr_1",
        subjectType: "user",
      },
    ];
    const { db } = makeSelectDbNoLimit(rows);
    const result = await checkRelationBatch(db, fakeTable, inputs);
    expect(result.get("user:usr_1:editor:doc:d1")).toBe(false);
  });
});

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
      createdBy: "usr_admin",
      objectId: "doc_1",
      objectType: "document",
      relation: "editor",
      subjectId: "usr_1",
      subjectType: "user",
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

    expect(whereFn.mock.calls[0]?.[0]).toBeDefined();
  });

  it("resolves to undefined", async () => {
    const { db } = makeDeleteDb();
    const result = await deleteRelation(db, fakeTable, checkInput);
    expect(result).toBeUndefined();
  });
});

describe("listRelations", () => {
  function makeListDb(rows: RelationTuple[]) {
    const whereFn = vi.fn().mockResolvedValue(rows);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    return { db: { select: selectFn }, fromFn, selectFn, whereFn };
  }

  const sampleRows: RelationTuple[] = [
    {
      objectId: "doc_1",
      objectType: "document",
      relation: "editor",
      subjectId: "usr_1",
      subjectType: "user",
    },
    {
      objectId: "doc_2",
      objectType: "document",
      relation: "viewer",
      subjectId: "usr_1",
      subjectType: "user",
    },
  ];

  it("returns matching rows", async () => {
    const { db } = makeListDb(sampleRows);
    const input: ListRelationsInput = {
      subject: { id: "usr_1", type: "user" },
    };
    const result = await listRelations(db, fakeTable, input);
    expect(result).toEqual(sampleRows);
  });

  it("passes a condition when subject is provided", async () => {
    const { db, whereFn } = makeListDb([]);
    await listRelations(db, fakeTable, {
      subject: { id: "usr_1", type: "user" },
    });
    expect(whereFn).toHaveBeenCalledWith(expect.anything());
  });

  it("passes a condition when object is provided", async () => {
    const { db, whereFn } = makeListDb([]);
    await listRelations(db, fakeTable, {
      object: { id: "doc_1", type: "document" },
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
      subject: { id: "usr_999", type: "user" },
    });
    expect(result).toEqual([]);
  });

  it("calls .from with the table reference", async () => {
    const { db, fromFn } = makeListDb([]);
    await listRelations(db, fakeTable, {});
    expect(fromFn).toHaveBeenCalledWith(fakeTable);
  });
});
