---
title: "10 TypeScript Tips for Better Code"
description: "Improve your TypeScript code with these practical tips that will help you write safer and more maintainable code."
pubDate: 2024-01-10
tags: ["typescript", "javascript", "tips"]
categories: ["devops"]
featured: false
lang: en
---

TypeScript has become the standard for professional JavaScript projects. Here I share 10 tips I use daily.

## 1. Use `unknown` Instead of `any`

The `unknown` type is safer than `any` because it requires validation:

```typescript
function processValue(value: unknown) {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  throw new Error("Expected string");
}
```

## 2. Native Utility Types

TypeScript includes useful types like `Partial`, `Required`, `Pick` and `Omit`:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

type UserUpdate = Partial<Pick<User, "name" | "email">>;
```

## 3. Const Assertions

Use `as const` to make values immutable:

```typescript
const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
} as const;
```

## 4. Template Literal Types

Create dynamic types based on strings:

```typescript
type EventName = `on${Capitalize<string>}`;
// "onClick", "onHover", etc.
```

## 5. Discriminated Unions

Use a common property to discriminate between types:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: Error };
```

## 6. Satisfies Operator

Validate types without losing inference:

```typescript
const colors = {
  red: "#ff0000",
  green: "#00ff00",
} satisfies Record<string, string>;
```

## 7. Custom Type Guards

Create functions that refine types:

```typescript
function isString(value: unknown): value is string {
  return typeof value === "string";
}
```

## 8. Generics with Constraints

Limit generic types:

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## 9. Inference with infer

Extract types from other types:

```typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
```

## 10. Strict Mode Always

Enable all strict checks in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

## Conclusion

These tips will help you get the most out of TypeScript. The key is to practice and apply them gradually in your projects.
