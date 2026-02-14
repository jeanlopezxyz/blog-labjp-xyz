/**
 * Centralized type definitions for the blog
 * All shared types should be defined here
 */

import type { Lang } from '@/i18n';

// ============================================
// Post Types
// ============================================

export interface PostData {
  title: string;
  description: string;
  pubDate: Date;
  tags?: string[];
  image?: string;
  categories?: string[];
  featured?: boolean;
  draft?: boolean;
  lang?: Lang;
}

export interface PostMeta {
  slug: string;
  readingTime?: number;
}

/** Blog collection entry type for use in components */
export interface BlogCollectionEntry {
  id: string;
  slug: string;
  body?: string;
  data: PostData;
}

// ============================================
// Component Props - Common patterns
// ============================================

/** Base props for components that support i18n */
export interface WithLang {
  lang?: Lang;
}

/** Props for social action components */
export interface SocialActionsProps extends WithLang {
  postId: string;
  postTitle: string;
  postSlug: string;
  showComments?: boolean;
  size?: 'sm' | 'md';
  variant?: 'inline' | 'centered' | 'spread';
  class?: string;
}

// ============================================
// API Types
// ============================================

export interface PostStats {
  views: number;
  likes: number;
  comments: number;
}

// ============================================
// Client-side Types
// ============================================

export interface LikesStore {
  [postId: string]: boolean;
}

// ============================================
// Constants
// ============================================

export const STORAGE_KEYS = {
  LIKES: 'blog_likes',
  VISITOR_ID: 'visitor_id',
  THEME: 'theme',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

// API Endpoints
export const API_ENDPOINTS = {
  LIKES: '/api/likes',
  STATS: '/api/stats',
  VIEWS: '/api/views',
  COMMENTS: '/api/comments',
  NEWSLETTER: '/api/newsletter',
} as const;

export type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];
