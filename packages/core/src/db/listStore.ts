// Named-list persistence: multiple named lists per user, each with items.
import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "./client.js";
import { lists, listItems } from "./schema.js";

/** Find a user's list by (case-insensitive) name, or create it. */
export async function getOrCreateList(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.userId, userId), ilike(lists.name, trimmed)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(lists)
    .values({ userId, name: trimmed })
    .returning({ id: lists.id });
  if (!created) throw new Error("Failed to create list.");
  return created.id;
}

export async function addItem(listId: string, content: string): Promise<void> {
  await db.insert(listItems).values({ listId, content: content.trim() });
}

export async function getListItems(userId: string, name: string) {
  const [list] = await db
    .select({ id: lists.id, name: lists.name })
    .from(lists)
    .where(and(eq(lists.userId, userId), ilike(lists.name, name.trim())))
    .limit(1);
  if (!list) return null;

  const items = await db
    .select({ id: listItems.id, content: listItems.content, checked: listItems.checked })
    .from(listItems)
    .where(eq(listItems.listId, list.id))
    .orderBy(asc(listItems.checked), asc(listItems.createdAt));
  return { name: list.name, items };
}

export async function getUserLists(userId: string) {
  return db
    .select({ id: lists.id, name: lists.name })
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(asc(lists.name));
}

/** Remove an item from a named list by fuzzy content match. Returns removed text or null. */
export async function removeItem(
  userId: string,
  listName: string,
  itemText: string,
): Promise<string | null> {
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.userId, userId), ilike(lists.name, listName.trim())))
    .limit(1);
  if (!list) return null;

  const [item] = await db
    .select({ id: listItems.id, content: listItems.content })
    .from(listItems)
    .where(and(eq(listItems.listId, list.id), ilike(listItems.content, `%${itemText.trim()}%`)))
    .limit(1);
  if (!item) return null;

  await db.delete(listItems).where(eq(listItems.id, item.id));
  return item.content;
}
