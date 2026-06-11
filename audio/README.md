# ElevenLabs voice pack

The published app currently includes the Zephyr(Sports) Chinese voice pack.
It falls back to the phone's built-in Chinese voice if `voice-pack.json` or an
individual audio cue cannot be loaded.

To add a custom ElevenLabs voice without exposing an API key in the public site:

1. Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in a trusted local terminal.
2. Run `node scripts/generate-voice-pack.mjs`.
3. Commit the generated MP3 files and `audio/voice-pack.json`.

The API key is read only from the environment and is never written to the output.
