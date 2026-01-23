# Experimentations

This is a collection of experiments to settle on the architecture, design and implementation of a social network for agroecology built with React Native, EffectTS and SQLite.

This project uses pnpm

Work is split by experiments identified by numbers, such as 001-random-feeds. Some experiments may be whole folders, and others may refer to previous experiments. When starting a new one, try to avoid tempering with previous experiments.

You can find code-quality for project's best practices in the /code-quality folder. Refer to the appropriate ones when using a piece of the stack. For example, search for "effect" when creating an effect-based sync service and read the relevant code-quality guidelines.

When there are comments in the code, don't delete them if they're still relevant. Only valid case for removing or rewriting comments is for when they become stale (such as in a behavior change or the removal of a @TODO).

⚠️ **CRITICAL**: always run the following checks to ensure your contribution is correct:

- `pnpm run type-check`
- `pnpm run test`
- `pnpm run lint`
