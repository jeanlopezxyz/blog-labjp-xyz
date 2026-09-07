#!/usr/bin/env node
/**
 * Generates a cover image for blog posts that don't have one yet, using
 * OpenAI's image API, and writes the local path back into the frontmatter.
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/generate-post-images.mjs [slug ...]
 *
 * With no arguments, scans every post under src/content/blog and generates
 * images for the ones missing an `image` field. Passing one or more slugs
 * (the filename without extension, e.g. "2026-09-04-mcp-sin-estado-revision")
 * limits it to just those files, regardless of whether they already have an
 * image — useful for regenerating one manually.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT_DIR, 'src', 'content', 'blog');
const IMAGES_DIR = path.join(ROOT_DIR, 'public', 'images', 'blog');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';

function findMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      out.push(...findMarkdownFiles(full));
    } else if (item.endsWith('.md') || item.endsWith('.mdx')) {
      out.push(full);
    }
  }
  return out;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  const raw = match[1];
  const fields = {};
  for (const line of raw.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
    fields[key] = value;
  }
  return { raw, fields, block: match[0] };
}

function slugify(fileBaseName) {
  // Filenames are already "YYYY-MM-DD-slug"; drop the date prefix for a
  // cleaner image filename.
  return fileBaseName.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

async function generateImage(prompt) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: '1536x1024',
      quality: 'medium',
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI image API failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI response did not include image data');
  return Buffer.from(b64, 'base64');
}

function buildPrompt({ title, description, categories }) {
  return [
    `Editorial cover illustration for a technical blog post titled "${title}".`,
    description ? `The post is about: ${description}.` : '',
    categories ? `Topic areas: ${categories}.` : '',
    'Style: modern flat-design tech illustration, clean geometric shapes,',
    'dark background with a subtle gradient, teal and violet accent colors,',
    'no readable text or letters in the image, no logos, 16:9 composition',
    'suitable for a blog hero image.',
  ].filter(Boolean).join(' ');
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    process.exit(1);
  }

  const requestedSlugs = process.argv.slice(2);
  const allFiles = findMarkdownFiles(BLOG_DIR);

  const targets = allFiles.filter((file) => {
    const base = path.basename(file).replace(/\.mdx?$/, '');
    if (requestedSlugs.length > 0) return requestedSlugs.includes(base);
    const content = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);
    return fm && !fm.fields.image;
  });

  if (targets.length === 0) {
    console.log('No posts need a generated cover image.');
    return;
  }

  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const file of targets) {
    const content = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) {
      console.warn(`Skipping ${file}: no frontmatter found.`);
      continue;
    }

    const base = path.basename(file).replace(/\.mdx?$/, '');
    const imageSlug = slugify(base);
    const imageFileName = `${imageSlug}.png`;
    const imagePath = path.join(IMAGES_DIR, imageFileName);
    const publicPath = `/images/blog/${imageFileName}`;

    console.log(`Generating cover image for "${fm.fields.title}"...`);
    const prompt = buildPrompt({
      title: fm.fields.title,
      description: fm.fields.description,
      categories: fm.fields.categories,
    });

    const imageBuffer = await generateImage(prompt);
    fs.writeFileSync(imagePath, imageBuffer);
    console.log(`  saved ${path.relative(ROOT_DIR, imagePath)}`);

    let newBlock;
    if (fm.fields.image) {
      newBlock = fm.block.replace(/^image:.*$/m, `image: "${publicPath}"`);
    } else {
      // Insert right after `description` so the field order stays readable,
      // falling back to appending before the closing `---` if that field is
      // missing for some reason.
      newBlock = /^description:.*$/m.test(fm.block)
        ? fm.block.replace(/^(description:.*)$/m, `$1\nimage: "${publicPath}"`)
        : fm.block.replace(/\n---\n?$/, `\nimage: "${publicPath}"\n---\n`);
    }

    const newContent = content.replace(fm.block, newBlock);
    fs.writeFileSync(file, newContent);
    console.log(`  updated ${path.relative(ROOT_DIR, file)}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
