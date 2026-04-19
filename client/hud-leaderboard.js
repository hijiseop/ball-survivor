// client/hud-leaderboard.js — 킬 순위 리더보드 HUD (우측 상단)

const PANEL_W = 160;
const ROW_H   = 22;
const PAD_X   = 10;
const PAD_Y   = 8;
const MARGIN_X = 12;  // 캔버스 우측 여백
const MARGIN_Y = 48;  // 공격 쿨다운 텍스트(y≈32) 아래

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} players  — state.players 배열
 * @param {string} myId    — 내 플레이어 id
 * @param {number} canvasW — canvas.width
 */
export function draw(ctx, players, myId, canvasW) {
    const top5 = [...players]
        .sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0))
        .slice(0, 5);

    const rows  = top5.length;
    const panelH = PAD_Y * 2 + ROW_H * rows + 4;
    const x = canvasW - PANEL_W - MARGIN_X;
    const y = MARGIN_Y;

    // 배경 패널
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 20, 0.72)';
    roundRect(ctx, x, y, PANEL_W, panelH, 6);
    ctx.fill();

    // 타이틀
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('🏆 킬 순위', x + PAD_X, y + PAD_Y + 9);

    // 구분선
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + PAD_X, y + PAD_Y + 14);
    ctx.lineTo(x + PANEL_W - PAD_X, y + PAD_Y + 14);
    ctx.stroke();

    top5.forEach((p, i) => {
        const isMe = p.id === myId;
        const rowY = y + PAD_Y + 18 + i * ROW_H;

        // 내 행 하이라이트
        if (isMe) {
            ctx.fillStyle = 'rgba(79, 195, 247, 0.18)';
            ctx.fillRect(x + 3, rowY - 2, PANEL_W - 6, ROW_H - 2);
        }

        // 순위 번호
        ctx.font = isMe ? 'bold 11px Arial' : '11px Arial';
        ctx.fillStyle = rankColor(i);
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}.`, x + PAD_X, rowY + 13);

        // 이름 (최대 8자 truncate)
        const name = truncate(p.name ?? '?', 8);
        ctx.fillStyle = isMe ? '#4fc3f7' : (p.alive === false ? '#888' : '#e0e0e0');
        ctx.font = isMe ? 'bold 11px Arial' : '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(name, x + PAD_X + 20, rowY + 13);

        // 킬 수
        ctx.fillStyle = isMe ? '#80deea' : '#aaa';
        ctx.font = '11px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${p.kills ?? 0}K`, x + PANEL_W - PAD_X, rowY + 13);
    });

    ctx.restore();
}

// ── helpers ──────────────────────────────────────────────────────

function rankColor(i) {
    return ['#ffd700', '#c0c0c0', '#cd7f32', '#aaa', '#aaa'][i] ?? '#aaa';
}

function truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
