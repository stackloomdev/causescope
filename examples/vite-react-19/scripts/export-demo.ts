import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = resolve(process.argv[2] ?? "../../docs/assets/causescope-demo.webm");
const videoPath = resolve(process.argv[3] ?? "../../docs/assets/causescope-demo-x.mp4");
const gifPath = resolve(process.argv[4] ?? "../../docs/assets/causescope-demo.gif");
const trimStart = 0.52;
const drawerFocusStart = trimStart + 1.45;

const framedFilter = [
  "[0:v]split=2[pageinput][drawerinput]",
  `[pageinput]trim=start=${trimStart}:end=${drawerFocusStart},setpts=PTS-STARTPTS,crop=960:960:480:80[page]`,
  `[drawerinput]trim=start=${drawerFocusStart},setpts=PTS-STARTPTS,crop=960:960:960:230[drawer]`,
  "[page][drawer]concat=n=2:v=1:a=0[framed]",
].join(";");

const gifFilter = [
  framedFilter,
  "[framed]fps=12,split[gifsrc][palettesrc]",
  "[palettesrc]palettegen=max_colors=128:stats_mode=full[palette]",
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
  "-filter_complex", framedFilter,
  "-map", "[framed]",
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
