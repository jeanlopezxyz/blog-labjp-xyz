export const CATEGORIES = [
  { id: "kubernetes", label: "Kubernetes", icon: "simple-icons:kubernetes", color: "#326CE5" },
  { id: "openshift", label: "OpenShift", icon: "simple-icons:redhatopenshift", color: "#EE0000" },
  { id: "cloud-native", label: "Cloud Native", icon: "mdi:cloud-outline", color: "#8B5CF6" },
  { id: "gitops", label: "GitOps", icon: "mdi:git", color: "#F97316" },
  { id: "automation", label: "Automatización", icon: "mdi:robot-outline", color: "#A855F7" },
  { id: "ia", label: "IA", icon: "mdi:brain", color: "#F59E0B" },
  { id: "devops", label: "DevOps", icon: "mdi:infinity", color: "#06B6D4" },
  { id: "comunidad", label: "Comunidad", icon: "mdi:account-group", color: "#22c55e" },
] as const;

export const CATEGORY_IDS = CATEGORIES.map(({ id }) => id) as [
  typeof CATEGORIES[number]["id"],
  ...typeof CATEGORIES[number]["id"][],
];

export type CategoryId = typeof CATEGORIES[number]["id"];
