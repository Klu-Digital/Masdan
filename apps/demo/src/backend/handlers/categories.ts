import type { Section } from "../router";
import { db } from "../store";
import type { Category } from "../store";
import { find, newId } from "../util";

const setArchived = (categoryId: string, archived: boolean): Category => {
  const category = find(db().categories, categoryId, "Category");
  category.archivedAt = archived ? new Date() : null;
  category.updatedAt = new Date();
  return category;
};

export const categories: Section<"categories"> = {
  archive: ({ categoryId }) => setArchived(categoryId, true),

  create: (input) => {
    const now = new Date();
    const category: Category = {
      archivedAt: null,
      color: input.color,
      createdAt: now,
      icon: input.icon,
      id: newId(),
      name: input.name,
      organizationId: db().household.id,
      sortOrder:
        input.sortOrder ??
        Math.max(0, ...db().categories.map((row) => row.sortOrder)) + 10,
      type: input.type,
      updatedAt: now,
    };
    db().categories.push(category);
    return category;
  },

  list: (input) =>
    db()
      .categories.filter(
        (row) => input?.includeArchived === true || row.archivedAt === null
      )
      .toSorted(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      ),

  restore: ({ categoryId }) => setArchived(categoryId, false),

  update: ({ categoryId, ...values }) => {
    const category = find(db().categories, categoryId, "Category");
    Object.assign(category, {
      color: values.color,
      icon: values.icon,
      name: values.name,
      sortOrder: values.sortOrder ?? category.sortOrder,
      type: values.type,
      updatedAt: new Date(),
    });
    return category;
  },
};
