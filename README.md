# bubu

BuBu is a budget builder. This repository holds the application source code only. Budgets are stored in users' browsers and are not version controlled.

## Repository

- GitHub: https://github.com/hongyulu-github/bubu
- Remote: `git@github.com:hongyulu-github/bubu.git`
- Default branch: `main`

## Version-control workflow

Clone:

```sh
git clone git@github.com:hongyulu-github/bubu.git
cd bubu
```

Make a change on a branch:

```sh
git switch -c <branch-name>
git add <files>
git commit -m "Describe the change"
```

Push:

```sh
git push -u origin <branch-name>   # first push of a branch
git push                           # later pushes
```

Pull the latest changes:

```sh
git pull --ff-only
```

## Notes

- Push access requires being authenticated as the `hongyulu-github` account (SSH key or `gh auth login`).
- Never commit secrets. `.env` and `.env.*` are ignored; commit only `.env.example` files with placeholder values.
- Dependencies (`node_modules/`) and build output (`/build`, `/.svelte-kit`) are ignored.
