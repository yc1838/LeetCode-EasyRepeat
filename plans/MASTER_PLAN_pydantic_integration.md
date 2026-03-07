# Master Plan: Pydantic Integration

**Status**: Planning
**Created**: 2026-02-20
**Priority**: High

## Overview

This master plan covers the comprehensive integration of Pydantic ecosystem tools into the LeetCode SRS Extension project. The integration is divided into three phases, each with its own detailed plan and granular tasks.

## Strategic Goals

1. **Improve Type Safety**: Add comprehensive Pydantic models for API requests/responses and internal data structures
2. **Enhance LLM Output Validation**: Use Pydantic Evals to systematically validate and score LLM-generated content
3. **Simplify LLM Integration**: Migrate custom AgentFixer to Pydantic AI for cleaner, more maintainable code

## Three-Phase Approach

### Phase 0: Align with Current Implementation ⚠️ **CRITICAL - DO FIRST**
**Detailed Plan**: [phase0_alignment.md](./phase0_alignment.md)
**Effort**: 1-2 hours
**Risk**: Low
**Status**: Not Started

Fix implementation mismatches between original plans and current codebase.

**Key Deliverables**:
- Document current API contracts
- Update plans for backward compatibility
- Fix method name references
- Add missing dependencies
- Correct effort estimates

**Benefits**:
- Prevents breaking changes
- Ensures plans are executable
- Aligns with actual implementation
- Foundation for Phases 1-3

---

### Phase 1: Basic Pydantic Expansion ⭐ **HIGH PRIORITY**
**Detailed Plan**: [phase1_pydantic_models.md](./phase1_pydantic_models.md)
**Effort**: 4-6 hours
**Risk**: Low
**Status**: Not Started

Add Pydantic models for API responses and internal data structures in the Python MCP server.

**Key Deliverables**:
- Response models for `/verify` and `/autofix` endpoints
- Internal data models (TestResult, FixAttempt, TestCase)
- Configuration models with validation
- LLM output validation models

**Benefits**:
- Automatic OpenAPI documentation
- Type safety for API consumers
- Clear validation errors
- Foundation for Phases 2 & 3

---

### Phase 2: Pydantic Evals Integration ⭐ **HIGH PRIORITY**
**Detailed Plan**: [phase2_pydantic_evals.md](./phase2_pydantic_evals.md)
**Effort**: 4-6 hours
**Risk**: Medium
**Status**: Not Started

Integrate Pydantic Evals to systematically validate and score LLM outputs across the extension.

**Key Deliverables**:
- Evaluation framework for drill generation
- Quality scoring for skill analysis
- Hallucination detection improvements
- Provider performance comparison metrics

**Benefits**:
- Systematic LLM output validation
- Quality metrics and tracking
- Better hallucination detection
- Data-driven provider selection

---

### Phase 3: Pydantic AI Migration 🔵 **LOWER PRIORITY**
**Detailed Plan**: [phase3_pydantic_ai.md](./phase3_pydantic_ai.md)
**Effort**: 6-8 hours
**Risk**: Medium
**Status**: Not Started

Replace custom AgentFixer implementation with Pydantic AI for cleaner, more maintainable LLM integration.

**Key Deliverables**:
- Pydantic AI-based AgentFixerV2
- Structured output models (CodeFix, GeneratedTests)
- Multi-provider support
- Backward compatibility with feature flag

**Benefits**:
- ~60% less code to maintain
- Built-in retry logic and error handling
- Easy provider switching
- Production-ready monitoring

