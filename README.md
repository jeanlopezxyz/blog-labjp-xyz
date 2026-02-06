# labjp.xyz Blog

Blog técnico sobre Kubernetes, OpenShift, DevOps y arquitecturas Cloud Native.

## Tech Stack

- **Framework**: [Astro 5](https://astro.build/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: [GSAP](https://greensock.com/gsap/) + ScrollTrigger
- **Backend**: [Cloudflare Pages](https://pages.cloudflare.com/) + [D1 Database](https://developers.cloudflare.com/d1/)
- **Icons**: [Astro Icon](https://github.com/natemoo-re/astro-icon)

---

## Features

### D1 Database Features

| Feature | Endpoint | Description |
|---------|----------|-------------|
| **Views Tracking** | `/api/views` | Track page views per article |
| **Likes System** | `/api/likes` | Like/unlike posts with visitor tracking |
| **Comments** | `/api/comments` | Comment system per article |
| **Stats** | `/api/stats` | Get likes + comments count for multiple posts |
| **Newsletter** | `/api/newsletter` | Email subscription management |
| **Contact Form** | `/api/contact` | Contact form submissions |

### GSAP Animations

| Component | Location | Description |
|-----------|----------|-------------|
| `ScrollAnimations` | `src/components/blog/` | Scroll reveal for blog content |
| `ReadingProgress` | `src/components/blog/` | Reading progress bar |
| `TypingEffect` | `src/components/animations/` | Typewriter text effect |
| `AnimatedCounter` | `src/components/animations/` | Number counter animation |
| `Timeline` | `src/components/animations/` | Animated career timeline |
| `SkillBar` | `src/components/animations/` | Animated skill progress bars |
| `Card3D` | `src/components/animations/` | 3D tilt effect on hover |

### Interactive Components

| Component | Location | Description |
|-----------|----------|-------------|
| `LikeButton` | `src/components/interactive/` | Animated like button |
| `CommentsSection` | `src/components/interactive/` | Comments display and form |
| `NewsletterForm` | `src/components/interactive/` | Newsletter subscription form |

---

## Article Frontmatter Schema

Each blog post requires the following frontmatter:

```yaml
---
title: "Article Title"                    # Required - Post title
description: "Brief description"          # Required - Meta description (SEO)
pubDate: 2026-01-20                       # Required - Publication date
tags: ["tag1", "tag2"]                    # Optional - Array of tags
category: "kubernetes"                    # Optional - One of: kubernetes, openshift, devops, cloud-native, ia, general
featured: true                            # Optional - Show in featured section (default: false)
image: "https://example.com/image.jpg"   # Optional - Cover image URL
lang: es                                  # Optional - Language: es or en (default: es)
draft: false                              # Optional - Draft status (default: false)
updatedDate: 2026-01-21                   # Optional - Last update date
---
```

### Categories

| ID | Label | Icon |
|----|-------|------|
| `kubernetes` | Kubernetes | simple-icons:kubernetes |
| `openshift` | OpenShift | simple-icons:redhatopenshift |
| `cloud-native` | Cloud Native | mdi:cloud-outline |
| `ia` | IA | mdi:brain |
| `comunidad` | Comunidad | mdi:account-group |
| `general` | General | - |

### Example Post

```markdown
---
title: "Getting Started with Kubernetes"
description: "Learn the basics of Kubernetes and container orchestration."
pubDate: 2026-01-20
tags: ["kubernetes", "containers", "devops"]
category: "kubernetes"
featured: true
image: "https://images.unsplash.com/photo-xxx"
lang: es
---

Your content here...

## Heading 2

Content...

### Heading 3

More content...
```

---

## Project Structure

```
src/
├── components/
│   ├── animations/          # GSAP animation components
│   │   ├── AnimatedCounter.astro
│   │   ├── Card3D.astro
│   │   ├── SkillBar.astro
│   │   ├── Timeline.astro
│   │   └── TypingEffect.astro
│   ├── blog/                # Blog-specific components
│   │   ├── PostCard.astro
│   │   ├── PostHeader.astro
│   │   ├── ReadingProgress.astro
│   │   ├── ScrollAnimations.astro
│   │   ├── TableOfContents.astro
│   │   └── ViewTracker.astro
│   ├── interactive/         # Interactive D1-powered components
│   │   ├── CommentsSection.astro
│   │   ├── LikeButton.astro
│   │   └── NewsletterForm.astro
│   └── layout/              # Layout components
│       ├── Header.astro
│       ├── Footer.astro
│       └── Sidebar.astro
├── content/
│   └── blog/                # Blog posts (Markdown)
│       ├── en/              # English posts
│       └── *.md             # Spanish posts (default)
├── layouts/
│   ├── BaseLayout.astro
│   └── BlogLayout.astro
├── lib/
│   └── constants.ts         # Site configuration
├── pages/
│   ├── blog/
│   ├── category/
│   └── en/                  # English routes
└── styles/
    └── global.css
functions/
└── api/                     # Cloudflare Pages Functions (D1)
    ├── views.ts
    ├── likes.ts
    ├── comments.ts
    ├── stats.ts             # Aggregated stats (likes + comments)
    ├── newsletter.ts
    └── contact.ts
```

---

## Configuration

### Site Configuration (`src/lib/constants.ts`)

```typescript
export const SITE = {
  name: "labjp.xyz",
  url: "https://labjp.xyz",
  author: "Jean Paul López",
  email: "contact@labjp.xyz",
  // ...
};

export const STATS = {
  yearsExperience: 9,
  certifications: 6,
  projectsDelivered: 50,
  communitySpeaks: 20,
};

export const SKILLS = [
  { name: "Kubernetes", level: 95 },
  { name: "OpenShift", level: 95 },
  // ...
];

export const CAREER_TIMELINE = [
  {
    year: "2022 - Present",
    title: "Senior Consultant",
    company: "Red Hat",
    description: "...",
    current: true,
  },
  // ...
];
```

---

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

```bash
# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=labjp-blog
```

### D1 Database Setup

The D1 database tables are auto-created on first API call. Tables:

- `page_views` - View tracking
- `post_likes` - Like tracking
- `comments` - Comments storage
- `newsletter_subscribers` - Newsletter subscriptions
- `contact_submissions` - Contact form data

---

## i18n (Internationalization)

The blog supports Spanish (default) and English:

- Spanish posts: `src/content/blog/*.md`
- English posts: `src/content/blog/en/*.md`

Automatic language detection based on visitor country (via Cloudflare `CF-IPCountry` header).

---

## License

MIT
