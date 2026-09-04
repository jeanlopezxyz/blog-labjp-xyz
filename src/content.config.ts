import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    categories: z.array(z.enum(["kubernetes", "openshift", "cloud-native", "ia", "comunidad", "devops"])).default([]),
    featured: z.boolean().default(false),
    lang: z.enum(["es", "en"]).default("es"),
  }),
});

const projects = defineCollection({
  loader: glob({ base: "./src/content/projects", pattern: "**/*.{yaml,yml,json}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    repo: z.url(),
    demo: z.url().optional(),
    image: z.string().optional(),
    tech: z.array(z.string()),
    category: z.enum(["library", "tool", "cli", "web", "other"]),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const notes = defineCollection({
  loader: glob({ base: "./src/content/notes", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    pubDate: z.coerce.date(),
    source: z.enum(["linkedin", "twitter", "mastodon", "original"]).default("original"),
    sourceUrl: z.url().optional(),
    link: z.object({
      url: z.url(),
      title: z.string(),
      domain: z.string(),
      image: z.string().optional(),
    }).optional(),
    image: z.string().optional(),
  }),
});

export const collections = { blog, projects, notes };
