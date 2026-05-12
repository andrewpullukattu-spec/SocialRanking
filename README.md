# Rank It 🎉

A real-time social party ranking game. One player secretly ranks the group — everyone else tries to guess the order.

## How to play

1. **Host** opens the site and clicks **Host a Game** → adds players & prompts → hits Start
2. A **room code** appears on the host screen (e.g. `XK4T2`)
3. **Players** open the same URL on their phones, enter the room code, and join
4. Each round: the **Ranker** secretly drags everyone into order, everyone else guesses
5. Host hits **Reveal** — see who knows each other best!

## Tech

- **Frontend**: Vanilla HTML/CSS/JS, hosted on GitHub Pages
- **Real-time sync**: Firebase Realtime Database (free tier)

## Hosting on GitHub Pages

1. Push all files to a GitHub repo
2. Go to **Settings → Pages → Deploy from branch → main → / (root)**
3. Live at `https://<username>.github.io/<repo>/`

## Files

| File | Purpose |
|------|---------|
| `index.html` | All screens |
| `style.css` | Styling |
| `game.js` | Game logic + Firebase sync |
| `prompts.js` | 70+ built-in prompts |
