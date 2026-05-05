const MAX_ENTRIES = 5;
const DISPLAY_MS = 3000;
const FADE_MS = 500;
const LINE_HEIGHT = 22;
const PADDING = 12;
const FONT = '14px monospace';

let entries = [];

export function init() {
  entries = [];
}

export function addKill(killerName, victimName) {
  entries.push({ killerName, victimName, createdAt: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function draw(ctx, canvasW, canvasH) {
  const now = Date.now();
  entries = entries.filter(e => now - e.createdAt < DISPLAY_MS + FADE_MS);

  if (entries.length === 0) return;

  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'bottom';

  const baseY = canvasH - PADDING;

  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const age = now - e.createdAt;
    const alpha = age < DISPLAY_MS
      ? 1
      : 1 - (age - DISPLAY_MS) / FADE_MS;

    const row = entries.length - 1 - i;
    const y = baseY - row * LINE_HEIGHT;

    const text = `${e.killerName} ▶ ${e.victimName}`;

    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#000';
    ctx.fillText(text, PADDING + 1, y + 1);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.fillText(text, PADDING, y);
  }

  ctx.restore();
}
