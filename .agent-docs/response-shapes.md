# Response Shapes

## Paginated Response

```typescript
{
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    pageCount: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    prevPage: number | null;
  };
}
```

## Single Entity Response

```typescript
{ user: UserSchema }
```

## Action Response

```typescript
{ success: true }
```
