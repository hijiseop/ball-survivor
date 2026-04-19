// client/network.js — Socket.io 클라이언트 래퍼

let _socket = null;
const _handlers = {};

/**
 * Socket.io 서버에 연결하고 이벤트 핸들러를 등록합니다.
 */
export function connect() {
    _socket = io();

    for (const evt of ['welcome', 'state', 'hit', 'kill', 'playerJoin', 'playerLeave', 'disconnect', 'roomFull']) {
        _socket.on(evt, data => _handlers[evt]?.(data));
    }
}

/**
 * join 이벤트 전송 (게임 입장)
 * 서버가 세션에서 캐릭터 정보를 읽으므로 페이로드 불필요
 */
export function join() {
    _socket?.emit('join');
}

/**
 * input 이벤트 전송 (마우스 타겟 월드 좌표)
 * @param {number} targetX
 * @param {number} targetY
 */
export function sendInput(targetX, targetY) {
    if (_socket?.connected) {
        _socket.emit('input', { targetX, targetY });
    }
}

/**
 * 이벤트 핸들러 등록
 * @param {string} event - 'welcome' | 'state' | 'hit' | 'kill' | 'playerJoin' | 'playerLeave' | 'disconnect'
 * @param {Function} handler
 */
export function on(event, handler) {
    _handlers[event] = handler;
}
