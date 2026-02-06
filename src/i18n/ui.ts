export const languages = {
  es: 'Español',
  en: 'English',
} as const;

export const locales = {
  es: 'es-ES',
  en: 'en-US',
} as const;

export const defaultLang = 'es' as const;

// Tipo centralizado para idiomas
export type Lang = keyof typeof languages;

export const ui = {
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.notes': 'Notas',
    'nav.archive': 'Archivo',
    'nav.about': 'Sobre mí',
    'nav.blog': 'Archivo',
    'nav.search': 'Buscar',
    'nav.subscribe': 'Suscribirse',
    'nav.theme': 'Cambiar tema',
    'nav.mainNav': 'Navegación principal',
    'nav.langToggle': 'Cambiar idioma',
    'nav.navigation': 'Navegación',

    // Categories
    'cat.kubernetes': 'Kubernetes',
    'cat.openshift': 'OpenShift',
    'cat.cloud-native': 'Cloud Native',
    'cat.ia': 'IA',
    'cat.comunidad': 'Comunidad',
    'cat.articlesAbout': 'Artículos sobre',
    'cat.noArticles': 'No hay artículos en esta categoría',
    'cat.noArticlesYet': 'Aún no hay artículos publicados sobre',
    'cat.backHome': '← Volver al inicio',

    // Homepage
    'home.featured': 'Destacado',
    'home.popular': 'Populares',
    'home.latest': 'Últimos',
    'home.top': 'Top',
    'home.discussions': 'Discusiones',
    'home.viewAll': 'Ver todos',
    'home.viewAllArticles': 'Ver todos los artículos',
    'home.noArticles': 'No hay artículos publicados',
    'home.articlesWillAppear': 'Los artículos aparecerán aquí cuando se publiquen.',

    // Blog
    'blog.archive': 'Archivo',
    'blog.allArticles': 'Todos los artículos publicados',
    'blog.description': 'Todos los artículos del blog sobre Kubernetes, OpenShift, DevOps y Cloud Native.',
    'blog.article': 'artículo',
    'blog.articles': 'artículos',
    'blog.readingTime': 'min de lectura',
    'blog.min': 'min',

    // Sidebar
    'sidebar.newsletter': 'Newsletter',
    'sidebar.newsletterDesc': 'Artículos sobre Kubernetes, DevOps, IA y Cloud Native directamente en tu inbox.',
    'sidebar.email': 'tu@email.com',
    'sidebar.subscribe': 'Suscribirme',
    'sidebar.orFollow': 'O sigue via',
    'sidebar.categories': 'Categorías',
    'sidebar.social': 'Social',
    'sidebar.trending': 'Tendencias',
    'sidebar.subscribeTitle': 'Suscríbete',
    'sidebar.subscribeDesc': 'Recibe los últimos artículos en tu correo.',
    'sidebar.rssFeed': 'RSS Feed',
    'sidebar.authorRole': 'DevOps & Cloud Native Engineer',

    // Post actions
    'post.like': 'Me gusta',
    'post.comments': 'Comentarios',
    'post.share': 'Compartir',
    'post.copyLink': 'Copiar enlace',
    'post.copied': '✓',
    'post.shareArticle': 'Compartir artículo',
    'post.shareOptions': 'Opciones para compartir',
    'post.shareOnTwitter': 'Compartir en Twitter',
    'post.shareOnLinkedIn': 'Compartir en LinkedIn',
    'post.twitter': 'Twitter',
    'post.linkedin': 'LinkedIn',
    'post.articleActions': 'Acciones del artículo',
    'post.commentsCount': 'comentarios',

    // Social
    'social.links': 'Redes sociales',
    'social.github': 'GitHub',
    'social.linkedin': 'LinkedIn',
    'social.twitter': 'Twitter',
    'social.email': 'Email',

    // Loading
    'loading.stats': 'Cargando estadísticas...',

    // Notes
    'notes.title': 'Notas',
    'notes.description': 'Pensamientos cortos, links interesantes y posts de redes sociales.',
    'notes.note': 'nota',
    'notes.notes': 'notas',
    'notes.viewOriginal': 'Ver original',
    'notes.noNotes': 'No hay notas publicadas',
    'notes.notesWillAppear': 'Las notas aparecerán aquí cuando se publiquen.',

    // Footer
    'footer.rights': 'Todos los derechos reservados',
    'footer.social': 'Redes sociales',
    'footer.goHome': 'Ir al inicio',

    // Stats
    'stats.views': 'vistas',
    'stats.mostRead': 'Más leídos',
    'stats.mostViewed': 'Más vistos',
    'stats.errorLoading': 'No se pudieron cargar los posts populares',

    // Comments
    'comments.title': 'Comentarios',
    'comments.name': 'Tu nombre',
    'comments.placeholder': 'Escribe un comentario...',
    'comments.submit': 'Enviar',
    'comments.sending': 'Enviando...',
    'comments.loading': 'Cargando...',
    'comments.noComments': 'Sé el primero en comentar',
    'comments.error': 'Error al cargar comentarios',
    'comments.errorSubmit': 'Error al enviar comentario',
    'comments.success': 'Comentario enviado',

    // Modal
    'modal.close': 'Cerrar',

    // Dates
    'date.today': 'Hoy',
    'date.yesterday': 'Ayer',
    'date.daysAgo': 'd',
    'date.week': 'sem',

    // Search
    'search.title': 'Buscar',
    'search.placeholder': 'Buscar artículos...',
    'search.typing': 'Escribe para buscar...',
    'search.noResults': 'No se encontraron resultados',
    'search.close': 'Cerrar búsqueda',

    // Subscribe / Newsletter
    'subscribe.title': 'Suscríbete al newsletter',
    'subscribe.description': 'Recibe los últimos artículos directamente en tu correo.',
    'subscribe.placeholder': 'tu@email.com',
    'subscribe.button': 'Suscribirse',
    'subscribe.success': '¡Gracias por suscribirte!',
    'subscribe.error': 'Error al suscribirse. Intenta de nuevo.',
    'subscribe.invalid': 'Por favor ingresa un email válido',
    'subscribe.close': 'Cerrar suscripción',
    'subscribe.orFollow': 'O sigue via',

    // Table of Contents
    'toc.title': 'En este artículo',

    // Tags
    'tags.backToBlog': 'Volver al blog',
    'tags.title': 'Posts etiquetados con',
    'tags.found': 'encontrados',
    'tags.articles': 'artículos',
    'tags.article': 'artículo',

    // Accessibility
    'a11y.skipToContent': 'Saltar al contenido principal',
    'a11y.openMenu': 'Abrir menú',
    'a11y.closeMenu': 'Cerrar menú',
    'a11y.goToHome': 'Ir al inicio',

    // Projects
    'projects.code': 'Código',
    'projects.demo': 'Demo',
    'projects.library': 'Librería',
    'projects.tool': 'Herramienta',
    'projects.cli': 'CLI',
    'projects.web': 'Web',
    'projects.other': 'Otro',
  },
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.notes': 'Notes',
    'nav.archive': 'Archive',
    'nav.about': 'About',
    'nav.blog': 'Archive',
    'nav.search': 'Search',
    'nav.subscribe': 'Subscribe',
    'nav.theme': 'Toggle theme',
    'nav.mainNav': 'Main navigation',
    'nav.langToggle': 'Change language',
    'nav.navigation': 'Navigation',

    // Categories
    'cat.kubernetes': 'Kubernetes',
    'cat.openshift': 'OpenShift',
    'cat.cloud-native': 'Cloud Native',
    'cat.ia': 'AI',
    'cat.comunidad': 'Community',
    'cat.articlesAbout': 'Articles about',
    'cat.noArticles': 'No articles in this category',
    'cat.noArticlesYet': 'There are no articles published about',
    'cat.backHome': '← Back to home',

    // Homepage
    'home.featured': 'Featured',
    'home.popular': 'Popular',
    'home.latest': 'Latest',
    'home.top': 'Top',
    'home.discussions': 'Discussions',
    'home.viewAll': 'View all',
    'home.viewAllArticles': 'View all articles',
    'home.noArticles': 'No articles published',
    'home.articlesWillAppear': 'Articles will appear here when published.',

    // Blog
    'blog.archive': 'Archive',
    'blog.allArticles': 'All published articles',
    'blog.description': 'All blog articles about Kubernetes, OpenShift, DevOps and Cloud Native.',
    'blog.article': 'article',
    'blog.articles': 'articles',
    'blog.readingTime': 'min read',
    'blog.min': 'min',

    // Sidebar
    'sidebar.newsletter': 'Newsletter',
    'sidebar.newsletterDesc': 'Articles about Kubernetes, DevOps, AI and Cloud Native directly to your inbox.',
    'sidebar.email': 'your@email.com',
    'sidebar.subscribe': 'Subscribe',
    'sidebar.orFollow': 'Or follow via',
    'sidebar.categories': 'Categories',
    'sidebar.social': 'Social',
    'sidebar.trending': 'Trending',
    'sidebar.subscribeTitle': 'Subscribe',
    'sidebar.subscribeDesc': 'Get the latest articles in your inbox.',
    'sidebar.rssFeed': 'RSS Feed',
    'sidebar.authorRole': 'DevOps & Cloud Native Engineer',

    // Post actions
    'post.like': 'Like',
    'post.comments': 'Comments',
    'post.share': 'Share',
    'post.copyLink': 'Copy link',
    'post.copied': '✓',
    'post.shareArticle': 'Share article',
    'post.shareOptions': 'Share options',
    'post.shareOnTwitter': 'Share on Twitter',
    'post.shareOnLinkedIn': 'Share on LinkedIn',
    'post.twitter': 'Twitter',
    'post.linkedin': 'LinkedIn',

    // Social
    'social.links': 'Social media',
    'social.github': 'GitHub',
    'social.linkedin': 'LinkedIn',
    'social.twitter': 'Twitter',
    'social.email': 'Email',

    // Loading
    'loading.stats': 'Loading stats...',
    'post.articleActions': 'Article actions',
    'post.commentsCount': 'comments',

    // Notes
    'notes.title': 'Notes',
    'notes.description': 'Short thoughts, interesting links and social media posts.',
    'notes.note': 'note',
    'notes.notes': 'notes',
    'notes.viewOriginal': 'View original',
    'notes.noNotes': 'No notes published',
    'notes.notesWillAppear': 'Notes will appear here when published.',

    // Footer
    'footer.rights': 'All rights reserved',
    'footer.social': 'Social networks',
    'footer.goHome': 'Go to home',

    // Stats
    'stats.views': 'views',
    'stats.mostRead': 'Most Read',
    'stats.mostViewed': 'Most viewed',
    'stats.errorLoading': 'Could not load popular posts',

    // Comments
    'comments.title': 'Comments',
    'comments.name': 'Your name',
    'comments.placeholder': 'Write a comment...',
    'comments.submit': 'Submit',
    'comments.sending': 'Sending...',
    'comments.loading': 'Loading...',
    'comments.noComments': 'Be the first to comment',
    'comments.error': 'Error loading comments',
    'comments.errorSubmit': 'Error submitting comment',
    'comments.success': 'Comment submitted',

    // Modal
    'modal.close': 'Close',

    // Dates
    'date.today': 'Today',
    'date.yesterday': 'Yesterday',
    'date.daysAgo': 'd',
    'date.week': 'w',

    // Search
    'search.title': 'Search',
    'search.placeholder': 'Search articles...',
    'search.typing': 'Type to search...',
    'search.noResults': 'No results found',
    'search.close': 'Close search',

    // Subscribe / Newsletter
    'subscribe.title': 'Subscribe to newsletter',
    'subscribe.description': 'Get the latest articles directly in your inbox.',
    'subscribe.placeholder': 'your@email.com',
    'subscribe.button': 'Subscribe',
    'subscribe.success': 'Thanks for subscribing!',
    'subscribe.error': 'Error subscribing. Please try again.',
    'subscribe.invalid': 'Please enter a valid email',
    'subscribe.close': 'Close subscription',
    'subscribe.orFollow': 'Or follow via',

    // Table of Contents
    'toc.title': 'In this article',

    // Tags
    'tags.backToBlog': 'Back to blog',
    'tags.title': 'Posts tagged with',
    'tags.found': 'found',
    'tags.articles': 'articles',
    'tags.article': 'article',

    // Accessibility
    'a11y.skipToContent': 'Skip to main content',
    'a11y.openMenu': 'Open menu',
    'a11y.closeMenu': 'Close menu',
    'a11y.goToHome': 'Go to home',

    // Projects
    'projects.code': 'Code',
    'projects.demo': 'Demo',
    'projects.library': 'Library',
    'projects.tool': 'Tool',
    'projects.cli': 'CLI',
    'projects.web': 'Web',
    'projects.other': 'Other',
  },
} as const;
