/**
 * Code Block Enhancement
 * Adds language labels and copy buttons to code blocks
 */

const LANG_NAMES: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Zsh',
  python: 'Python',
  py: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL',
  graphql: 'GraphQL',
  dockerfile: 'Dockerfile',
  docker: 'Docker',
  nginx: 'Nginx',
  apache: 'Apache',
  xml: 'XML',
  toml: 'TOML',
  ini: 'INI',
  env: 'ENV',
  txt: 'Text',
  plaintext: 'Text',
};

function getTranslation(key: string, fallback: string): string {
  return window.__i18n?.t[key] || fallback;
}

function getLangFromClass(pre: HTMLElement): string | null {
  const code = pre.querySelector('code');
  if (!code) return null;

  // Check for class like "language-yaml" or "lang-yaml"
  const classes = Array.from(code.classList);
  for (const cls of classes) {
    if (cls.startsWith('language-')) {
      return cls.replace('language-', '');
    }
    if (cls.startsWith('lang-')) {
      return cls.replace('lang-', '');
    }
  }

  // Check data attribute
  const dataLang = code.getAttribute('data-language') || pre.getAttribute('data-language');
  if (dataLang) return dataLang;

  return null;
}

function detectLanguage(code: string): string | null {
  const trimmed = code.trim();

  // YAML detection
  if (/^(apiVersion|kind|metadata|spec|data|name|namespace):/m.test(trimmed)) {
    return 'yaml';
  }

  // JSON detection
  if (/^\s*[{[]/.test(trimmed) && /[}\]]\s*$/.test(trimmed)) {
    return 'json';
  }

  // Shell/Bash detection
  if (/^(#!\/bin\/(ba)?sh|curl|wget|npm|yarn|pnpm|git|oc|kubectl|helm|docker|podman)\b/m.test(trimmed)) {
    return 'bash';
  }

  // Dockerfile
  if (/^(FROM|RUN|CMD|COPY|ADD|EXPOSE|ENV|WORKDIR)\b/m.test(trimmed)) {
    return 'dockerfile';
  }

  return null;
}

function createCopyButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'code-copy';
  btn.setAttribute('aria-label', getTranslation('code.copyCode', 'Copy code'));
  btn.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
    </svg>
    <span class="copy-text">${getTranslation('code.copy', 'Copy')}</span>
  `;
  return btn;
}

function wrapCodeBlock(pre: HTMLPreElement): void {
  // Skip if already wrapped
  if (pre.parentElement?.classList.contains('code-block')) return;

  const code = pre.querySelector('code');
  if (!code) return;

  // Detect language
  let lang = getLangFromClass(pre);
  if (!lang) {
    lang = detectLanguage(code.textContent || '');
  }

  const displayLang = lang ? (LANG_NAMES[lang.toLowerCase()] || lang.toUpperCase()) : 'Code';

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block';

  // Create header
  const header = document.createElement('div');
  header.className = 'code-header';

  // Language label
  const langSpan = document.createElement('span');
  langSpan.className = 'code-lang';
  langSpan.textContent = displayLang;

  // Copy button
  const copyBtn = createCopyButton();
  copyBtn.addEventListener('click', async () => {
    const text = code.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add('copied');
      const copyText = copyBtn.querySelector('.copy-text');
      if (copyText) copyText.textContent = getTranslation('code.copied', 'Copied!');

      setTimeout(() => {
        copyBtn.classList.remove('copied');
        if (copyText) copyText.textContent = getTranslation('code.copy', 'Copy');
      }, 2000);
    } catch {
      // Clipboard API not available - silent fail
    }
  });

  header.appendChild(langSpan);
  header.appendChild(copyBtn);

  // Wrap the pre element
  pre.parentNode?.insertBefore(wrapper, pre);
  wrapper.appendChild(header);
  wrapper.appendChild(pre);
}

export function initCodeBlocks(): void {
  const proseContainers = document.querySelectorAll('.prose');

  proseContainers.forEach((prose) => {
    const preElements = prose.querySelectorAll('pre');
    preElements.forEach((pre) => {
      wrapCodeBlock(pre as HTMLPreElement);
    });
  });
}

// Auto-init
initCodeBlocks();

// Re-init on Astro page transitions
document.addEventListener('astro:after-swap', initCodeBlocks);
