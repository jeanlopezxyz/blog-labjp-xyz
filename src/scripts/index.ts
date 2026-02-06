/**
 * Client-side utilities - centralized exports
 * Import from '@/scripts' in component scripts
 */

// Likes utilities
export {
  getLikes,
  saveLikes,
  isPostLiked,
  toggleLike,
  updateLikeUI,
  initLikeButton,
} from './likes';

// Visitor utilities
export { getVisitorId, sendLikeToAPI } from './visitor';

// Share utilities
export {
  initShareMenus,
  initCopyLinks,
  closeAllShareMenus,
  setupGlobalShareHandlers,
} from './share';

// Stats utilities
export {
  loadPostStats,
  loadMultiplePostStats,
  updateStatsDisplay,
  initPostStats,
} from './stats';
