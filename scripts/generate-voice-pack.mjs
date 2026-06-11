import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;

if (!apiKey || !voiceId) {
  console.error("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID before running this script.");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "audio", "generated");

const cues = {
  warmup_start: "出发啦。先快走十五分钟去公园。肩膀放松，我们慢慢来。",
  warmup_halfway: "已经走一半啦。身体是不是慢慢暖起来了？保持轻快。",
  warmup_one_minute: "还有一分钟到公园。看看周围，准备开始第一组。",
  run_halfway: "这一段过半了。很好，稳住这个节奏。",
  run_last_50: "还剩五十米。保持动作，不需要冲刺。",
  walk_halfway: "走过一半了。深呼吸，让心跳慢慢下来。",
  walk_last_50: "还剩五十米，准备开始下一段。",
  paused: "已经暂停。慢慢来，准备好了再继续。",
  resumed: "继续啦。按自己的节奏来。",
  cooldown_start: "五组全部完成。你做到了。现在慢慢走回家，好好放松。",
  finished: "到家啦。今天的训练完成。你真的很棒，现在好好休息。",
};

for (let round = 1; round <= 5; round += 1) {
  cues[`run_${round}`] = `第${round}组开始，跑四百米。不要冲，找到舒服稳定的节奏。`;
  cues[`walk_${round}`] = `第${round}组跑完了。现在走两百米，慢慢把呼吸找回来。`;
}

await mkdir(outputDir, { recursive: true });
const manifest = {
  name: "ElevenLabs 自定义语音",
  generatedAt: new Date().toISOString(),
  cues: {},
};

for (const [id, text] of Object.entries(cues)) {
  process.stdout.write(`Generating ${id}... `);
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        language_code: "zh",
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs failed for ${id}: ${response.status} ${detail}`);
  }

  const relativePath = `./audio/generated/${id}.mp3`;
  await writeFile(join(outputDir, `${id}.mp3`), Buffer.from(await response.arrayBuffer()));
  manifest.cues[id] = relativePath;
  console.log("done");
}

await writeFile(
  join(root, "audio", "voice-pack.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log("Voice pack generated.");
