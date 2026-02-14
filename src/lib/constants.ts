import { locales } from "@/i18n/ui";

export const SITE = {
  name: "labjp.xyz",
  url: "https://blog.labjp.xyz",
  author: "Jean Paul López",
  email: "contact@labjp.xyz",
  locales: {
    es: {
      title: "blog.labjp.xyz - Blog sobre Kubernetes, OpenShift y Cloud Native",
      description: "Blog técnico sobre Kubernetes, OpenShift, DevOps y arquitecturas Cloud Native. Por Jean Paul López, Senior Consultant @ Red Hat.",
      locale: locales.es,
    },
    en: {
      title: "blog.labjp.xyz - Blog about Kubernetes, OpenShift and Cloud Native",
      description: "Technical blog about Kubernetes, OpenShift, DevOps and Cloud Native architectures. By Jean Paul López, Senior Consultant @ Red Hat.",
      locale: locales.en,
    },
  },
} as const;

export const SOCIAL = {
  github: "https://github.com/jeanlopezxyz",
  linkedin: "https://linkedin.com/in/jean-paul-lopez",
  twitter: "https://x.com/jeanlopezxyz",
} as const;

export const RSS_URL = "/rss.xml" as const;

export const NAV_ITEMS = [
  { key: "nav.home", href: "/" },
  { key: "nav.archive", href: "/blog" },
  { key: "nav.about", href: "/about" },
] as const;

export const CATEGORIES = [
  { id: "kubernetes", label: "Kubernetes", icon: "simple-icons:kubernetes", color: "#326CE5" },
  { id: "openshift", label: "OpenShift", icon: "simple-icons:redhatopenshift", color: "#EE0000" },
  { id: "cloud-native", label: "Cloud Native", icon: "mdi:cloud-outline", color: "#8B5CF6" },
  { id: "ia", label: "IA", icon: "mdi:brain", color: "#F59E0B" },
  { id: "comunidad", label: "Comunidad", icon: "mdi:account-group", color: "#22c55e" },
  { id: "devops", label: "DevOps", icon: "mdi:infinity", color: "#06B6D4" },
] as const;

export type CategoryId = typeof CATEGORIES[number]["id"];

export const POSTS_PER_PAGE = 6;
