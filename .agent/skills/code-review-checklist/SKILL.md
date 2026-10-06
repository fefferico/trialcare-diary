---
name: code-review-checklist
description: Code review guidelines covering code quality, security, performance, and best practices.
allowed-tools: Read, Glob, Grep
---

# Code Review Checklist

## Quick Review Checklist

### Correctness & Functionality
- [ ] Code solves the stated problem and meets acceptance criteria
- [ ] Edge cases (empty states, nulls, timeouts) are handled
- [ ] Error handling and rollback logic in place
- [ ] No logical errors or off-by-one bugs

### Security
- [ ] Input validated and sanitized (no SQL/NoSQL injection)
- [ ] XSS prevented (outputs escaped/sanitized)
- [ ] CSRF & CORS policies enforced
- [ ] No hardcoded secrets or sensitive credentials (use environment variables)
- [ ] Authentication & authorization checks verified
- [ ] **AI-Specific:** Protection against Prompt Injection (if applicable)
- [ ] **AI-Specific:** Outputs sanitized before being used in critical sinks

### Performance
- [ ] No N+1 queries or redundant loops
- [ ] Appropriate caching (IndexedDB/Dexie, HTTP, memory)
- [ ] Bundle size and dynamic imports considered
- [ ] Memory leaks and unhandled subscriptions (RxJS) avoided

### Code Quality
- [ ] Clear, self-documenting naming conventions
- [ ] DRY principle followed without over-engineering
- [ ] SOLID principles and proper abstraction levels
- [ ] Component size guard enforced (templates < 150 lines)

### Testing
- [ ] Unit/Integration tests for new code
- [ ] Edge cases covered in tests
- [ ] Tests pass cleanly and remain maintainable

### Documentation
- [ ] Non-obvious *why* logic commented
- [ ] Public APIs and schemas documented
- [ ] README / DB docs updated if needed

---

## Detailed Review Step-by-Step

### 1. Functionality & Logic
```javascript
// ❌ Bad - Missing validation:
function createUser(email, password) {
  return db.users.create({ email, password });
}

// ✅ Good - Proper validation & early return:
function createUser(email, password) {
  if (!email || !isValidEmail(email)) {
    throw new Error('Invalid email address');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return db.users.create({ email, password });
}
```

### 2. Security Review
```javascript
// ❌ Bad - SQL / Query Injection risk:
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Good - Parameterized query (Supabase/Postgres):
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('email', email);
```

### 3. Anti-Patterns to Flag

```typescript
// ❌ Magic numbers
if (status === 3) { ... }

// ✅ Named constants / Enums
if (status === Status.ACTIVE) { ... }

// ❌ Deep nesting
if (a) { if (b) { if (c) { ... } } }

// ✅ Early returns (Guard Clauses)
if (!a) return;
if (!b) return;
if (!c) return;
// do work

// ❌ explicit 'any' type
const data: any = ...

// ✅ Proper interface / type
const data: UserData = ...
```

---

## AI & LLM Review Patterns (2026)

### Logic & Safety Sinks
- [ ] **Chain of Thought:** Does the logic follow a verifiable path?
- [ ] **Edge Cases:** Did the AI account for empty states, timeouts, and partial failures?
- [ ] **External State:** Is the code making safe assumptions about file systems, DB, or APIs?

```markdown
// ❌ Vague prompt in code
const response = await ai.generate(userInput);

// ✅ Structured & Safe prompt
const response = await ai.generate({
  system: "You are a specialized parser...",
  input: sanitize(userInput),
  schema: ResponseSchema
});
```

---

## Review Comments Guide

```
// Blocking issues use 🔴
🔴 BLOCKING: SQL injection vulnerability here

// Important suggestions use 🟡
🟡 SUGGESTION: Consider using useMemo / Computed signal for performance

// Minor nits use 🟢
🟢 NIT: Prefer const over let for immutable variable

// Questions use ❓
❓ QUESTION: What happens if user is null here?
```

