import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import { SITE } from "@/lib/constants";
import { isPostForLang, normalizeSlug } from "@/i18n";
import type { APIContext } from "astro";

type BlogPost = CollectionEntry<"blog">;

export async function GET(context: APIContext) {
  const posts: BlogPost[] = (await getCollection("blog"))
    .filter(
      (post: BlogPost) => !post.data.draft && isPostForLang(post.id, "es"),
    )
    .sort(
      (a: BlogPost, b: BlogPost) =>
        b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    );

  return rss({
    title: SITE.locales.es.title,
    description: SITE.locales.es.description,
    site: context.site ?? SITE.url,
    items: posts.map((post: BlogPost) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/es/blog/${normalizeSlug(post.id)}/`,
      categories: post.data.tags,
    })),
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>es-es</language><atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml" />`,
  });
}