**Optional Upgrade — `pydantic-deepagents`**:
If you want checkpointing, cost budgets, parallel subagents, or Claude Code-style hooks
on top of `pydantic-ai`, consider [`pydantic-deepagents`](https://github.com/vstorm-co/pydantic-deepagents)
as a drop-in enhancement. See Phase 3 plan for the decision guide.

---

## Implementation Principles

### Test-Driven Development
After **each small task** in any phase:
1. ✅ Run all existing tests
2. 🔧 Fix any failed tests
3. ✨ Create new tests according to `/skill detailed-testing`
4. ⏸️ **STOP** - Wait for user verification before proceeding

### Quality Gates
Each task must pass:
- All unit tests passing
- All integration tests passing
- Code review (if applicable)
- User verification checkpoint

### Rollback Strategy
- Keep legacy implementations during migration
- Use feature flags for gradual rollout
- Maintain backward compatibility
- Easy rollback if issues arise

---

## Execution Order

### Recommended Sequence
1. **Phase 0** (Tasks 0.1 → 0.6) - Alignment with current code
2. **Phase 1** (Tasks 1.1 → 1.6) - Foundation
3. **Phase 2** (Tasks 2.1 → 2.6) - LLM validation
4. **Phase 3** (Tasks 3.1 → 3.6) - Optional refactor

### Dependencies
- Phase 1 requires Phase 0 completion
- Phase 2 can start after Phase 1 Task 1.4 (LLM output models)
- Phase 3 requires Phase 1 completion
- All phases are independent after Phase 1

---

## Progress Tracking

### Phase 0: Align with Current Implementation
- [ ] Task 0.1: Document Current API Contracts
- [ ] Task 0.2: Update Phase 1 for Backward Compatibility
- [ ] Task 0.3: Update Phase 2 for Current LLM Format
- [ ] Task 0.4: Update Phase 3 Method Names
- [ ] Task 0.5: Add Missing Dependencies
- [ ] Task 0.6: Fix Effort Estimates

### Phase 1: Basic Pydantic Expansion
- [ ] Task 1.1: Create models.py with Response Models
- [ ] Task 1.2: Add Internal Data Models
- [ ] Task 1.3: Add Configuration Models
- [ ] Task 1.4: Add LLM Output Validation Models
- [ ] Task 1.5: Update /verify Endpoint to Use Response Models
- [ ] Task 1.6: Update /autofix Endpoint to Use Response Models

### Phase 2: Pydantic Evals Integration
- [ ] Task 2.1: Add Pydantic Evals Dependency and Setup
- [ ] Task 2.2: Integrate Evals into AgentFixer._call_llm()
- [ ] Task 2.3: Add Eval Metrics Tracking
- [ ] Task 2.4: Add /evals/stats Endpoint
- [ ] Task 2.5: Add Drill Generation Eval (JavaScript Bridge)
- [ ] Task 2.6: Document Evals Usage and Best Practices

### Phase 3: Pydantic AI Migration
- [ ] Task 3.1: Add Pydantic AI Dependency
- [ ] Task 3.2: Create AgentFixerV2 with Pydantic AI
- [ ] Task 3.3: Implement AgentFixerV2 Core Methods
- [ ] Task 3.4: Add Feature Flag to Switch Implementations
- [ ] Task 3.5: Update Existing Tests for Compatibility
- [ ] Task 3.6: Add Comparison Testing and Migration Guide

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing tests | Medium | High | Test after each task, keep legacy code |
| LLM outputs don't match schemas | Medium | High | Fallback parsing, schema refinement |
| Performance regression | Low | Medium | Benchmark before/after |
| Dependency conflicts | Low | Low | Pin versions, test in isolation |

---

## Success Criteria

### Phase 1 Complete When:
- ✅ All API endpoints return Pydantic models
- ✅ All tests passing
- ✅ OpenAPI docs auto-generated
- ✅ No breaking changes to API consumers

### Phase 2 Complete When:
- ✅ All LLM outputs evaluated with Pydantic Evals
- ✅ Quality metrics tracked and logged
- ✅ Hallucination detection improved
- ✅ Provider comparison data available

### Phase 3 Complete When:
- ✅ AgentFixerV2 fully functional
- ✅ Feature flag allows easy switching
- ✅ All tests updated and passing
- ✅ Performance equal or better than legacy

---

## Timeline Estimate

| Phase | Duration | Start After |
|-------|----------|-------------|
| Phase 0 | 1-2 hours | Immediate |
| Phase 1 | 4-6 hours | Phase 0 complete |
| Phase 2 | 5-7 hours | Phase 1 Task 1.4 |
| Phase 3 | 6-8 hours | Phase 1 complete |
| **Total** | **16-23 hours** | |

**Recommended Schedule**:
- Week 1: Phase 0 (alignment) + Phase 1 (all tasks)
- Week 2: Phase 2 (all tasks)
- Week 3: Phase 3 (optional, can defer)

---

## Related Documentation

- [Original Plan](../breezy-hatching-parrot.md) - Initial analysis and recommendations
- [Testing Guidelines](../.agent/MEMORY_testing_guidelines.md) - Test requirements
- [MCP Server README](../mcp-server/README.md) - Backend architecture

---

## Notes

- JavaScript LLM gateway ([src/background/llm_gateway.js](../src/background/llm_gateway.js)) remains unchanged - already well-architected
- E2B sandbox integration must remain compatible throughout
- All changes are additive - no breaking changes to existing functionality
- User verification required after each task before proceeding
