# The kitchen

Run `scripts/agents/kit rulebook`: it prints the kitchen rulebook, every station from idea to
release, who decides, and the builder and reviewer pins. It has two parts:

- **The shared rulebook,** the same for every project, with the kit (`docs/kitchen.md` in the Agent Kit).
- **This project's extras,** which win where they differ: [docs/agents/kitchen-extras.md](kitchen-extras.md)
  (named by `rulebookExtras` in `scripts/agents/kit.json`).
