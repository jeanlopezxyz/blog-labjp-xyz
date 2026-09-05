import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import { SITE } from "@/lib/constants";
import { isPostForLang, normalizeSlug } from "@/i18n";
import type { APIContext } from "astro";

type BlogPost = CollectionEntry<"blog">;

export async function GET(context: APIContext) {
  const posts: BlogPost[] = (await getCollection("blog"))
    .filter(
      (post: BlogPost) => !post.data.draft && isPostForLang(post.id, "en"),
    )
    .sort(
      (a: BlogPost, b: BlogPost) =>
        b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
    );

  return rss({
    title: SITE.locales.en.title,
    description: SITE.locales.en.description,
    site: context.site ?? SITE.url,
    items: posts.map((post: BlogPost) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/en/blog/${normalizeSlug(post.id)}/`,
      categories: post.data.tags,
    })),
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>en-us</language><atom:link href="${SITE.url}/en/rss.xml" rel="self" type="application/rss+xml" />`,
  });
}
