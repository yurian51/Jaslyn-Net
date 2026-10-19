# JASLYN NET UI primitives

Shared, dependency-free UI primitives for the Next.js App Router frontend.

## Architecture

- `button.tsx` — button variants, sizes, and busy state.
- `field.tsx` — labeled input, select, and textarea controls with inline help and validation.
- `card.tsx` — composable card layout primitives.
- `status-badge.tsx` — compact, text-first status display.
- `feedback.tsx` — skeleton, empty state, and live-region alert.
- `data-table.tsx` — generic accessible table with loading and empty states.
- `index.ts` — stable public export surface.
- `ui.css` — design tokens and component styles; imported once by the root layout.
- `/ui-kit` — live component gallery and implementation examples.

## Example

```tsx
import { Button, Card, CardContent, CardHeader, CardTitle, StatusBadge } from '../components/ui';

export function ServiceSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiber uplink</CardTitle>
      </CardHeader>
      <CardContent>
        <StatusBadge tone="success" dot>Online</StatusBadge>
        <Button onClick={() => console.log('Open service details')}>View service</Button>
      </CardContent>
    </Card>
  );
}
```

## API conventions

- Native HTML attributes are forwarded where appropriate; component-specific props are typed and documented.
- Buttons default to `type="button"` to avoid accidental form submissions. Pass `type="submit"` intentionally.
- `TextField`, `SelectField`, and `TextareaField` require a visible `label`; `error` sets `aria-invalid` and is associated through `aria-describedby`.
- `DataTable<T>` requires a caption, columns, rows, and a stable `getRowKey`. Column renderers keep domain formatting outside the primitive.
- Loading and empty states belong to the component API so each feature does not reimplement them.
- Use semantic tone and visible text together. Do not communicate status using color alone.

## Production guidance

1. Keep business logic, network requests, sorting, filtering and pagination in feature components; keep primitives presentational.
2. Use stable keys and stable IDs; never use array indexes as data row keys.
3. Preserve visible focus indicators and ensure every form control has an accessible name.
4. Show actionable error copy and retain user-entered values after recoverable failures.
5. Respect reduced-motion preferences and avoid layout shifts while loading.
6. Validate with `pnpm --filter @jaslyn-net/web typecheck`, `pnpm --filter @jaslyn-net/web lint`, and `pnpm --filter @jaslyn-net/web verify:ui`.
