/**
 * Client-side utilities for share functionality
 */

let globalHandlersInitialized = false;

/**
 * Initialize share menu dropdowns
 */
export function initShareMenus(container: Element | Document = document): void {
  container.querySelectorAll<HTMLElement>('[data-share-menu]').forEach((menu) => {
    // Skip if already initialized
    if (menu.dataset.shareInitialized === 'true') return;
    menu.dataset.shareInitialized = 'true';

    const toggle = menu.querySelector<HTMLButtonElement>('[data-share-toggle]');
    const dropdown = menu.querySelector<HTMLElement>('[data-share-dropdown]');

    if (!toggle || !dropdown) return;

    const showDropdown = () => {
      dropdown.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      const firstItem = dropdown.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    };

    const hideDropdown = () => {
      dropdown.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Close other dropdowns
      document.querySelectorAll('[data-share-dropdown]').forEach((d) => {
        if (d !== dropdown) {
          d.classList.add('hidden');
          const otherToggle = d.closest('[data-share-menu]')?.querySelector('[data-share-toggle]');
          otherToggle?.setAttribute('aria-expanded', 'false');
        }
      });

      const isHidden = dropdown.classList.contains('hidden');
      if (isHidden) {
        showDropdown();
      } else {
        hideDropdown();
      }
    });

    // Keyboard navigation within dropdown
    dropdown.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'Escape':
          hideDropdown();
          toggle.focus();
          break;
        case 'ArrowDown':
          e.preventDefault();
          items[(currentIndex + 1) % items.length]?.focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          items[(currentIndex - 1 + items.length) % items.length]?.focus();
          break;
        case 'Tab':
          hideDropdown();
          break;
      }
    });
  });
}

/**
 * Initialize copy link buttons
 */
export function initCopyLinks(container: Element | Document = document): void {
  container.querySelectorAll<HTMLElement>('.copy-link-btn').forEach((btn) => {
    // Skip if already initialized
    if (btn.dataset.copyInitialized === 'true') return;
    btn.dataset.copyInitialized = 'true';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const url = btn.dataset.url;
      const textSpan = btn.querySelector('.copy-text');

      if (url && textSpan) {
        try {
          await navigator.clipboard.writeText(url);
          const originalText = textSpan.textContent;
          textSpan.textContent = window.__i18n?.t['post.copied'] || '✓';

          setTimeout(() => {
            textSpan.textContent = originalText;
          }, 1500);
        } catch {
          // Clipboard API not available - silent fail
        }
      }
    });
  });
}

/**
 * Setup global click handler to close dropdowns
 * Only runs once even if called multiple times
 */
export function setupGlobalShareHandlers(): void {
  if (globalHandlersInitialized) return;
  globalHandlersInitialized = true;

  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    document.querySelectorAll('[data-share-dropdown]').forEach((dropdown) => {
      const menu = dropdown.closest('[data-share-menu]');
      if (menu && !menu.contains(target)) {
        dropdown.classList.add('hidden');
        const toggle = menu.querySelector('[data-share-toggle]');
        toggle?.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

