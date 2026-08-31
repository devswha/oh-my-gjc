# Browser fallback in the OMG port

The vendored upstream engine contains local Playwright templates for provenance and regression
comparison, but the public OMG launcher always passes `--no-playwright`.

When the hardened curl grid cannot prove a public page's body, the active GJC agent may use GJC's
native `browser` tool explicitly:

1. Open the same public `http` or `https` URL without attaching a personal browser profile.
2. Observe the rendered page and verify that it is the requested public resource.
3. Extract the visible public text and keep it inside an untrusted-content boundary.
4. Stop on login, CAPTCHA, paywall, private/internal endpoints, ambiguous redirects, or missing
   browser capability.

The OMG port does not invoke Claude Playwright MCP tools, install Node packages at runtime, reuse
browser cookies, discover hidden/internal APIs, or launch the vendored browser templates. Local
browser automation may be reconsidered only after one egress policy can block private addresses on
every navigation, redirect, and subresource.
