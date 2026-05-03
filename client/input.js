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

// 스킬 슬롯 터치 영역 (renderer에서 등록)
let _skillTouchAreas = []; // [{ x, y, w, h }, ...]
export function registerSkillAreas(areas) { _skillTouchAreas = areas; }

// 관전 전환 콜백 (-1 = 이전, +1 = 다음)
let _onSpectate = null;
export function onSpectateInput(cb) { _onSpectate = cb; }

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

        // 스킬 슬롯 터치 체크
        if (e.changedTouches[0]) {
            const r = canvas.getBoundingClientRect();
            const tx = e.changedTouches[0].clientX - r.left;
            const ty = e.changedTouches[0].clientY - r.top;
            for (let i = 0; i < _skillTouchAreas.length; i++) {
                const a = _skillTouchAreas[i];
                if (tx >= a.x && tx <= a.x + a.w && ty >= a.y && ty <= a.y + a.h) {
                    _onSkill?.(i);
                    break;
                }
            }
        }

        _screenX = _viewW / 2;
        _screenY = _viewH / 2;
    }, { passive: false });

    // Q/E/R 스킬 단축키 + 좌우 화살표 관전 전환
    window.addEventListener('keydown', e => {
        if (e.key === 'q' || e.key === 'Q') _onSkill?.(0);
        if (e.key === 'e' || e.key === 'E') _onSkill?.(1);
        if (e.key === 'r' || e.key === 'R') _onSkill?.(2);
        if (e.key === 'ArrowLeft')  _onSpectate?.(-1);
        if (e.key === 'ArrowRight') _onSpectate?.(1);
    });

    // 화면 좌우 터치로 관전 전환 (상단 1/4 영역)
    canvas.addEventListener('click', e => {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (y > _viewH * 0.25) return; // 상단 25% 영역만
        if (x < _viewW * 0.2) _onSpectate?.(-1);
        else if (x > _viewW * 0.8) _onSpectate?.(1);
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
