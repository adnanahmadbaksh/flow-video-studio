# 🎬 Flow Video Studio

A small web app for making AI videos with **Google Veo**, the model that powers Google Flow. It calls Google's official Gemini API directly and has no npm dependencies.

## Features
- Text-to-video from a prompt, with an optional negative prompt
- Image-to-video: upload a starting frame
- Pick a model: Veo 3.1, Veo 3.1 Fast, Veo 3, Veo 3 Fast, Veo 2, or type any newer model ID
- 16:9 or 9:16, 720p or 1080p, 4/6/8 seconds
- Runs several jobs at once with live status, an inline player and downloads
- Saves videos to `./videos/`

## Setup
1. Get a Gemini API key from https://aistudio.google.com/apikey. Veo needs a paid (billing-enabled) project.
2. Run it (Node 18+):

```bash
cd flow-video-studio
GEMINI_API_KEY=your_key_here npm start
```

3. Open http://localhost:3000

## How it works
- `POST /models/{model}:predictLongRunning` starts the generation.
- The server polls the returned operation every 8 seconds until it is done.
- It then downloads the MP4 and serves it to the UI.

The API key stays on the server and is never sent to the browser.

## Notes
- A generation usually takes 1 to 5 minutes.
- Google deletes generated videos from its side after about 2 days. This app keeps its own copy in `videos/`.
- The job list lives in memory and resets when the server restarts. Video files on disk are kept.
- Google Flow (labs.google/flow) has no public API. This app uses the same Veo models through the official API.
