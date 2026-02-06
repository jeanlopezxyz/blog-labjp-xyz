import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

type BlogPost = CollectionEntry<"blog">;

export const GET: APIRoute = async () => {
  const posts: BlogPost[] = await getCollection("blog", ({ data }: BlogPost) => !data.draft);

  const searchData = posts.map((post: BlogPost) => ({
    title: post.data.title,
    description: post.data.description,
    slug: post.slug,
    categories: post.data.categories,
  }));

  return new Response(JSON.stringify(searchData), {
    headers: {
      "Content-Type": "application/json",
    },
  });
};
