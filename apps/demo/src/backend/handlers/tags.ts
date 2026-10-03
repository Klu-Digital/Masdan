import type { Section } from "../router";
import { db } from "../store";
import type { Tag } from "../store";
import { find, newId } from "../util";

const setArchived = (tagId: string, archived: boolean): Tag => {
  const tag = find(db().tags, tagId, "Tag");
  tag.archivedAt = archived ? new Date() : null;
  tag.updatedAt = new Date();
  return tag;
};

export const tags: Section<"tags"> = {
  archive: ({ tagId }) => setArchived(tagId, true),

  create: (input) => {
    const now = new Date();
    const tag: Tag = {
      archivedAt: null,
      color: input.color,
      createdAt: now,
      id: newId(),
      name: input.name,
      organizationId: db().household.id,
      updatedAt: now,
    };
    db().tags.push(tag);
    return tag;
  },

  list: (input) =>
    db()
      .tags.filter(
        (row) => input?.includeArchived === true || row.archivedAt === null
      )
      .toSorted((a, b) => a.name.localeCompare(b.name)),

  restore: ({ tagId }) => setArchived(tagId, false),

  update: ({ tagId, ...values }) => {
    const tag = find(db().tags, tagId, "Tag");
    Object.assign(tag, { ...values, updatedAt: new Date() });
    return tag;
  },
};
