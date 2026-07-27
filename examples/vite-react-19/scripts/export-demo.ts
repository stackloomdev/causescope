import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = resolve(process.argv[2] ?? "../../docs/assets/causescope-demo.webm");
const videoPath = resolve(process.argv[3] ?? "../../docs/assets/causescope-demo-x.mp4");
const gifPath = resolve(process.argv[4] ?? "../../docs/assets/causescope-demo.gif");
const trimStart = 0.52;

const videoFilter = `trim=start=${trimStart},setpts=PTS-STARTPTS`;

const gifFilter = [
  `[0:v]trim=start=${trimStart},setpts=PTS-STARTPTS,fps=20,scale=1280:800:flags=lanczos,split[gifsrc][palettesrc]`,
  "[palettesrc]palettegen=max_colors=256:stats_mode=full[palette]",
  "[gifsrc][palette]paletteuse=dither=none",
].join(";");

function runFfmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status ?? "unknown"}`);
}

mkdirSync(dirname(videoPath), { recursive: true });
mkdirSync(dirname(gifPath), { recursive: true });

runFfmpeg([
  "-y",
  "-i", inputPath,
  "-vf", videoFilter,
  "-an",
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "18",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  videoPath,
]);

runFfmpeg([
  "-y",
  "-i", inputPath,
  "-filter_complex", gifFilter,
  "-gifflags", "-transdiff",
  "-loop", "0",
  gifPath,
]);

console.log(`Saved X video to ${videoPath}`);
console.log(`Saved README GIF to ${gifPath}`);
