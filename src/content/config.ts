import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
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
  type: "data",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    repo: z.string().url(),
    demo: z.string().url().optional(),
    image: z.string().optional(),
    tech: z.array(z.string()),
    category: z.enum(["library", "tool", "cli", "web", "other"]),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const notes = defineCollection({
  type: "content",
  schema: z.object({
    pubDate: z.coerce.date(),
    source: z.enum(["linkedin", "twitter", "mastodon", "original"]).default("original"),
    sourceUrl: z.string().url().optional(),
    link: z.object({
      url: z.string().url(),
      title: z.string(),
      domain: z.string(),
      image: z.string().optional(),
    }).optional(),
    image: z.string().optional(),
  }),
});

export const collections = {
  blog,
  projects,
  notes,
};
