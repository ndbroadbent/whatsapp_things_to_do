# E2E Test Guidelines

## Writing a New E2E Test

1. **Run the CLI yourself first** to see the actual output:
   ```bash
   bun src/cli.ts <command> tests/fixtures/cli/whatsapp-sample.txt
   ```

2. **Note the actual values** from the output (message counts, stats, etc.)

3. **Write the test file** with assertions based on the real output

## Test Assertions

Use `toBeGreaterThanOrEqual` with the **current actual value** for numeric assertions.

This allows us to add more messages to the fixture in the future without breaking tests.

```typescript
// ✅ Correct - uses current value as minimum
expect(stats.totalEmbedded).toBeGreaterThanOrEqual(182)

// ❌ Wrong - too loose, doesn't catch regressions
expect(stats.totalEmbedded).toBeGreaterThan(0)
```

## Cache Fixtures

E2E tests use cached API responses from `tests/fixtures/cli/cache-fixture.tar.gz`.

When tests make new API calls, the fixture is automatically updated. Commit the updated fixture.
