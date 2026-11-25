# 🎬 Flow Video Studio

A small web app for making AI videos with **Google Veo**, the model that powers Google Flow. It calls Google's official Gemini API directly and has no npm dependencies.

## Features
- Text-to-video from a prompt, with an optional negative prompt
- Image-to-video: upload a starting frame
- Pick a model: Veo 3.1, Veo 3.1 Fast, Veo 3, Veo 3 Fast, Veo 2, or type any newer model ID
- 16:9 or 9:16, 720p or 1080p, 4/6/8 seconds
- Runs several jobs at once with live status, an inline player and downloads
- Saves videos to `./videos/`

## Setup (easy way)
1. Install **Node.js** (LTS) from https://nodejs.org
2. Download this repo: green **Code** button → **Download ZIP**, then unzip it.
3. Double-click **`start.bat`** (Windows) or **`start.command`** (Mac). The app opens at http://localhost:3000
4. Paste your Gemini API key (from https://aistudio.google.com/apikey, billing on) into the box at the top. It's remembered in your browser.

Advanced: you can also set `GEMINI_API_KEY` as an env var and run `npm start`; the key box is then hidden.

## How it works
- `POST /models/{model}:predictLongRunning` starts the generation.
- The server polls the returned operation every 8 seconds until it is done.
- It then downloads the MP4 and serves it to the UI.

The key is stored only in your own browser and sent only to your local server, which passes it to Google. It is never saved to disk or shown in the job list.

## Notes
- A generation usually takes 1 to 5 minutes.
- Google deletes generated videos from its side after about 2 days. This app keeps its own copy in `videos/`.
- The job list lives in memory and resets when the server restarts. Video files on disk are kept.
- Google Flow (labs.google/flow) has no public API. This app uses the same Veo models through the official API.
