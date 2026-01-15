// Background Service Worker에서 타이머 관리

let timerState = {
    isRunning: false,
    startTime: null,
    elapsedTime: 0
};

// 타이머 상태를 storage에 저장
function saveTimerState() {
    chrome.storage.local.set({ timerState: timerState });
}

// 타이머 상태를 storage에서 불러오기
function loadTimerState() {
    chrome.storage.local.get(['timerState'], function(result) {
        if (result.timerState) {
            const savedState = result.timerState;
            // 타이머가 실행 중이었다면 경과 시간 재계산
            if (savedState.isRunning && savedState.startTime) {
                // Service Worker가 비활성화된 동안 경과한 시간 계산
                const pausedDuration = Date.now() - savedState.startTime;
                timerState = {
                    isRunning: true,
                    startTime: Date.now(),
                    elapsedTime: savedState.elapsedTime + pausedDuration
                };
            } else {
                timerState = savedState;
            }
            saveTimerState();
        }
    });
}

// 타이머 시작
function startTimer() {
    if (!timerState.isRunning) {
        timerState.isRunning = true;
        timerState.startTime = Date.now();
        saveTimerState();
    }
}

// 타이머 일시정지
function pauseTimer() {
    if (timerState.isRunning) {
        timerState.isRunning = false;
        if (timerState.startTime !== null) {
            timerState.elapsedTime += Date.now() - timerState.startTime;
            timerState.startTime = null;
        }
        saveTimerState();
    }
}

// 타이머 리셋
function resetTimer() {
    timerState.isRunning = false;
    timerState.startTime = null;
    timerState.elapsedTime = 0;
    saveTimerState();
}

// 타이머를 특정 시간으로 설정
function setTimer(seconds) {
    timerState.isRunning = false;
    timerState.startTime = null;
    timerState.elapsedTime = seconds * 1000; // 밀리초로 변환
    saveTimerState();
}

// 현재 경과 시간 계산
function getCurrentElapsedTime() {
    if (timerState.isRunning && timerState.startTime !== null) {
        return Date.now() - timerState.startTime + timerState.elapsedTime;
    }
    return timerState.elapsedTime;
}

// 시간을 0:00:00 형식으로 포맷팅 (시간은 한 자리)
function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startTimer':
            startTimer();
            sendResponse({ success: true, state: timerState });
            break;
            
        case 'pauseTimer':
            pauseTimer();
            sendResponse({ success: true, state: timerState });
            break;
            
        case 'resetTimer':
            resetTimer();
            sendResponse({ success: true, state: timerState });
            break;
            
        case 'setTimer':
            if (request.seconds !== undefined) {
                setTimer(request.seconds);
                sendResponse({ success: true, state: timerState });
            } else {
                sendResponse({ success: false, error: 'seconds parameter required' });
            }
            break;
            
        case 'getTimerState':
            sendResponse({ 
                success: true, 
                state: timerState,
                currentTime: formatTime(getCurrentElapsedTime())
            });
            break;
            
        case 'getCurrentTime':
            sendResponse({ 
                success: true, 
                currentTime: formatTime(getCurrentElapsedTime())
            });
            break;
    }
    return true; // 비동기 응답을 위해
});

// 주기적으로 타이머 상태 업데이트 (1초마다)
setInterval(function() {
    if (timerState.isRunning) {
        saveTimerState();
    }
}, 1000);

// 확장 프로그램 시작/재시작 시 상태 불러오기
loadTimerState();

// 확장 프로그램 설치 시
chrome.runtime.onInstalled.addListener(function() {
    loadTimerState();
});

// Chrome 시작 시 (Service Worker 재시작)
chrome.runtime.onStartup.addListener(function() {
    loadTimerState();
});

