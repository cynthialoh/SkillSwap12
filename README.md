# SkillSwap

SkillSwap is a peer-to-peer learning marketplace. Every member can both teach and learn; admins use a separate operational account.

## Current build

The interactive app in [`skillswap-app/`](./skillswap-app/README.md) has implemented Phases 0–7 and the gated foundations of Phases 8–9: authentication and onboarding, member profiles and discovery, learning requests and messaging, timezone-aware sessions, the immutable credit ledger, wallet history, Admin reconciliation, and the two-leg direct-swap protocol. Phase 14 adds an aggregate Admin metrics dashboard and beta/operations readiness documents; infrastructure, restore, security/accessibility sign-off, and the pilot remain operator work. Credit movement is disabled by default pending approval of the Phase 1 credit and cancellation policies; see [`PHASE_1_DECISIONS.md`](./PHASE_1_DECISIONS.md) and [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). The static prototype in `index.html` remains a separate visual reference.

The generated SkillSwap logo is preserved as [skillswap-logo-original.png](./skillswap-logo-original.png); app-color versions are [skillswap-logo.png](./skillswap-logo.png), [skillswap-symbol.png](./skillswap-symbol.png), and [skillswap-wordmark.png](./skillswap-wordmark.png). The symbol and wordmark are used in the app header, and the symbol is the favicon.

## Run locally

Follow the PostgreSQL, environment, and app instructions in [`skillswap-app/README.md`](./skillswap-app/README.md). To open the static visual reference, open `index.html` in a browser.

## Product source

See [SkillSwap.md](./SkillSwap.md) for the master product requirements document.

See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for the Phase 0 design foundation and open [design-system.html](./design-system.html) in a browser for the visual reference page.

See [PHASE_1_DECISIONS.md](./PHASE_1_DECISIONS.md) for the Phase 1 architecture baseline, proposed credit/session rules, authorization matrix, lifecycle diagrams, and decisions awaiting product-owner sign-off.

The phase-by-phase implementation status and remaining work are tracked in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md). The app is configured for the local PostgreSQL instance; production hosting, provider credentials, and credit settlement remain separate deployment and product decisions.
