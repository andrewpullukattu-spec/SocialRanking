# Rank It 🎉

A social party ranking game. One player secretly ranks the group — everyone else tries to guess the order.

## How to play

1. **Setup** — Add all players and pick your prompts (or browse the built-in bank of 70+ prompts)
2. **Rank** — One player grabs the phone as the Ranker and secretly drags everyone into order
3. **Guess** — Everyone else tries to guess the exact ranking
4. **Reveal** — See who knows the group best. Rotate rankers and repeat!

## Running locally

Just open `index.html` in a browser — no build step, no dependencies.

## Hosting on GitHub Pages

1. Fork or push this repo to GitHub
2. Go to **Settings → Pages**
3. Under *Source*, select **Deploy from a branch** → `main` → `/ (root)`
4. Hit Save — your game will be live at `https://<your-username>.github.io/<repo-name>/`

## How to use across devices

Since this is a single web page, the simplest approach for a party:

- **Host screen** — Open the URL on a laptop/TV browser. After setup, click through to the Host tab.
- **Controller** — Pass one phone around. Open the same URL, go to the Controller tab. Each player picks their name before taking their turn.

For a smoother experience across multiple devices on the same network, you can run a simple local server:

```bash
npx serve .
# then open the printed URL on any device on your Wi-Fi
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | All screens (setup, host, controller) |
| `style.css` | Styling |
| `game.js` | Game logic |
| `prompts.js` | 70+ built-in prompts across 6 categories |
