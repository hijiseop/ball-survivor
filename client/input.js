// client/input.js — 마우스/터치 입력 → 월드 좌표 변환

const DEAD_ZONE = 40;

let _screenX = 0;
let _screenY = 0;
let _viewW = 0;
let _viewH = 0;
let _isTouching = false;

// 스킬 발동 콜백 (game.js에서 등록)
let _onSkill = null;
export function onSkillInput(cb) { _onSkill = cb; }

export function init(canvas) {
    _viewW = canvas.width;
    _viewH = canvas.height;

    _screenX = _viewW / 2;
    _screenY = _viewH / 2;

    // 마우스
    canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        _screenX = Math.max(0, Math.min(e.clientX - r.left, _viewW));
        _screenY = Math.max(0, Math.min(e.clientY - r.top, _viewH));
    });

    // 터치
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        _isTouching = true;
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        _screenX = Math.max(0, Math.min(t.clientX - r.left, _viewW));
        _screenY = Math.max(0, Math.min(t.clientY - r.top, _viewH));
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        _screenX = Math.max(0, Math.min(t.clientX - r.left, _viewW));
        _screenY = Math.max(0, Math.min(t.clientY - r.top, _viewH));
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        _isTouching = false;
        _screenX = _viewW / 2;
        _screenY = _viewH / 2;
    }, { passive: false });

    // Q/E/R 스킬 단축키
    window.addEventListener('keydown', e => {
        if (e.key === 'q' || e.key === 'Q') _onSkill?.(0);
        if (e.key === 'e' || e.key === 'E') _onSkill?.(1);
        if (e.key === 'r' || e.key === 'R') _onSkill?.(2);
    });
}

export function update() {}

export function getScreenPos() {
    const cx = _viewW / 2;
    const cy = _viewH / 2;
    const dx = _screenX - cx;
    const dy = _screenY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inDeadZone = _isTouching ? false : dist < DEAD_ZONE;
    return { x: _screenX, y: _screenY, inDeadZone, dist, deadZoneR: DEAD_ZONE, isTouching: _isTouching };
}

export function getWorldTarget(camX, camY, zoom) {
    const cx = _viewW / 2;
    const cy = _viewH / 2;
    const dx = _screenX - cx;
    const dy = _screenY - cy;

    // 마우스 데드존 (터치는 적용 안 함)
    if (!_isTouching && dx * dx + dy * dy < DEAD_ZONE * DEAD_ZONE) {
        return {
            x: cx / zoom + camX,
            y: cy / zoom + camY,
        };
    }

    return {
        x: _screenX / zoom + camX,
        y: _screenY / zoom + camY,
    };
}
