let pickupFlashUntil = 0;
let pickupFlashType  = '';
let pickupMsg        = '';
let pickupMsgUntil   = 0;
const pickupBursts   = [];

export function notify({ result }, viewW, viewH) {
    if (!result || result.noEffect) return;
    const now = Date.now();
    pickupMsg = getPickupMessage(result);
    pickupMsgUntil = now + 1400;
    spawnPickupBurst(result, now, viewW, viewH);

    if (result.legendary) {
        pickupFlashType  = 'legendary';
        pickupFlashUntil = now + 1500;
    } else if (result.curse) {
        pickupFlashType  = 'curse';
        pickupFlashUntil = now + 600;
    } else {
        pickupFlashType  = 'upgrade';
        pickupFlashUntil = now + 500;
    }
}

export function draw(ctx, viewW, viewH, now) {
    drawPickupFlash(ctx, viewW, viewH, now);
    drawPickupBursts(ctx, viewW, viewH, now);
    drawPickupMessage(ctx, viewW, viewH, now);
}

function drawPickupFlash(ctx, viewW, viewH, now) {
    if (now >= pickupFlashUntil) return;

    const duration = pickupFlashType === 'legendary' ? 1500 : pickupFlashType === 'curse' ? 600 : 500;
    const t = 1 - (now - (pickupFlashUntil - duration)) / duration;
    const alpha = Math.max(0, t);
    const edgeSize = pickupFlashType === 'legendary' ? 80 : 50;

    let color;
    if (pickupFlashType === 'legendary') {
        const hue = (now / 5) % 360;
        color = `hsla(${hue},100%,60%,`;
    } else if (pickupFlashType === 'curse') {
        color = 'rgba(180,0,200,';
    } else {
        color = 'rgba(255,220,0,';
    }

    // 상단 테두리
    const gradTop = ctx.createLinearGradient(0, 0, 0, edgeSize);
    gradTop.addColorStop(0, color + (alpha * 0.6) + ')');
    gradTop.addColorStop(1, color + '0)');
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, viewW, edgeSize);

    // 하단 테두리
    const gradBot = ctx.createLinearGradient(0, viewH, 0, viewH - edgeSize);
    gradBot.addColorStop(0, color + (alpha * 0.6) + ')');
    gradBot.addColorStop(1, color + '0)');
    ctx.fillStyle = gradBot;
    ctx.fillRect(0, viewH - edgeSize, viewW, edgeSize);

    // 좌측 테두리
    const gradLeft = ctx.createLinearGradient(0, 0, edgeSize, 0);
    gradLeft.addColorStop(0, color + (alpha * 0.6) + ')');
    gradLeft.addColorStop(1, color + '0)');
    ctx.fillStyle = gradLeft;
    ctx.fillRect(0, 0, edgeSize, viewH);

    // 우측 테두리
    const gradRight = ctx.createLinearGradient(viewW, 0, viewW - edgeSize, 0);
    gradRight.addColorStop(0, color + (alpha * 0.6) + ')');
    gradRight.addColorStop(1, color + '0)');
    ctx.fillStyle = gradRight;
    ctx.fillRect(viewW - edgeSize, 0, edgeSize, viewH);
}

function drawPickupMessage(ctx, viewW, viewH, now) {
    if (!pickupMsg || now >= pickupMsgUntil) return;
    const remain = pickupMsgUntil - now;
    const alpha = Math.min(1, remain / 250);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = viewW / 2;
    const y = viewH - 96;
    const metrics = ctx.measureText(pickupMsg);
    const w = Math.min(viewW - 24, metrics.width + 28);

    ctx.fillStyle = 'rgba(8, 10, 18, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 17, w, 34, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(pickupMsg, x, y + 1);
    ctx.restore();
}

function drawPickupBursts(ctx, viewW, viewH, now) {
    for (let i = pickupBursts.length - 1; i >= 0; i--) {
        const burst = pickupBursts[i];
        const elapsed = now - burst.startTime;
        if (elapsed >= burst.duration) {
            pickupBursts.splice(i, 1);
            continue;
        }

        const t = elapsed / burst.duration;
        const fade = 1 - t;
        ctx.save();

        drawBurstParticles(ctx, burst, t, fade);
        ctx.restore();
    }
}

