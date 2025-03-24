import { listCategory, getCategory, addCategory, updateCategory, deleteCategory } from "../src/routes/category";
import { foodCategoryTable } from "../src/db/schema";
import { db } from "../src/db";
import { describe, expect, test, vi } from "vitest";

describe("Category Routes", () => {
  const mockCategory = { id: 3, name: "Dairy" };

  test("listCategory should return a list of categories", async () => {
    const dbSpy = vi.spyOn(db, "select");
    const result = await listCategory();

    expect(result).toBeInstanceOf(Object);
    expect(Object.keys(result).length).toBeGreaterThan(100);
    expect(result[0]).toEqual("Uncategorized");
    expect(result[820]).toEqual("Milk");
    expect(dbSpy).toHaveBeenCalled();

    dbSpy.mockRestore();
  });

  test("getCategory should return a category", async () => {
    const dbSpy = vi.spyOn(db, "select");
    
    const result = await getCategory(820);
    expect(result).toEqual({ id: 820, name: "Milk" });
    expect(dbSpy).toHaveBeenCalled();
    
    dbSpy.mockRestore();
  });

  test("getCategory should not return a category that does not exist", async () => {
    const dbSpy = vi.spyOn(db, "select");

    const result = await getCategory(99999);
    expect(result).toBeUndefined();
    expect(dbSpy).toHaveBeenCalled();
    dbSpy.mockRestore();
  });

  test("addCategory should insert a new category and return it", async () => {
    const dbSpy = vi.spyOn(db, "insert");

    const result = await addCategory(mockCategory["id"], mockCategory["name"]);

    expect(result).toEqual(mockCategory);
    expect(dbSpy).toHaveBeenCalledWith(foodCategoryTable);

    await deleteCategory(mockCategory["id"]);
    dbSpy.mockRestore();
  });
  
  test("updateCategory should update a category and return it", async () => {
    const dbSpy = vi.spyOn(db, "update");

    await addCategory(mockCategory["id"], mockCategory["name"]);
    const result = await updateCategory(mockCategory["id"], "Milk");

    expect(result).toEqual([{ id: mockCategory["id"], name: "Milk" }]);
    expect(dbSpy).toHaveBeenCalledWith(foodCategoryTable);

    await deleteCategory(mockCategory["id"]);
    dbSpy.mockRestore();
  });

  test("updateCategory should not update a category that does not exist", async () => {
    const dbSpy = vi.spyOn(db, "update");

    const result = await updateCategory(99999, "Non-existent category");
    expect(result).toEqual([]);
    expect(dbSpy).toHaveBeenCalled();
    dbSpy.mockRestore();
  });

  test("deleteCategory should delete a category", async () => {
    const dbSpy = vi.spyOn(db, "delete");

    await addCategory(mockCategory["id"], mockCategory["name"]);
    const result = await deleteCategory(mockCategory["id"]);

    expect(result).toEqual([{ id: mockCategory["id"], name: mockCategory["name"] }]);
    expect(dbSpy).toHaveBeenCalledWith(foodCategoryTable);

    expect(await listCategory()).not.toContain(mockCategory["id"]);
    dbSpy.mockRestore();
  });

  test("deleteCategory should not delete a category that does not exist", async () => {
    const dbSpy = vi.spyOn(db, "delete");

    const result = await deleteCategory(99999);
    expect(result).toEqual([]);
    expect(dbSpy).toHaveBeenCalled();
    dbSpy.mockRestore();
  });
});