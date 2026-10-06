---
name: systematic-debugging
description: 4-phase systematic debugging methodology with root cause analysis, Iron Law constraints, and evidence-based verification.
allowed-tools: Read, Glob, Grep
---

# Systematic Debugging

> **Core Principle:** NEVER propose fixes without root cause investigation first. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes. When 3 or more fixes fail: **STOP and question the architecture.**

---

## 4-Phase Debugging Process

### Phase 1: Reproduce & Investigate Root Cause

Before attempting ANY fix:
1. **Read Error Messages Carefully**: Read stack traces completely, note line numbers, file paths, and error codes.
2. **Reproduce Consistently**: Trigger the issue reliably, write down exact steps.
3. **Gather Multi-Layer Evidence**:
   ```
   For EACH component boundary (UI → IPC/Service → DB/Supabase):
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer
   ```
4. **Trace Data Flow**: Trace backward from bad value to its source. Fix at source, not at symptom.

```markdown
## Reproduction Protocol
1. [Exact step to reproduce]
2. [Expected vs actual result]
3. [Reproduction Rate: 100% / Frequent / Intermittent]
```

### Phase 2: Pattern Analysis

1. **Find Working Examples**: Locate similar working code in the same codebase.
2. **Compare Differences**: List every difference between working and broken cases.
3. **Understand Dependencies**: Check env variables, config, and assumptions.

### Phase 3: Form Single Hypothesis & Test Minimally

1. **Formulate Hypothesis**: "I think X is the root cause because Y".
2. **Minimal Test**: Change ONLY one variable at a time.
3. **Verify**: Did it fix the issue? If not, revert and form a new hypothesis.

### Phase 4: Fix & Verify

```markdown
## Fix Verification Checklist
- [ ] Root cause identified and documented
- [ ] Bug no longer reproduces
- [ ] Related functionality still works cleanly
- [ ] Regression test added
```

---

## Common Debugging Commands

```bash
# Recent changes & commits
git log --oneline -20
git diff HEAD~5

# Search for error pattern
grep -r "errorPattern" --include="*.ts"

# Check logs
npm run lint
```

---

## Anti-Patterns

❌ **Random changes** - "Maybe if I change this..."
❌ **Ignoring evidence** - "That can't be the cause"
❌ **Assuming** - "It must be X" without proof
❌ **Not reproducing first** - Fixing blindly
❌ **Stopping at symptoms** - Patching output without fixing data source

