# M58: redesign the Windtunnel public website

Windtunnel's public pages had inconsistent surfaces, excessive decorative graphics
and a weak offer hierarchy. This redesign establishes one dark visual system,
rebuilds the homepage around the offer and real evidence, and makes study conditions
and limitations easier to inspect. It retains static HTML/CSS/vanilla JavaScript.

The change adds independent website verification, accessible navigation and table
scrolling, an original cone/process diagram, locally hosted licensed fonts, updated
social artwork and synchronized metadata/documentation. Operator styling and behavior
are unchanged relative to local M57 a27bea9.

Validation: 15 site checks including responsive screenshot capture; lint, typecheck,
docs check and production build; 916 unit tests, 18 operator smoke tests and four
forecast tests. Mobile Lighthouse:99/100/100/100; measured homepage142 KiB.

Preview: https://site-104ggjjp0-franklinhou-5415s-projects.vercel.app
Protected by the hosting account; no production publication. Screenshots and detailed
verification are in docs/audits/m58/REVIEW.md.

Integration note: remote main is still M56 c478231. This branch includes local M57
prerequisite commits; reconcile that baseline before merge. Custom-domain redirects,
mailbox/form and search provisioning remain separate follow-ups.
