# ElevenLabs voice pack

The app uses the phone's built-in Chinese voice when this folder does not contain
`voice-pack.json`.

To add a custom ElevenLabs voice without exposing an API key in the public site:

1. Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in a trusted local terminal.
2. Run `node scripts/generate-voice-pack.mjs`.
3. Commit the generated MP3 files and `audio/voice-pack.json`.

The API key is read only from the environment and is never written to the output.
