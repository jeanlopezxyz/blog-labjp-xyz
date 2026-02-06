import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import { SITE } from "@/lib/constants";
import type { APIContext } from "astro";

type BlogPost = CollectionEntry<"blog">;

export async function GET(context: APIContext) {
  const posts: BlogPost[] = (await getCollection("blog"))
    .filter((post: BlogPost) => !post.data.draft)
    .sort((a: BlogPost, b: BlogPost) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: SITE.locales.es.title,
    description: SITE.locales.es.description,
    site: context.site ?? SITE.url,
    items: posts.map((post: BlogPost) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.slug}/`,
      categories: post.data.tags,
    })),
    customData: `<language>es-es</language>`,
  });
}
