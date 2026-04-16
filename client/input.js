// client/input.js — 마우스 입력 → 월드 좌표 변환

let _screenX = 0;
let _screenY = 0;
let _viewW = 0;
let _viewH = 0;

/**
 * 캔버스에 마우스 이벤트 리스너를 등록합니다.
 * @param {HTMLCanvasElement} canvas
 */
export function init(canvas) {
    _viewW = canvas.width;
    _viewH = canvas.height;

    // 초기 타겟을 캔버스 중앙으로 설정
    _screenX = _viewW / 2;
    _screenY = _viewH / 2;

    canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        _screenX = Math.max(0, Math.min(e.clientX - r.left, _viewW));
        _screenY = Math.max(0, Math.min(e.clientY - r.top, _viewH));
    });
}

/**
 * 현재 마우스의 월드 좌표를 반환합니다.
 * @param {number} camX - 현재 카메라 X (월드 좌표)
 * @param {number} camY - 현재 카메라 Y (월드 좌표)
 * @param {number} zoom - 줌 배율
 * @returns {{ x: number, y: number }}
 */
export function getWorldTarget(camX, camY, zoom) {
    return {
        x: _screenX / zoom + camX,
        y: _screenY / zoom + camY,
    };
}
