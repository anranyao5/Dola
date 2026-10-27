# Dva development demo

Self-contained Chinese learning, virtual pets, and flower rewards prototype.

Open `index.html`, or deploy the repository root as a static website.
No installation, package manager, or build step is required.

## Important limits

This is a development demo, not a finished family service. All homework, pet progress, flowers, and redemption records are stored only in the current browser using localStorage. They do not sync between a parent's computer and a child's iPad. The parent entry is a UI switch, without real account authentication. Do not upload sensitive child information. Product photos are examples supplied for the reward catalogue; requesting a gift does not purchase anything.

## CloudBase static hosting

Repository: anranyao5/Dola
Branch: codex/dva-preview
Root directory: /
Build command: none (leave empty)
Output/static directory: .
Entry file: index.html

CloudBase's free default domain is for development/testing and has access and reliability limits. Verify the generated HTTPS address in the target environment after deployment. Keep existing __auth/ and cloud-admin/ files intact.

This branch contains only the tested single-file release and this README. It does not contain local databases, CLI authentication, or secrets.
