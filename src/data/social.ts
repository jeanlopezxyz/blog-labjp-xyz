export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

export const socialLinks: SocialLink[] = [
  {
    name: "GitHub",
    url: "https://github.com/jeanpaullopez",
    icon: "mdi:github",
  },
  {
    name: "LinkedIn",
    url: "https://linkedin.com/in/jeanpaullopez",
    icon: "mdi:linkedin",
  },
  {
    name: "Twitter",
    url: "https://twitter.com/jeanpaullopez",
    icon: "mdi:twitter",
  },
  {
    name: "Email",
    url: "mailto:contact@labjp.xyz",
    icon: "mdi:email-outline",
  },
];
