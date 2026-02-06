import { locales } from "@/i18n/ui";

export const SITE = {
  name: "blog.labjp.xyz",
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
  twitter: "https://twitter.com/jeanpaulvgc",
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

export const COMMUNITIES = [
  {
    name: "Cloud Native Lima",
    role: "Co-Organizador",
    url: "https://community.cncf.io/cloud-native-lima/",
    logo: "cncf",
  },
  {
    name: "KCD Lima Perú",
    role: "Program Manager",
    url: "https://community.cncf.io/kcd-lima-peru/",
    logo: "kubernetes",
  },
] as const;

export const CERTIFICATIONS = [
  { name: "RHCA", fullName: "Red Hat Certified Architect", issuer: "Red Hat" },
  { name: "RHCE", fullName: "Red Hat Certified Engineer", issuer: "Red Hat" },
  { name: "RHCOA", fullName: "Red Hat Certified OpenShift Administrator", issuer: "Red Hat" },
  { name: "CKA", fullName: "Certified Kubernetes Administrator", issuer: "CNCF" },
  { name: "CKAD", fullName: "Certified Kubernetes Application Developer", issuer: "CNCF" },
  { name: "LFCS", fullName: "Linux Foundation Certified System Administrator", issuer: "Linux Foundation" },
] as const;

export const CAREER_TIMELINE = [
  {
    year: "2022 - Presente",
    title: "Senior Consultant",
    company: "Red Hat",
    description: "Consultoría en OpenShift, Kubernetes y soluciones Cloud Native para clientes enterprise.",
    current: true,
  },
  {
    year: "2020 - 2022",
    title: "Platform Engineer",
    company: "Empresa Tech",
    description: "Diseño e implementación de plataformas de contenedores y CI/CD.",
  },
  {
    year: "2018 - 2020",
    title: "DevOps Engineer",
    company: "Startup Cloud",
    description: "Automatización de infraestructura y pipelines de despliegue.",
  },
  {
    year: "2016 - 2018",
    title: "System Administrator",
    company: "IT Services",
    description: "Administración de servidores Linux y virtualización.",
  },
] as const;

export const SKILLS = [
  { name: "Kubernetes", level: 95 },
  { name: "OpenShift", level: 95 },
  { name: "Docker/Containers", level: 90 },
  { name: "Linux Administration", level: 90 },
  { name: "GitOps/ArgoCD", level: 85 },
  { name: "Terraform/IaC", level: 85 },
  { name: "CI/CD Pipelines", level: 85 },
  { name: "Observability", level: 80 },
] as const;

export const STATS = {
  yearsExperience: 9,
  certifications: 6,
  projectsDelivered: 50,
  communitySpeaks: 20,
} as const;
