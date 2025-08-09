import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull(),
  publishedAt: timestamp("published_at").notNull(),
  readTime: integer("read_time").notNull(),
  sourceCount: integer("source_count").notNull(),
  heroImageUrl: text("hero_image_url").notNull(),
  authorName: text("author_name"),
  authorTitle: text("author_title"),
});

export const executiveSummary = pgTable("executive_summary", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id),
  points: text("points").array().notNull(),
});

export const timelineItems = pgTable("timeline_items", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id),
  date: timestamp("date").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // 'announcement', 'release', etc.
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
});

export const citedSources = pgTable("cited_sources", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // e.g., "Government Document", "News Article", "Official Statement"
  description: text("description").notNull(),
  url: text("url"),
  imageUrl: text("image_url").notNull(),
});

export const rawFacts = pgTable("raw_facts", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id),
  category: text("category").notNull(),
  facts: text("facts").array().notNull(),
});

export const perspectives = pgTable("perspectives", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id),
  viewpoint: text("viewpoint").notNull(),
  description: text("description").notNull(),
  source: text("source"),
  quote: text("quote"),
  color: text("color").notNull(), // 'green', 'yellow', 'blue', etc.
  url: text("url"),
  reasoning: text("reasoning"),
  evidence: text("evidence"),
  conflictSource: text("conflict_source"), // The opposing source
  conflictQuote: text("conflict_quote"), // The opposing quote
  conflictUrl: text("conflict_url"), // The opposing URL
});

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
});

export const insertExecutiveSummarySchema = createInsertSchema(executiveSummary).omit({
  id: true,
});

export const insertTimelineItemSchema = createInsertSchema(timelineItems).omit({
  id: true,
});

export const insertCitedSourceSchema = createInsertSchema(citedSources).omit({
  id: true,
});

export const insertRawFactsSchema = createInsertSchema(rawFacts).omit({
  id: true,
});

export const insertPerspectiveSchema = createInsertSchema(perspectives).omit({
  id: true,
});

// This is the interface used by the frontend and some services, not the drizzle schema
export interface Perspective {
  id: number;
  articleId: number;
  viewpoint: string;
  description: string;
  source: string;
  quote: string;
  color: string;
  url: string | null;
  reasoning: string | null;
  evidence: string | null;
  conflictSource: string | null;
  conflictQuote: string | null;
  conflictUrl: string | null;
}

export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type ExecutiveSummary = typeof executiveSummary.$inferSelect;
export type InsertExecutiveSummary = z.infer<typeof insertExecutiveSummarySchema>;
export type TimelineItem = typeof timelineItems.$inferSelect;
export type InsertTimelineItem = z.infer<typeof insertTimelineItemSchema>;
export type CitedSource = typeof citedSources.$inferSelect;
export type InsertCitedSource = z.infer<typeof insertCitedSourceSchema>;
export type RawFacts = typeof rawFacts.$inferSelect;
export type InsertRawFacts = z.infer<typeof insertRawFactsSchema>;
// This is the type inferred from the drizzle schema
export type DrizzlePerspective = typeof perspectives.$inferSelect;
export type InsertPerspective = z.infer<typeof insertPerspectiveSchema>;


export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
