---
title: "10 tips de TypeScript para escribir mejor codigo"
description: "Mejora tu codigo TypeScript con estos consejos practicos que te ayudaran a escribir codigo mas seguro y mantenible."
pubDate: 2024-01-10
tags: ["typescript", "javascript", "tips"]
categories: ["devops"]
featured: false
lang: es
---

TypeScript se ha convertido en el estándar para proyectos JavaScript profesionales. Aquí comparto 10 tips que uso diariamente.

## 1. Usa `unknown` en lugar de `any`

El tipo `unknown` es más seguro que `any` porque requiere validación:

```typescript
function processValue(value: unknown) {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  throw new Error("Expected string");
}
```

## 2. Tipos de utilidad nativos

TypeScript incluye tipos útiles como `Partial`, `Required`, `Pick` y `Omit`:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

type UserUpdate = Partial<Pick<User, "name" | "email">>;
```

## 3. Const assertions

Usa `as const` para hacer que los valores sean inmutables:

```typescript
const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
} as const;
```

## 4. Template literal types

Crea tipos dinámicos basados en strings:

```typescript
type EventName = `on${Capitalize<string>}`;
// "onClick", "onHover", etc.
```

## 5. Discriminated unions

Usa una propiedad común para discriminar entre tipos:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: Error };
```

## 6. Satisfies operator

Valida tipos sin perder la inferencia:

```typescript
const colors = {
  red: "#ff0000",
  green: "#00ff00",
} satisfies Record<string, string>;
```

## 7. Type guards personalizados

Crea funciones que refinan tipos:

```typescript
function isString(value: unknown): value is string {
  return typeof value === "string";
}
```

## 8. Generics con constraints

Limita los tipos genéricos:

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## 9. Inferencia con infer

Extrae tipos de otros tipos:

```typescript
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
```

## 10. Strict mode siempre

Activa todas las verificaciones estrictas en `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

## Conclusión

Estos tips te ayudarán a aprovechar al máximo TypeScript. La clave está en practicar y aplicarlos gradualmente en tus proyectos.
