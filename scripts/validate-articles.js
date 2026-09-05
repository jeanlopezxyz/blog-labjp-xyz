#!/usr/bin/env node
/**
 * Article Validation Script
 * Validates blog articles before deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Valid categories from constants.ts
const VALID_CATEGORIES = [
  'kubernetes',
  'openshift',
  'cloud-native',
  'gitops',
  'automation',
  'ia',
  'devops',
  'comunidad',
];

// Required frontmatter fields
const REQUIRED_FIELDS = ['title', 'description', 'pubDate', 'categories', 'lang'];

// Valid languages
const VALID_LANGS = ['es', 'en'];

const errors = [];
const warnings = [];

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Parse arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v =>
        v.trim().replace(/^["']|["']$/g, '')
      );
    } else {
      // Remove quotes
      value = value.replace(/^["']|["']$/g, '');
    }

    frontmatter[key] = value;
  }

  return frontmatter;
}

function validateArticle(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = extractFrontmatter(content);

  if (!frontmatter) {
    errors.push(`${relativePath}: No frontmatter found`);
    return;
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!frontmatter[field]) {
      errors.push(`${relativePath}: Missing required field '${field}'`);
    }
  }

  // Validate categories
  if (frontmatter.categories) {
    const cats = Array.isArray(frontmatter.categories) ? frontmatter.categories : [frontmatter.categories];
    for (const cat of cats) {
      if (!VALID_CATEGORIES.includes(cat)) {
        errors.push(`${relativePath}: Invalid category '${cat}'. Valid: ${VALID_CATEGORIES.join(', ')}`);
      }
    }
  }

  // Validate lang matches folder
  if (frontmatter.lang) {
    const folderLang = filePath.includes('/es/') ? 'es' : filePath.includes('/en/') ? 'en' : null;
    if (folderLang && frontmatter.lang !== folderLang) {
      errors.push(`${relativePath}: lang '${frontmatter.lang}' doesn't match folder '${folderLang}'`);
    }
    if (!VALID_LANGS.includes(frontmatter.lang)) {
      errors.push(`${relativePath}: Invalid lang '${frontmatter.lang}'. Valid: ${VALID_LANGS.join(', ')}`);
    }
  }

  // Check image exists (only for local images, not external URLs)
  if (frontmatter.image) {
    const isExternalUrl = frontmatter.image.startsWith('http://') || frontmatter.image.startsWith('https://');
    if (!isExternalUrl) {
      const imagePath = path.join(ROOT_DIR, 'public', frontmatter.image);
      if (!fs.existsSync(imagePath)) {
        errors.push(`${relativePath}: Image not found '${frontmatter.image}'`);
      }
    }
  }

  // Validate pubDate format
  if (frontmatter.pubDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(frontmatter.pubDate)) {
      errors.push(`${relativePath}: Invalid pubDate format '${frontmatter.pubDate}'. Use YYYY-MM-DD`);
    }
  }

  // Check for draft status
  if (frontmatter.draft === 'true' || frontmatter.draft === true) {
    warnings.push(`${relativePath}: Article is marked as draft`);
  }
}

function findArticles(dir) {
  const articles = [];

  if (!fs.existsSync(dir)) return articles;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      articles.push(...findArticles(fullPath));
    } else if (item.endsWith('.md')) {
      articles.push(fullPath);
    }
  }

  return articles;
}

/**
 * Comprueba que cada artículo exista en los dos idiomas.
 *
 * Un artículo publicado en un solo idioma deja el selector de idioma y la
 * etiqueta hreflang apuntando a una URL que no existe. Se avisa en vez de
 * fallar: traducir lleva tiempo y no debe bloquear la publicación. Con
 * PARITY_STRICT=1 pasa a ser error, para cuando no queden pendientes.
 */
function checkTranslationParity(articles) {
  const strict = process.env.PARITY_STRICT === '1';
  const bySlug = new Map();

  for (const file of articles) {
    const lang = path.basename(path.dirname(file));
    const slug = path.basename(file, '.md');
    const draft = /^draft:\s*true/m.test(fs.readFileSync(file, 'utf8'));
    bySlug.set(slug, { ...(bySlug.get(slug) ?? {}), [lang]: { draft } });
  }

  for (const [slug, langs] of bySlug) {
    for (const lang of VALID_LANGS) {
      if (langs[lang]) continue;
      const otro = langs[lang === 'es' ? 'en' : 'es'];
      const msg = `src/content/blog/${lang}/${slug}.md: falta la traducción en '${lang}'`;
      // Un borrador sin traducir no molesta a nadie: no está publicado.
      if (strict && otro && !otro.draft) errors.push(msg);
      else warnings.push(msg);
    }
  }
}

// Main
console.log('🔍 Validating blog articles...\n');

const blogDir = path.join(ROOT_DIR, 'src', 'content', 'blog');
const articles = findArticles(blogDir);

console.log(`Found ${articles.length} articles\n`);

for (const article of articles) {
  validateArticle(article);
}

checkTranslationParity(articles);

// Print results
if (warnings.length > 0) {
  console.log('⚠️  Warnings:');
  warnings.forEach(w => console.log(`   ${w}`));
  console.log('');
}

if (errors.length > 0) {
  console.log('❌ Errors:');
  errors.forEach(e => console.log(`   ${e}`));
  console.log(`\n❌ Validation failed with ${errors.length} error(s)`);
  process.exit(1);
} else {
  console.log('✅ All articles are valid!');
  process.exit(0);
}
