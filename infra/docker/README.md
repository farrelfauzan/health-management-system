# Docker Dev Flow

Use explicit migration step before starting API/Web services.

1. Start database:

```bash
pnpm docker:dev:up
```

2. Run migrations explicitly:

```bash
pnpm docker:dev:migrate
```

3. Start API and Web:

```bash
pnpm docker:dev:start
```

4. Stop stack:

```bash
pnpm docker:dev:down
```
