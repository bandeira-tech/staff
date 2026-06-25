# 20260625121936-grammar-shape — ledger

- 12:19 minted meta.md — round 2 of the listing-spec coordination. Mandate is to challenge the `?pattern=` decision AND the broader URL+params shape against URL+glob (observe-style), across read AND observe. Two tables required (per-use-case + tradeoff-dimensions). Recommendation: A / B / Hybrid.
- 12:19 manager joined, UI opened.
- 12:19 priors: round 1 room `20260625093437-listing-spec` (closed). Round 1 deliverable referenced in meta as the starting position to challenge.
- 12:20 dispatched all 4 participants in one tool message (run_in_background): core, move, save, cc-chat. Each tasked to build Table A (12 cases) and Table B (12 dimensions) then recommend A / B / Hybrid.
- 12:25 core completed first (4 msgs): rec = Shape B + ?fn= override. Authority verdict on URI/URL doctrine: B does NOT violate; observe is the precedent.
- 12:26 move completed (5 msgs + close): rec = Shape B. Load-bearing argument: MCP `b3nd_read` tool description shrinks to match `resources/subscribe`; one grammar across both surfaces.
- 12:26 cc-chat completed (5 msgs + close): rec = Shape B with **always-explicit ?fn= when wildcards present** (updated position; conceded save's silent-default-trap concern). Hard-counted 17 occurrences of `<root><room>/**` already in cc-chat docs/code under shape B.
- 12:27 save completed (5 msgs + close): rec = Shape B as primary; ?pattern= dropped (one glob grammar via `compilePattern`); ?fn=find REQUIRED when ** is in URI (silent-default-trap mitigation). Deeper insight: `b3nd-save/src/read.ts:177-228` patternToRegex/patternToSqlLike DELETED in favor of routing through `b3nd-core/src/match-pattern.ts`.
- 12:30 room converged on Shape B with mandatory ?fn= when wildcards present.
- 12:31 drafted /Users/m0/ws/b3nd-cc-chat/.cc-chat/20260625121936-grammar-shape/output.md (revision of round 1 §3.1/§3.2/§3.5/parts of §6; round 1's other commitments survive unchanged).
- 12:32 posted matching manager/output/<ts>-spec-v2.md (byte-identical). Minted manager/end. Room closed.