function drawBurstParticles(ctx, burst, t, fade) {
    for (const p of burst.particles) {
        const px = p.x + p.vx * t * (burst.duration / 1000);
        const py = p.y + p.vy * t * (burst.duration / 1000);
        ctx.globalAlpha = fade * (1 - t * 0.5);
        ctx.fillStyle = p.color;

        if (p.shape === 'coin') {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.spin + t * 12);
            ctx.scale(1, 0.55 + 0.35 * Math.sin(t * 18 + p.spin));
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (p.shape === 'shard') {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.spin + t * 7);
            ctx.beginPath();
            ctx.moveTo(0, -p.size * 1.7);
            ctx.lineTo(p.size * 0.9, p.size);
            ctx.lineTo(-p.size * 0.9, p.size * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function spawnPickupBurst(result, now, viewW, viewH) {
    const isCurse = result.curse;
    const level = result.legendary ? 4 : Math.max(1, result.level ?? 1);
    const duration = isCurse ? 900 : level === 4 ? 1600 : 600 + level * 120;
    const count = isCurse ? 24 : [0, 12, 20, 32, 60][level];
    const colors = getBurstColors(isCurse, level);

    const particles = [];
    for (let i = 0; i < count; i++) {
        // 4방향 모서리에서 시작
        const edge = i % 4;
        let px, py, vx, vy;
        const speed = 120 + Math.random() * (level === 4 ? 200 : 60 + level * 30);
        const spread = 0.4 + Math.random() * 0.4;

        if (edge === 0) { // 상단
            px = Math.random() * viewW;
            py = 0;
            vx = (viewW / 2 - px) * spread * 0.01;
            vy = speed * 0.7;
        } else if (edge === 1) { // 하단
            px = Math.random() * viewW;
            py = viewH;
            vx = (viewW / 2 - px) * spread * 0.01;
            vy = -speed * 0.7;
        } else if (edge === 2) { // 좌측
            px = 0;
            py = Math.random() * viewH;
            vx = speed * 0.7;
            vy = (viewH / 2 - py) * spread * 0.01;
        } else { // 우측
            px = viewW;
            py = Math.random() * viewH;
            vx = -speed * 0.7;
            vy = (viewH / 2 - py) * spread * 0.01;
        }

        particles.push({
            x: px,
            y: py,
            vx,
            vy,
            size: (isCurse ? 3 : 2.5) + Math.random() * (level === 4 ? 5 : 2 + level),
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: isCurse ? 'shard' : level === 4 && Math.random() > 0.5 ? 'coin' : 'spark',
            spin: Math.random() * Math.PI,
        });
    }

    pickupBursts.push({
        type: isCurse ? 'curse' : level === 4 ? 'legendary' : 'reward',
        level,
        startTime: now,
        duration,
        x: viewW / 2,
        y: viewH / 2,
        particles,
    });
}

function getBurstColors(isCurse, level) {
    if (isCurse) return ['#2b083f', '#6d1b8f', '#b000ff', '#111111'];
    if (level === 4) return ['#ff1744', '#ffea00', '#00e676', '#00b0ff', '#d500f9', '#ffffff'];
    if (level === 3) return ['#ffd54f', '#ce93d8', '#80deea', '#ffffff'];
    if (level === 2) return ['#80cbc4', '#4dd0e1', '#ffffff'];
    return ['#d6d6d6', '#fff59d', '#ffffff'];
}

function getSkillLabel(type) {
    return ({
        explosion: '폭발',
        shield: '방어막',
        dash: '대쉬',
        heal: '회복',
    })[type] ?? '스킬';
}

function getPickupMessage(result) {
    if (result.curse) {
        if (result.effect === 'none') return '저주: 잃을 스킬이 없습니다';
        if (result.effect === 'destroy') return `저주: ${getSkillLabel(result.type)} 소멸`;
        if (result.effect === 'downgrade') return `저주: ${getSkillLabel(result.type)} 레벨 감소`;
        return '저주 발동';
    }
    if (result.legendary) return `전설 ${getSkillLabel(result.type)} Lv${result.level} 획득`;
    if (result.slotIndex !== undefined) return `${getSkillLabel(result.type)} Lv${result.level} 획득`;
    return '아이템 획득';
}
