// Chrome storage API가 준비될 때까지 대기하는 함수
function waitForChromeStorage(callback, maxRetries = 50) {
    let retryCount = 0;
    
    function check() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            callback();
        } else if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(check, 50);
        }
    }
    
    check();
}

// 저장 내역 토글 기능
document.addEventListener('DOMContentLoaded', function() {
    // Chrome storage가 준비될 때까지 대기 후 초기화
    waitForChromeStorage(function() {
        initializeApp();
    });
});

// 앱 초기화 함수
function initializeApp() {
    const historyToggle = document.getElementById('historyToggle');
    const historyContent = document.getElementById('historyContent');
    
    // 초기 상태: 접힘
    historyContent.classList.add('collapsed');
    historyToggle.classList.add('collapsed');
    
    // 토글 클릭 이벤트
    historyToggle.addEventListener('click', function() {
        historyContent.classList.toggle('collapsed');
        historyToggle.classList.toggle('collapsed');
    });
    
    // 타이머 관련 변수
    const timerDisplay = document.querySelector('.timer-display');
    const startPauseBtn = document.getElementById('startPauseBtn');
    const btnIcon = startPauseBtn.querySelector('.btn-icon');
    
    let timerInterval = null;
    let resumeEntry = null; // 재개 중인 항목 정보
    
    // 재생 정보를 storage에 저장
    function saveResumeInfo() {
        if (!isStorageAvailable()) {
            return;
        }
        if (resumeEntry !== null) {
            const resumeInfo = {
                entry: resumeEntry
            };
            chrome.storage.local.set({ resumeInfo: JSON.stringify(resumeInfo) }, function() {
                if (chrome.runtime.lastError) {
                    console.error('재생 정보 저장 실패:', chrome.runtime.lastError);
                }
            });
        }
    }
    
    // 재생 정보를 storage에서 불러오기
    function loadResumeInfo() {
        if (!isStorageAvailable()) {
            return;
        }
        chrome.storage.local.get(['resumeInfo'], function(result) {
            if (chrome.runtime.lastError) {
                return;
            }
            if (result.resumeInfo) {
                try {
                    const resumeInfo = JSON.parse(result.resumeInfo);
                    resumeEntry = resumeInfo.entry;
                    
                    // 타이머가 실행 중이면 active 클래스 복원
                    chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
                        if (response && response.success && response.state.isRunning && resumeEntry) {
                            // history-play 상태 설정
                            const timerControlArea = document.querySelector('.timer-control-area');
                            if (timerControlArea) {
                                timerControlArea.classList.add('playing-history');
                            }
                            
                            // 히스토리 로드 후 active 클래스 복원
                            setTimeout(function() {
                                const allHistoryItems = document.querySelectorAll('.history-item');
                                allHistoryItems.forEach(function(item) {
                                    const playBtn = item.querySelector('.history-play-btn');
                                    if (playBtn) {
                                        const timestamp = playBtn.getAttribute('data-timestamp');
                                        if (timestamp && (resumeEntry.endTime || resumeEntry.timestamp) == timestamp) {
                                            item.classList.add('active');
                                        }
                                    }
                                });
                            }, 100);
                        }
                    });
                } catch (e) {
                    console.error('재생 정보 복원 실패:', e);
                }
            }
        });
    }
    
    // 재생 정보 삭제
    function clearResumeInfo() {
        resumeEntry = null;
        if (isStorageAvailable()) {
            chrome.storage.local.remove(['resumeInfo']);
        }
        // history-play 상태 해제
        const timerControlArea = document.querySelector('.timer-control-area');
        if (timerControlArea) {
            timerControlArea.classList.remove('playing-history');
        }
    }
    
    // Background에서 타이머 상태 가져오기
    function getTimerState() {
        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
            if (response && response.success) {
                updateUI(response.state, response.currentTime);
            }
        });
    }
    
    // UI 업데이트
    function updateUI(state, currentTime) {
        const timerControlArea = document.querySelector('.timer-control-area');
        if (state.isRunning) {
            startPauseBtn.classList.add('paused');
            btnIcon.src = 'images/icons8-pause-20.png';
            btnIcon.alt = 'pause';
            // 타이머가 실행 중이면 주기적 업데이트 시작
            startTimerDisplayUpdate();
            // 타이머 실행 중 클래스 추가
            if (timerControlArea) {
                timerControlArea.classList.add('timer-running');
            }
        } else {
            startPauseBtn.classList.remove('paused');
            btnIcon.src = 'images/icons8-play-20.png';
            btnIcon.alt = 'play';
            // 타이머가 멈춰있으면 업데이트 중지
            stopTimerDisplayUpdate();
            // 타이머 실행 중 클래스 제거
            if (timerControlArea) {
                timerControlArea.classList.remove('timer-running');
            }
        }
        timerDisplay.textContent = currentTime || '0:00:00';
    }
    
    // 타이머 표시 업데이트 (주기적으로 background에서 시간 가져오기)
    function startTimerDisplayUpdate() {
        // 기존 인터벌 정리
        if (timerInterval !== null) {
            clearInterval(timerInterval);
        }
        
        // 100ms마다 background에서 현재 시간 가져오기
        timerInterval = setInterval(function() {
            chrome.runtime.sendMessage({ action: 'getCurrentTime' }, function(response) {
                if (response && response.success) {
                    timerDisplay.textContent = response.currentTime;
                }
            });
        }, 100);
    }
    
    // 타이머 표시 업데이트 중지
    function stopTimerDisplayUpdate() {
        if (timerInterval !== null) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
    // 시간 문자열(HH:MM:SS)을 초로 변환
    function timeStringToSeconds(timeStr) {
        const parts = timeStr.split(':');
        let hours = 0, minutes = 0, seconds = 0;
        
        if (parts.length === 3) {
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
            seconds = parseInt(parts[2], 10) || 0;
        } else if (parts.length === 2) {
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
        }
        
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    // 초를 시간 문자열(HH:MM:SS)로 변환
    function secondsToTimeString(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // 타임스탬프를 날짜 키(yy.mm.dd) 형식으로 변환
    function formatDateKey(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
    }
    
    // Chrome Storage API 사용 가능 여부 확인
    function isStorageAvailable() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    }
    
    // 히스토리 데이터 가져오기
    function getHistory(callback) {
        if (!isStorageAvailable()) {
            if (callback) callback([]);
            return;
        }
        chrome.storage.local.get(['timerHistory'], function(result) {
            if (chrome.runtime.lastError) {
                if (callback) callback([]);
                return;
            }
            let history = [];
            if (result.timerHistory) {
                try {
                    history = JSON.parse(result.timerHistory);
                } catch (e) {
                    history = [];
                }
            }
            if (callback) callback(history);
        });
    }
    
    // 히스토리 데이터 저장하기
    function saveHistory(history, callback) {
        if (!isStorageAvailable()) {
            if (callback) callback(false);
            return;
        }
        chrome.storage.local.set({ timerHistory: JSON.stringify(history) }, function() {
            if (chrome.runtime.lastError) {
                if (callback) callback(false);
                return;
            }
            if (callback) callback(true);
        });
    }
    
    // 재생 정보를 불러와서 완료 처리 실행
    function loadResumeInfoAndProcess(currentTime, title, timerStateResponse, onCompleteCallback) {
        // 재생 정보가 없으면 storage에서 불러오기 시도
        if (resumeEntry === null) {
            chrome.storage.local.get(['resumeInfo'], function(resumeResult) {
                if (resumeResult.resumeInfo) {
                    try {
                        const resumeInfo = JSON.parse(resumeResult.resumeInfo);
                        resumeEntry = resumeInfo.entry;
                        // 재생 정보를 불러온 후 완료 처리 계속
                        processComplete(currentTime, title, timerStateResponse, onCompleteCallback);
                    } catch (e) {
                        console.error('재생 정보 불러오기 실패:', e);
                        processComplete(currentTime, title, timerStateResponse, onCompleteCallback);
                    }
                } else {
                    processComplete(currentTime, title, timerStateResponse, onCompleteCallback);
                }
            });
            return;
        }
        
        // 재생 정보가 있으면 바로 완료 처리
        processComplete(currentTime, title, timerStateResponse, onCompleteCallback);
    }
    
    // 타이머 리셋 및 UI 업데이트
    function resetTimerAndUI(shouldClearResumeEntry, onCompleteCallback, shouldAutoStart) {
        chrome.runtime.sendMessage({ action: 'resetTimer' }, function(response) {
            if (response && response.success) {
                startPauseBtn.classList.remove('paused');
                btnIcon.src = 'images/icons8-play-20.png';
                btnIcon.alt = 'play';
                timerDisplay.textContent = '0:00:00';
                
                if (timerInterval !== null) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                
                // 타이머 실행 중 클래스 제거
                const timerControlArea = document.querySelector('.timer-control-area');
                if (timerControlArea) {
                    timerControlArea.classList.remove('timer-running');
                }
                
                // 재개 정보 초기화 (일반적인 경우에만)
                if (shouldClearResumeEntry) {
                    resumeEntry = null;
                    
                    // active 클래스 제거
                    const allHistoryItems = document.querySelectorAll('.history-item');
                    allHistoryItems.forEach(item => item.classList.remove('active'));
                }
                
                // title 입력 필드 초기화 및 저장
                titleInput.value = '';
                chrome.storage.local.set({ currentTitle: '' }, function() {
                    if (chrome.runtime.lastError) {
                        console.error('title 초기화 실패:', chrome.runtime.lastError);
                    }
                });
                
                // memo 입력 필드 초기화 및 저장
                memoInput.value = '';
                chrome.storage.local.set({ currentMemo: '' }, function() {
                    if (chrome.runtime.lastError) {
                        console.error('memo 초기화 실패:', chrome.runtime.lastError);
                    }
                });
                
                // 저장 내역 새로고침
                loadHistory();
                
                // 저장 내역 펼치기
                historyContent.classList.remove('collapsed');
                historyToggle.classList.remove('collapsed');
                
                // 콜백이 있으면 실행 (자동 시작 대신)
                if (onCompleteCallback) {
                    onCompleteCallback();
                } else if (shouldAutoStart) {
                    // 콜백이 없으면 기존대로 자동 시작
                    startTimer();
                }
            }
        });
    }
    
    // 시간 문자열을 HH:MM:SS 형식으로 변환
    function formatTimeToHHMMSS(timeStr) {
        // 이미 HH:MM:SS 형식이면 그대로 반환
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
            return timeStr;
        }
        // HH:MM 형식이면 :00 추가
        if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
            return timeStr + ':00';
        }
        // 분 단위 숫자면 HH:MM:SS로 변환
        const minutes = parseInt(timeStr, 10);
        if (!isNaN(minutes)) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours}:${String(mins).padStart(2, '0')}:00`;
        }
        // 기본값
        return '0:00:00';
    }
    
    // 타이머 시작
    function startTimer() {
        chrome.runtime.sendMessage({ action: 'startTimer' }, function(response) {
            if (response && response.success) {
                // 재개 중인 경우 처리 (일시정지 후 재시작 시에는 시간 기록에 영향 없음)
                if (resumeEntry === null) {
                    // 저장되지 않은 내역을 처음 플레이할 때 히스토리 항목 생성
                    const title = titleInput.value; // trim 없이 그대로 사용
                    const timestamp = Date.now();
                    
                    // 히스토리 항목 생성
                    const memo = memoInput.value;
                    const newEntry = {
                        title: title || '',
                        memo: memo || '',
                        time: '0:00:00',
                        timestamp: timestamp,
                        completed: false
                    };
                    
                    // resumeEntry 설정 (active 클래스 추가를 위해)
                    resumeEntry = {
                        ...newEntry,
                        endTime: timestamp // timestamp로 식별하기 위해
                    };
                    
                    // 재생 정보 저장
                    saveResumeInfo();
                    
                    // history-play 상태 설정
                    const timerControlArea = document.querySelector('.timer-control-area');
                    if (timerControlArea) {
                        timerControlArea.classList.add('playing-history');
                    }
                    
                    // 스토리지에서 기존 내역 가져오기
                    getHistory(function(history) {
                        // 새 항목 추가
                        history.push(newEntry);
                        
                        // 스토리지에 저장
                        saveHistory(history, function(success) {
                            if (success) {
                                // 히스토리 목록 새로고침
                                loadHistory();
                            }
                        });
                    });
                }
                startPauseBtn.classList.add('paused');
                btnIcon.src = 'images/icons8-pause-20.png';
                btnIcon.alt = 'pause';
                startTimerDisplayUpdate();
                // 타이머 실행 중 클래스 추가
                const timerControlArea = document.querySelector('.timer-control-area');
                if (timerControlArea) {
                    timerControlArea.classList.add('timer-running');
                }
            }
        });
    }
    
    // 타이머 일시정지
    function pauseTimer() {
        chrome.runtime.sendMessage({ action: 'pauseTimer' }, function(response) {
            if (response && response.success) {
                startPauseBtn.classList.remove('paused');
                btnIcon.src = 'images/icons8-play-20.png';
                btnIcon.alt = 'play';
                stopTimerDisplayUpdate();
                // 타이머 실행 중 클래스 제거
                const timerControlArea = document.querySelector('.timer-control-area');
                if (timerControlArea) {
                    timerControlArea.classList.remove('timer-running');
                }
                // 최종 시간 표시 업데이트
                chrome.runtime.sendMessage({ action: 'getCurrentTime' }, function(response) {
                    if (response && response.success) {
                        timerDisplay.textContent = response.currentTime;
                    }
                });
            }
        });
    }
    
    // 시작/일시정지 버튼 클릭 이벤트
    startPauseBtn.addEventListener('click', function() {
        // 현재 상태 확인 후 토글
        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
            if (response && response.success) {
                if (response.state.isRunning) {
                    pauseTimer();
                } else {
                    startTimer();
                }
            }
        });
    });
    
    // 재생 정보 복원
    loadResumeInfo();
    
    // 초기 상태 로드 및 UI 업데이트
    getTimerState();
    
    // popup이 닫힐 때 인터벌 정리 및 title 저장
    window.addEventListener('beforeunload', function() {
        stopTimerDisplayUpdate();
        // 팝업이 닫히기 전에 title 저장 (동기적으로 처리)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const title = titleInput.value;
            chrome.storage.local.set({ currentTitle: title });
        }
    });
    
    // 완료 버튼 클릭 이벤트
    const completeBtn = document.getElementById('completeBtn');
    const titleInput = document.getElementById('titleInput');
    const memoInput = document.getElementById('memoInput');
    const autoStartCheckbox = document.getElementById('autoStartCheckbox');
    
    // title 저장 함수
    function saveTitle() {
        if (!isStorageAvailable()) {
            return;
        }
        // trim() 제거하여 마지막 글자와 공백도 유지
        const title = titleInput.value;
        chrome.storage.local.set({ currentTitle: title }, function() {
            if (chrome.runtime.lastError) {
                console.error('title 저장 실패:', chrome.runtime.lastError);
            }
        });
    }
    
    // title 불러오기 함수
    function loadTitle() {
        if (!isStorageAvailable()) {
            return;
        }
        chrome.storage.local.get(['currentTitle'], function(result) {
            if (chrome.runtime.lastError) {
                return;
            }
            if (result.currentTitle) {
                titleInput.value = result.currentTitle;
            }
        });
    }
    
    // memo 저장 함수
    function saveMemo() {
        if (!isStorageAvailable()) {
            return;
        }
        const memo = memoInput.value;
        chrome.storage.local.set({ currentMemo: memo }, function() {
            if (chrome.runtime.lastError) {
                console.error('memo 저장 실패:', chrome.runtime.lastError);
            }
        });
    }
    
    // memo 불러오기 함수
    function loadMemo() {
        if (!isStorageAvailable()) {
            return;
        }
        chrome.storage.local.get(['currentMemo'], function(result) {
            if (chrome.runtime.lastError) {
                return;
            }
            if (result.currentMemo) {
                memoInput.value = result.currentMemo;
            }
        });
    }
    
    // 타이틀을 저장 내역에 반영하는 함수
    function updateTitleInHistory() {
        if (!isStorageAvailable()) {
            return;
        }
        
        const title = titleInput.value.trim();
        
        // 현재 타이머 상태 확인
        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
            if (!response || !response.success) {
                return;
            }
            
            const isRunning = response.state.isRunning;
            
            // 타이머가 실행 중이고 재생 중인 항목이 있는 경우
            if (isRunning && resumeEntry !== null) {
                getHistory(function(history) {
                    // 재생 중인 항목 찾아서 타이틀 업데이트
                    const entryTimestamp = resumeEntry.endTime || resumeEntry.timestamp;
                    let found = false;
                    history = history.map(function(entry) {
                        if ((entry.endTime || entry.timestamp) === entryTimestamp) {
                            found = true;
                            return {
                                ...entry,
                                title: title || ''
                            };
                        }
                        return entry;
                    });
                    
                    if (found) {
                        // 재생 정보도 업데이트
                        resumeEntry.title = title || '';
                        saveResumeInfo();
                        
                        // 스토리지에 저장
                        saveHistory(history, function(success) {
                            if (success) {
                                loadHistory();
                            }
                        });
                    }
                });
            } else if (isRunning) {
                // 타이머가 실행 중이지만 재생 중인 항목이 없는 경우
                // 현재 시간과 함께 새 항목 생성
                const currentTime = timerDisplay.textContent;
                const timestamp = Date.now();
                
                getHistory(function(history) {
                    // 새 항목 생성
                    const memo = memoInput.value;
                    const newEntry = {
                        title: title || '',
                        memo: memo || '',
                        time: currentTime,
                        timestamp: timestamp,
                        completed: false
                    };
                    
                    // resumeEntry 설정
                    resumeEntry = {
                        ...newEntry,
                        endTime: timestamp
                    };
                    
                    saveResumeInfo();
                    
                    // 새 항목 추가
                    history.push(newEntry);
                    
                    // 스토리지에 저장
                    saveHistory(history, function(success) {
                        if (success) {
                            loadHistory();
                        }
                    });
                });
            } else {
                // 타이머가 실행 중이 아닌 경우, 새 항목 생성 (시간은 0:00:00)
                const timestamp = Date.now();
                
                getHistory(function(history) {
                    // 새 항목 생성
                    const memo = memoInput.value;
                    const newEntry = {
                        title: title || '',
                        memo: memo || '',
                        time: '0:00:00',
                        timestamp: timestamp,
                        completed: false
                    };
                    
                    // 새 항목을 맨 위에 추가
                    history.unshift(newEntry);
                    
                    // 스토리지에 저장
                    saveHistory(history, function(success) {
                        if (success) {
                            loadHistory();
                        }
                    });
                });
            }
        });
    }
    
    // 메모를 저장 내역에 반영하는 함수
    function updateMemoInHistory() {
        if (!isStorageAvailable()) {
            return;
        }
        
        const memo = memoInput.value;
        
        // 현재 타이머 상태 확인
        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
            if (!response || !response.success) {
                return;
            }
            
            const isRunning = response.state.isRunning;
            
            // 타이머가 실행 중이고 재생 중인 항목이 있는 경우
            if (isRunning && resumeEntry !== null) {
                getHistory(function(history) {
                    // 재생 중인 항목 찾아서 메모 업데이트
                    const entryTimestamp = resumeEntry.endTime || resumeEntry.timestamp;
                    let found = false;
                    history = history.map(function(entry) {
                        if ((entry.endTime || entry.timestamp) === entryTimestamp) {
                            found = true;
                            return {
                                ...entry,
                                memo: memo || ''
                            };
                        }
                        return entry;
                    });
                    
                    if (found) {
                        // 재생 정보도 업데이트
                        resumeEntry.memo = memo || '';
                        saveResumeInfo();
                        
                        // 스토리지에 저장
                        saveHistory(history, function(success) {
                            if (success) {
                                loadHistory();
                            }
                        });
                    }
                });
            } else if (isRunning) {
                // 타이머가 실행 중이지만 재생 중인 항목이 없는 경우
                // 현재 시간과 함께 새 항목 생성
                const currentTime = timerDisplay.textContent;
                const timestamp = Date.now();
                const title = titleInput.value.trim();
                
                getHistory(function(history) {
                    // 새 항목 생성
                    const newEntry = {
                        title: title || '',
                        memo: memo || '',
                        time: currentTime,
                        timestamp: timestamp,
                        completed: false
                    };
                    
                    // resumeEntry 설정
                    resumeEntry = {
                        ...newEntry,
                        endTime: timestamp
                    };
                    
                    saveResumeInfo();
                    
                    // 새 항목 추가
                    history.push(newEntry);
                    
                    // 스토리지에 저장
                    saveHistory(history, function(success) {
                        if (success) {
                            loadHistory();
                        }
                    });
                });
            } else {
                // 타이머가 실행 중이 아닌 경우, 새 항목 생성 (시간은 0:00:00)
                const timestamp = Date.now();
                const title = titleInput.value.trim();
                
                getHistory(function(history) {
                    // 새 항목 생성
                    const newEntry = {
                        title: title || '',
                        memo: memo || '',
                        time: '0:00:00',
                        timestamp: timestamp,
                        completed: false
                    };
                    
                    // 새 항목을 맨 위에 추가
                    history.unshift(newEntry);
                    
                    // 스토리지에 저장
                    saveHistory(history, function(success) {
                        if (success) {
                            loadHistory();
                        }
                    });
                });
            }
        });
    }
    
    // title 입력 시 자동 저장
    titleInput.addEventListener('input', function() {
        saveTitle();
    });
    
    // Enter 키 입력 시 포커스 제거
    titleInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleInput.blur(); // 포커스 제거
        }
    });
    
    // 포커스를 잃을 때도 title 저장
    titleInput.addEventListener('blur', function() {
        saveTitle();
    });
    
    // memo 입력 시 자동 저장
    memoInput.addEventListener('input', function() {
        saveMemo();
    });
    
    // 포커스를 잃을 때도 memo 저장
    memoInput.addEventListener('blur', function() {
        saveMemo();
    });
    
    // 팝업 열릴 때 title과 memo 불러오기
    loadTitle();
    loadMemo();
    
    // 체크박스 상태 저장 함수
    function saveAutoStartState() {
        if (!isStorageAvailable()) {
            return;
        }
        const isChecked = autoStartCheckbox.checked;
        chrome.storage.local.set({ autoStartEnabled: isChecked }, function() {
            if (chrome.runtime.lastError) {
                console.error('자동시작 설정 저장 실패:', chrome.runtime.lastError);
            }
        });
    }
    
    // 체크박스 상태 불러오기 함수
    function loadAutoStartState() {
        if (!isStorageAvailable()) {
            return;
        }
        chrome.storage.local.get(['autoStartEnabled'], function(result) {
            if (chrome.runtime.lastError) {
                return;
            }
            if (result.autoStartEnabled !== undefined) {
                autoStartCheckbox.checked = result.autoStartEnabled;
            }
        });
    }
    
    // 체크박스 변경 시 상태 저장
    autoStartCheckbox.addEventListener('change', function() {
        saveAutoStartState();
    });
    
    // 팝업 열릴 때 체크박스 상태 불러오기
    loadAutoStartState();
    
    completeBtn.addEventListener('click', function() {
        // 현재 타이머 시간 가져오기
        const currentTime = timerDisplay.textContent;
        const title = titleInput.value.trim();
        const memo = memoInput.value;
        
        // chrome.storage API 확인
        if (!isStorageAvailable()) {
            alert('저장 기능을 사용할 수 없습니다.\n확장 프로그램을 다시 로드해주세요.');
            return;
        }
        
        // background에서 세션 시작 시간 먼저 가져오기
        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
            if (!response || !response.success) {
                alert('타이머 상태를 가져오는 중 오류가 발생했습니다.');
                return;
            }
            
            const endTime = new Date();
            
            loadResumeInfoAndProcess(currentTime, title, response);
        });
    });
    
    // 재개 중인 경우 완료 처리
    function processCompleteResume(currentTime, title, onCompleteCallback) {
        const endTime = new Date();
        const memo = memoInput.value;
        // 타이머에 표시된 시간 그대로 사용 (이미 기존 누적시간이 포함되어 있음)
        const totalTime = currentTime;
        
        // 스토리지에서 기존 내역 가져오기
        getHistory(function(history) {
            // 기존 항목 찾아서 업데이트
            const entryTimestamp = resumeEntry.endTime || resumeEntry.timestamp;
            let found = false;
            history = history.map(function(entry) {
                if ((entry.endTime || entry.timestamp) === entryTimestamp) {
                    found = true;
                    return {
                        ...entry,
                        title: title || resumeEntry.title || '',
                        memo: memo || entry.memo || '',
                        time: totalTime,
                        lastModified: endTime.getTime()
                    };
                }
                return entry;
            });
            
            if (!found) {
                // 항목을 찾지 못한 경우 새로 추가
                const updatedEntry = {
                    title: title || resumeEntry.title || '',
                    memo: memo || '',
                    time: totalTime,
                    timestamp: endTime.getTime(),
                    completed: false,
                    lastModified: endTime.getTime()
                };
                history.push(updatedEntry);
            }
            
            // 완료된 항목 찾기 및 위치 조정
            const completedEntryTimestamp = entryTimestamp;
            const completedEntry = history.find(function(entry) {
                return (entry.endTime || entry.timestamp) === completedEntryTimestamp;
            });
            
            if (completedEntry) {
                // 완료된 항목에 최종수정일자 업데이트
                completedEntry.lastModified = endTime.getTime();
            }
            
            // 재개 정보 초기화 및 삭제
            clearResumeInfo();
            
            // active 클래스 제거
            const allHistoryItems = document.querySelectorAll('.history-item');
            allHistoryItems.forEach(item => item.classList.remove('active'));
            
            // 스토리지에 저장
            saveHistory(history, function(success) {
                if (!success) {
                    alert('데이터 저장에 실패했습니다.');
                    return;
                }
                
                // 체크박스 상태 확인
                const shouldAutoStart = autoStartCheckbox.checked;
                
                // 저장 성공 시 타이머 리셋
                resetTimerAndUI(false, onCompleteCallback, shouldAutoStart);
            });
        });
    }
    
    // 일반적인 경우 완료 처리
    function processCompleteNormal(currentTime, title, onCompleteCallback) {
        const endTime = new Date();
        const memo = memoInput.value;
        
        // 스토리지에서 기존 내역 가져오기
        getHistory(function(history) {
            // resumeEntry가 있고 시간이 '0:00:00'인 항목이 있으면 업데이트, 없으면 새로 추가
            let found = false;
            if (resumeEntry !== null) {
                const entryTimestamp = resumeEntry.endTime || resumeEntry.timestamp;
                history = history.map(function(entry) {
                    if ((entry.endTime || entry.timestamp) === entryTimestamp && entry.time === '0:00:00') {
                        found = true;
                        return {
                            ...entry,
                            title: title || '',
                            memo: memo || '',
                            time: currentTime,
                            lastModified: endTime.getTime()
                        };
                    }
                    return entry;
                });
            }
            
            if (!found) {
                // 새 항목 추가
                const newEntry = { 
                    title: title || '', 
                    memo: memo || '',
                    time: currentTime,
                    timestamp: endTime.getTime(),
                    completed: false,
                    lastModified: endTime.getTime()
                };
                
                history.push(newEntry);
            } else {
                // 업데이트된 항목을 맨 위로 이동
                const entryTimestamp = resumeEntry.endTime || resumeEntry.timestamp;
                const updatedEntry = history.find(function(entry) {
                    return (entry.endTime || entry.timestamp) === entryTimestamp;
                });
                
                if (updatedEntry) {
                    // 최종수정일자 업데이트
                    updatedEntry.lastModified = endTime.getTime();
                }
            }
            
            // 스토리지에 저장
            saveHistory(history, function(success) {
                if (!success) {
                    alert('데이터 저장에 실패했습니다.');
                    return;
                }
                
                // 체크박스 상태 확인
                const shouldAutoStart = autoStartCheckbox.checked;
                
                // 저장 성공 시 타이머 리셋
                resetTimerAndUI(true, onCompleteCallback, shouldAutoStart);
            });
        });
    }
    
    // 완료 처리 함수 (라우터)
    function processComplete(currentTime, title, timerStateResponse, onCompleteCallback) {
        // 재개 중인 경우 처리
        if (resumeEntry !== null) {
            processCompleteResume(currentTime, title, onCompleteCallback);
            return;
        }
        
        // 일반적인 경우 처리
        processCompleteNormal(currentTime, title, onCompleteCallback);
    }
    
    // history 재생 함수 (별도 함수로 분리)
    function playHistoryEntry(entry, historyItem) {
        // 해당 항목을 storage에서 맨 위로 이동
        const entryTimestamp = entry.endTime || entry.timestamp;
        getHistory(function(history) {
            // 해당 항목 찾기
            const itemIndex = history.findIndex(function(item) {
                return (item.endTime || item.timestamp) === entryTimestamp;
            });
            
            if (itemIndex !== -1) {
                // 해당 항목을 배열에서 제거하고 맨 앞에 추가
                const item = history.splice(itemIndex, 1)[0];
                history.push(item);
                
                // storage에 저장
                saveHistory(history, function(success) {
                    if (success) {
                        // 히스토리 목록 새로고침
                        loadHistory();
                    }
                });
            }
        });
        
        // 재개할 항목 정보 저장
        resumeEntry = entry;
        
        // 모든 항목의 active 클래스 제거
        const allHistoryItems = document.querySelectorAll('.history-item');
        allHistoryItems.forEach(item => item.classList.remove('active'));
        
        // 현재 항목에 active 클래스 추가
        historyItem.classList.add('active');
        
        // history-play 상태 설정
        const timerControlArea = document.querySelector('.timer-control-area');
        if (timerControlArea) {
            timerControlArea.classList.add('playing-history');
        }
        
        // 재생 정보 저장
        saveResumeInfo();
        
        // title 입력 필드에 title 설정
        titleInput.value = entry.title || '';
        saveTitle();
        
        // memo 입력 필드에 memo 설정
        memoInput.value = entry.memo || '';
        saveMemo();
        
        // 기존 누적시간을 초로 변환하여 타이머 설정
        const accumulatedSeconds = timeStringToSeconds(entry.time);
        chrome.runtime.sendMessage({ 
            action: 'setTimer', 
            seconds: accumulatedSeconds 
        }, function(setResponse) {
            if (setResponse && setResponse.success) {
                // 타이머 표시 업데이트
                chrome.runtime.sendMessage({ action: 'getCurrentTime' }, function(timeResponse) {
                    if (timeResponse && timeResponse.success) {
                        timerDisplay.textContent = timeResponse.currentTime;
                    }
                });
                // 타이머 시작
                startTimer();
            }
        });
    }
    
    // 분단위 환산 체크박스 상태 저장 함수
    function saveMinuteDisplayState() {
        if (!isStorageAvailable()) {
            return;
        }
        const minuteCheckbox = document.getElementById('minuteDisplayCheckbox');
        if (minuteCheckbox) {
            const isChecked = minuteCheckbox.checked;
            chrome.storage.local.set({ minuteDisplayEnabled: isChecked }, function() {
                if (chrome.runtime.lastError) {
                    console.error('분단위 환산 설정 저장 실패:', chrome.runtime.lastError);
                }
            });
        }
    }
    
    // 분단위 환산 체크박스 상태 불러오기 함수
    function loadMinuteDisplayState(callback) {
        if (!isStorageAvailable()) {
            if (callback) callback(false);
            return;
        }
        chrome.storage.local.get(['minuteDisplayEnabled'], function(result) {
            if (chrome.runtime.lastError) {
                if (callback) callback(false);
                return;
            }
            const isEnabled = result.minuteDisplayEnabled !== undefined ? result.minuteDisplayEnabled : false;
            if (callback) callback(isEnabled);
        });
    }
    
    // 시간 표시 형식 변환 함수
    function formatTimeDisplay(timeStr, showMinutes) {
        if (showMinutes) {
            const minutes = Math.floor(timeStringToSeconds(timeStr) / 60);
            return `${minutes}분`;
        } else {
            return timeStr;
        }
    }
    
    // 저장된 내역 불러오기 함수
    function loadHistory(restoreTimestamp, focusTimestamp) {
        if (!isStorageAvailable()) {
            return;
        }
        
        getHistory(function(history) {
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            
            // 최종수정일자 기준으로 정렬 (최신순)
            const sortedHistory = history.slice().sort(function(a, b) {
                const aLastModified = a.lastModified || a.endTime || a.timestamp || 0;
                const bLastModified = b.lastModified || b.endTime || b.timestamp || 0;
                return bLastModified - aLastModified; // 내림차순 (최신순)
            });
            
            // 완료 여부에 따라 분리 (완료되지 않은 항목 먼저, 완료된 항목 나중에)
            const incompleteItems = sortedHistory.filter(function(entry) {
                return !entry.completed;
            });
            const completedItems = sortedHistory.filter(function(entry) {
                return entry.completed;
            });
            // 완료되지 않은 항목 먼저, 완료된 항목 나중에 배치
            const reorderedHistory = incompleteItems.concat(completedItems);
            
            // active 항목 찾기 (날짜 그룹에서 제외)
            const activeTimestamp = resumeEntry ? (resumeEntry.endTime || resumeEntry.timestamp) : null;
            
                // 날짜별로 그룹화 (active 항목 제외)
                const groupedByDate = {};
                reorderedHistory.forEach(function(entry) {
                    const entryTimestamp = entry.endTime || entry.timestamp;
                    // active 항목은 그룹에서 제외
                    if (activeTimestamp && entryTimestamp === activeTimestamp) {
                        return;
                    }
                    
                    // 날짜 키 생성: yy.mm.dd
                    const dateKey = formatDateKey(entry.endTime || entry.timestamp);
                    
                    if (!groupedByDate[dateKey]) {
                        groupedByDate[dateKey] = [];
                    }
                    groupedByDate[dateKey].push(entry);
                });
                
                // 각 날짜 그룹 내에서 최종수정일자 순으로 정렬 (최신순)
                Object.keys(groupedByDate).forEach(function(dateKey) {
                    groupedByDate[dateKey].sort(function(a, b) {
                        const aLastModified = a.lastModified || a.endTime || a.timestamp || 0;
                        const bLastModified = b.lastModified || b.endTime || b.timestamp || 0;
                        return bLastModified - aLastModified; // 내림차순 (최신순)
                    });
                });
            
            // 분단위 환산 체크박스 상태 불러오기
            loadMinuteDisplayState(function(isMinuteDisplay) {
                // active 항목 찾기
                let activeEntry = null;
                let activeDateKey = null;
                const activeTimestamp = resumeEntry ? (resumeEntry.endTime || resumeEntry.timestamp) : null;
                
                if (activeTimestamp) {
                    reorderedHistory.forEach(function(entry) {
                        const entryTimestamp = entry.endTime || entry.timestamp;
                        if (entryTimestamp === activeTimestamp) {
                            activeEntry = entry;
                        }
                    });
                }
                
                // active 항목의 날짜 키 계산
                if (activeEntry) {
                    activeDateKey = formatDateKey(activeEntry.endTime || activeEntry.timestamp);
                }
                
                // 완료된 항목들 찾기 (active 항목 제외) 및 최종수정일자 순으로 정렬
                const completedEntries = reorderedHistory.filter(function(entry) {
                    const entryTimestamp = entry.endTime || entry.timestamp;
                    // active 항목 제외
                    if (activeTimestamp && entryTimestamp === activeTimestamp) {
                        return false;
                    }
                    // 완료된 항목만
                    return entry.completed === true;
                }).sort(function(a, b) {
                    const aLastModified = a.lastModified || a.endTime || a.timestamp || 0;
                    const bLastModified = b.lastModified || b.endTime || b.timestamp || 0;
                    return bLastModified - aLastModified; // 내림차순 (최신순)
                });
                
                // 완료된 항목들을 날짜별 그룹에서 제외
                completedEntries.forEach(function(completedEntry) {
                    const completedTimestamp = completedEntry.endTime || completedEntry.timestamp;
                    const completedDateKey = formatDateKey(completedTimestamp);
                    if (groupedByDate[completedDateKey]) {
                        groupedByDate[completedDateKey] = groupedByDate[completedDateKey].filter(function(entry) {
                            return (entry.endTime || entry.timestamp) !== completedTimestamp;
                        });
                        if (groupedByDate[completedDateKey].length === 0) {
                            delete groupedByDate[completedDateKey];
                        }
                    }
                });
                
                // 1. Active 항목 먼저 렌더링 (가장 위에)
                if (activeEntry) {
                    
                    // active 항목의 날짜 헤더 추가
                    const activeDateHeader = document.createElement('div');
                    activeDateHeader.className = 'history-date-header';
                    activeDateHeader.innerHTML = `
                        <span class="date-header-text">${activeDateKey}</span>
                        <div class="date-header-checkbox">
                            <input type="checkbox" id="minuteDisplayCheckbox">
                            <label for="minuteDisplayCheckbox">분단위 환산</label>
                        </div>
                    `;
                    
                    const checkbox = activeDateHeader.querySelector('#minuteDisplayCheckbox');
                    checkbox.checked = isMinuteDisplay;
                    
                    checkbox.addEventListener('change', function() {
                        saveMinuteDisplayState();
                        loadHistory();
                    });
                    
                    historyList.appendChild(activeDateHeader);
                    
                    // active 항목 렌더링
                    const activeHistoryItem = document.createElement('div');
                    activeHistoryItem.className = 'history-item active';
                    
                    const activeTitle = activeEntry.title || '(title 없음)';
                    const activeIsCompleted = activeEntry.completed || false;
                    const activeTimestampValue = activeEntry.endTime || activeEntry.timestamp;
                    
                    if (activeIsCompleted) {
                        activeHistoryItem.classList.add('completed');
                    }
                    
                    const activeMemo = activeEntry.memo || '';
                    activeHistoryItem.innerHTML = `
                        <div class="history-drag-handle" draggable="false" data-timestamp="${activeTimestampValue}"></div>
                        <div class="history-buttons">
                            <button class="history-play-btn" data-timestamp="${activeTimestampValue}" data-time="${activeEntry.time}">
                                <img class="history-play-icon" src="images/icons8-play-20.png" alt="play">
                            </button>
                            <button class="history-edit-btn" data-timestamp="${activeTimestampValue}">✎</button>
                            <button class="history-delete-btn" data-timestamp="${activeTimestampValue}">×</button>
                        </div>
                        <div class="history-title-wrapper">
                            <input type="checkbox" class="history-complete-checkbox" data-timestamp="${activeTimestampValue}" ${activeIsCompleted ? 'checked' : ''}>
                            <span class="history-title-text">${activeTitle}</span>
                            <input type="text" class="history-edit-input" value="${activeEntry.title || ''}" placeholder="title를 입력하세요">
                            <textarea class="history-memo-edit-input" placeholder="메모를 입력하세요">${activeMemo}</textarea>
                            <input type="text" class="history-time-edit-input" value="" placeholder="시간 (예: 01:23:45)">
                        </div>
                        <div class="history-memo">${activeMemo}</div>
                        <div class="history-title-time">${formatTimeDisplay(activeEntry.time, isMinuteDisplay)}</div>
                        <div class="history-edit-actions" style="display: none;">
                            <button class="history-save-btn" data-timestamp="${activeTimestampValue}">저장</button>
                            <button class="history-cancel-btn" data-timestamp="${activeTimestampValue}">취소</button>
                        </div>
                    `;
                    
                    // active 항목에 이벤트 리스너 추가 (드래그 제외)
                    const activeCompleteCheckbox = activeHistoryItem.querySelector('.history-complete-checkbox');
                    activeCompleteCheckbox.addEventListener('change', function(e) {
                        e.stopPropagation();
                        const isChecked = activeCompleteCheckbox.checked;
                        updateHistoryItemCompleted(activeTimestampValue, isChecked, activeTimestampValue);
                    });
                    
                    historyList.appendChild(activeHistoryItem);
                    
                    // active 항목의 나머지 이벤트
                    const activePlayBtn = activeHistoryItem.querySelector('.history-play-btn');
                    const activeDeleteBtn = activeHistoryItem.querySelector('.history-delete-btn');
                    const activeEditBtn = activeHistoryItem.querySelector('.history-edit-btn');
                    const activeSaveBtn = activeHistoryItem.querySelector('.history-save-btn');
                    const activeCancelBtn = activeHistoryItem.querySelector('.history-cancel-btn');
                    const activeEditInput = activeHistoryItem.querySelector('.history-edit-input');
                    const activeMemoEditInput = activeHistoryItem.querySelector('.history-memo-edit-input');
                    const activeTimeEditInput = activeHistoryItem.querySelector('.history-time-edit-input');
                    const activeEditActions = activeHistoryItem.querySelector('.history-edit-actions');
                    
                    // 재생 버튼 이벤트
                    activePlayBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
                            if (response && response.success && response.state.isRunning) {
                                const currentTime = timerDisplay.textContent;
                                const title = titleInput.value.trim();
                                loadResumeInfoAndProcess(currentTime, title, response, function() {
                                    playHistoryEntry(activeEntry, activeHistoryItem);
                                });
                                return;
                            }
                            playHistoryEntry(activeEntry, activeHistoryItem);
                        });
                    });
                    
                    // 삭제 버튼 이벤트
                    activeDeleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        deleteHistoryItem(activeTimestampValue);
                    });
                    
                    // 편집 버튼 이벤트
                    let activeOriginalTitle = activeEntry.title || '';
                    let activeOriginalMemo = activeEntry.memo || '';
                    let activeOriginalTime = activeEntry.time;
                    
                    activeEditBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        activeHistoryItem.classList.add('history-edit-mode');
                        activeEditActions.style.display = 'block';
                        activeTimeEditInput.value = formatTimeToHHMMSS(activeEntry.time);
                        if (activeMemoEditInput) {
                            activeMemoEditInput.value = activeOriginalMemo;
                        }
                        activeEditInput.focus();
                    });
                    
                    activeSaveBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const newTitle = activeEditInput.value.trim();
                        const newMemo = activeMemoEditInput ? activeMemoEditInput.value : '';
                        const newTime = activeTimeEditInput.value.trim();
                        const timePattern = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/;
                        if (newTime && !timePattern.test(newTime)) {
                            alert('시간 형식이 올바르지 않습니다.\n예: 01:23:45 또는 01:23');
                            return;
                        }
                        updateHistoryItem(activeTimestampValue, newTitle, newTime || activeOriginalTime, newMemo);
                    });
                    
                    activeCancelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        activeEditInput.value = activeOriginalTitle;
                        if (activeMemoEditInput) {
                            activeMemoEditInput.value = activeOriginalMemo;
                        }
                        activeTimeEditInput.value = formatTimeToHHMMSS(activeOriginalTime);
                        activeHistoryItem.classList.remove('history-edit-mode');
                        activeEditActions.style.display = 'none';
                    });
                }
                
                // 2. 날짜별 그룹 렌더링
                const dateKeys = Object.keys(groupedByDate);
                let isFirstDate = !activeEntry; // active 항목이 없으면 첫 번째 날짜에 체크박스 추가
                dateKeys.forEach(function(dateKey, index) {
                    // active 항목의 날짜와 같으면 날짜 헤더를 표시하지 않음 (이미 active 항목 위에 표시됨)
                    if (activeEntry && activeDateKey === dateKey) {
                        // active 항목의 날짜와 같은 경우, 체크박스는 이미 active 항목의 날짜 헤더에 있으므로 날짜 헤더를 추가하지 않음
                        // 하지만 해당 날짜의 항목들은 렌더링해야 함
                    } else {
                        // 날짜 헤더 추가
                        const dateHeader = document.createElement('div');
                        dateHeader.className = 'history-date-header';
                        
                        // 첫 번째 날짜 헤더에만 체크박스 추가
                        if (isFirstDate) {
                            isFirstDate = false;
                            dateHeader.innerHTML = `
                                <span class="date-header-text">${dateKey}</span>
                                <div class="date-header-checkbox">
                                    <input type="checkbox" id="minuteDisplayCheckbox">
                                    <label for="minuteDisplayCheckbox">분단위 환산</label>
                                </div>
                            `;
                            
                            const checkbox = dateHeader.querySelector('#minuteDisplayCheckbox');
                            checkbox.checked = isMinuteDisplay;
                            
                            // 체크박스 변경 이벤트
                            checkbox.addEventListener('change', function() {
                                saveMinuteDisplayState();
                                loadHistory(); // 내역 다시 로드하여 표시 형식 변경
                            });
                        } else {
                            dateHeader.textContent = dateKey;
                        }
                        
                        historyList.appendChild(dateHeader);
                    }
                
                    // 해당 날짜의 항목들 렌더링
                groupedByDate[dateKey].forEach(function(entry) {
                    const entryTimestamp = entry.endTime || entry.timestamp;
                    // active 항목은 건너뛰기
                    if (activeTimestamp && entryTimestamp === activeTimestamp) {
                        return;
                    }
                    const historyItem = document.createElement('div');
                    historyItem.className = 'history-item';
                    
                    // title과 타이머 누적 시간을 같은 줄에 표시
                    const title = entry.title || '(title 없음)';
                    const isCompleted = entry.completed || false;
                    const timestamp = entry.endTime || entry.timestamp;
                    
                    // 완료 상태에 따라 클래스 추가
                    if (isCompleted) {
                        historyItem.classList.add('completed');
                    }
                    
                    const memo = entry.memo || '';
                    historyItem.innerHTML = `
                        <div class="history-drag-handle" draggable="false" data-timestamp="${timestamp}"></div>
                        <div class="history-buttons">
                            <button class="history-play-btn" data-timestamp="${timestamp}" data-time="${entry.time}">
                                <img class="history-play-icon" src="images/icons8-play-20.png" alt="play">
                            </button>
                            <button class="history-edit-btn" data-timestamp="${timestamp}">✎</button>
                            <button class="history-delete-btn" data-timestamp="${timestamp}">×</button>
                        </div>
                        <div class="history-title-wrapper">
                            <input type="checkbox" class="history-complete-checkbox" data-timestamp="${timestamp}" ${isCompleted ? 'checked' : ''}>
                            <span class="history-title-text">${title}</span>
                            <input type="text" class="history-edit-input" value="${entry.title || ''}" placeholder="title를 입력하세요">
                            <textarea class="history-memo-edit-input" placeholder="메모를 입력하세요">${memo}</textarea>
                            <input type="text" class="history-time-edit-input" value="" placeholder="시간 (예: 01:23:45)">
                        </div>
                        <div class="history-memo">${memo}</div>
                        <div class="history-title-time">${formatTimeDisplay(entry.time, isMinuteDisplay)}</div>
                        <div class="history-edit-actions" style="display: none;">
                            <button class="history-save-btn" data-timestamp="${timestamp}">저장</button>
                            <button class="history-cancel-btn" data-timestamp="${timestamp}">취소</button>
                        </div>
                    `;
                    
                    // 체크박스 이벤트 리스너 추가
                    const completeCheckbox = historyItem.querySelector('.history-complete-checkbox');
                    completeCheckbox.addEventListener('change', function(e) {
                        e.stopPropagation();
                        const isChecked = completeCheckbox.checked;
                        updateHistoryItemCompleted(timestamp, isChecked, timestamp);
                    });
                
                    // 재생 버튼 이벤트 리스너 추가
                    const playBtn = historyItem.querySelector('.history-play-btn');
                    playBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        
                        // 타이머가 이미 실행 중인지 확인
                        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
                            if (response && response.success && response.state.isRunning) {
                                // 타이머가 실행 중이면 기존 타이머를 완료 처리 후 선택한 history 재생
                                const currentTime = timerDisplay.textContent;
                                const title = titleInput.value.trim();
                                
                                loadResumeInfoAndProcess(currentTime, title, response, function() {
                                    // 완료 처리 후 선택한 history 재생
                                    playHistoryEntry(entry, historyItem);
                                });
                                return;
                            }
                            
                            // 타이머가 실행 중이 아니면 바로 재생
                            playHistoryEntry(entry, historyItem);
                        });
                    });
                    
                    // 삭제 버튼 이벤트 리스너 추가
                    const deleteBtn = historyItem.querySelector('.history-delete-btn');
                    deleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        deleteHistoryItem(entry.endTime || entry.timestamp);
                    });
                    
                    // Edit 버튼 이벤트 리스너 추가
                    const editBtn = historyItem.querySelector('.history-edit-btn');
                    const saveBtn = historyItem.querySelector('.history-save-btn');
                    const cancelBtn = historyItem.querySelector('.history-cancel-btn');
                    const editInput = historyItem.querySelector('.history-edit-input');
                    const memoEditInput = historyItem.querySelector('.history-memo-edit-input');
                    const timeEditInput = historyItem.querySelector('.history-time-edit-input');
                    const editActions = historyItem.querySelector('.history-edit-actions');
                    
                    // 원본 값 저장 (취소 시 복원용)
                    let originalTitle = entry.title || '';
                    let originalMemo = entry.memo || '';
                    let originalTime = entry.time;
                    
                    editBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        // Edit 모드로 전환
                        historyItem.classList.add('history-edit-mode');
                        editActions.style.display = 'block';
                        // 누적시간을 0:00:00 형식으로 변환하여 표시
                        timeEditInput.value = formatTimeToHHMMSS(entry.time);
                        if (memoEditInput) {
                            memoEditInput.value = originalMemo;
                        }
                        editInput.focus();
                    });
                    
                    saveBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const newTitle = editInput.value.trim();
                        const newMemo = memoEditInput ? memoEditInput.value : '';
                        const newTime = timeEditInput.value.trim();
                        
                        // 시간 형식 검증 (HH:MM:SS 또는 HH:MM 형식)
                        const timePattern = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/;
                        if (newTime && !timePattern.test(newTime)) {
                            alert('시간 형식이 올바르지 않습니다.\n예: 01:23:45 또는 01:23');
                            return;
                        }
                        
                        // 수정 내용 저장
                        updateHistoryItem(entry.endTime || entry.timestamp, newTitle, newTime || originalTime, newMemo);
                    });
                    
                    cancelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        // 원본 값으로 복원
                        editInput.value = originalTitle;
                        if (memoEditInput) {
                            memoEditInput.value = originalMemo;
                        }
                        // 시간을 0:00:00 형식으로 변환하여 복원
                        timeEditInput.value = formatTimeToHHMMSS(originalTime);
                        // Edit 모드 해제
                        historyItem.classList.remove('history-edit-mode');
                        editActions.style.display = 'none';
                    });
                    
                    historyList.appendChild(historyItem);
                    });
                });
                
                // 3. 완료된 항목들 렌더링
                // (가장 최근 항목 로직 제거 - 날짜별 그룹에서 최종수정일자 순으로 정렬됨)
                
                // 완료된 항목들 렌더링
                if (false) { // recentEntry 로직 제거
                    const recentTimestamp = recentEntry.endTime || recentEntry.timestamp;
                    const recentTitle = recentEntry.title || '(title 없음)';
                    const recentIsCompleted = recentEntry.completed || false;
                    const recentMemo = recentEntry.memo || '';
                    
                    const recentHistoryItem = document.createElement('div');
                    recentHistoryItem.className = 'history-item';
                    
                    if (recentIsCompleted) {
                        recentHistoryItem.classList.add('completed');
                    }
                    
                    recentHistoryItem.innerHTML = `
                        <div class="history-drag-handle" draggable="false" data-timestamp="${recentTimestamp}"></div>
                        <div class="history-buttons">
                            <button class="history-play-btn" data-timestamp="${recentTimestamp}" data-time="${recentEntry.time}">
                                <img class="history-play-icon" src="images/icons8-play-20.png" alt="play">
                            </button>
                            <button class="history-edit-btn" data-timestamp="${recentTimestamp}">✎</button>
                            <button class="history-delete-btn" data-timestamp="${recentTimestamp}">×</button>
                        </div>
                        <div class="history-title-wrapper">
                            <input type="checkbox" class="history-complete-checkbox" data-timestamp="${recentTimestamp}" ${recentIsCompleted ? 'checked' : ''}>
                            <span class="history-title-text">${recentTitle}</span>
                            <input type="text" class="history-edit-input" value="${recentEntry.title || ''}" placeholder="title를 입력하세요">
                            <textarea class="history-memo-edit-input" placeholder="메모를 입력하세요">${recentMemo}</textarea>
                            <input type="text" class="history-time-edit-input" value="" placeholder="시간 (예: 01:23:45)">
                        </div>
                        <div class="history-memo">${recentMemo}</div>
                        <div class="history-title-time">${formatTimeDisplay(recentEntry.time, isMinuteDisplay)}</div>
                        <div class="history-edit-actions" style="display: none;">
                            <button class="history-save-btn" data-timestamp="${recentTimestamp}">저장</button>
                            <button class="history-cancel-btn" data-timestamp="${recentTimestamp}">취소</button>
                        </div>
                    `;
                    
                    // 가장 최근 항목에 이벤트 리스너 추가
                    const recentCompleteCheckbox = recentHistoryItem.querySelector('.history-complete-checkbox');
                    recentCompleteCheckbox.addEventListener('change', function(e) {
                        e.stopPropagation();
                        const isChecked = recentCompleteCheckbox.checked;
                        updateHistoryItemCompleted(recentTimestamp, isChecked, recentTimestamp);
                    });
                    
                    const recentPlayBtn = recentHistoryItem.querySelector('.history-play-btn');
                    recentPlayBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
                            if (response && response.success && response.state.isRunning) {
                                const currentTime = timerDisplay.textContent;
                                const title = titleInput.value.trim();
                                loadResumeInfoAndProcess(currentTime, title, response, function() {
                                    playHistoryEntry(recentEntry, recentHistoryItem);
                                });
                            return;
                        }
                            playHistoryEntry(recentEntry, recentHistoryItem);
                        });
                    });
                    
                    const recentDeleteBtn = recentHistoryItem.querySelector('.history-delete-btn');
                    recentDeleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        deleteHistoryItem(recentTimestamp);
                    });
                    
                    const recentEditBtn = recentHistoryItem.querySelector('.history-edit-btn');
                    const recentSaveBtn = recentHistoryItem.querySelector('.history-save-btn');
                    const recentCancelBtn = recentHistoryItem.querySelector('.history-cancel-btn');
                    const recentEditInput = recentHistoryItem.querySelector('.history-edit-input');
                    const recentMemoEditInput = recentHistoryItem.querySelector('.history-memo-edit-input');
                    const recentTimeEditInput = recentHistoryItem.querySelector('.history-time-edit-input');
                    const recentEditActions = recentHistoryItem.querySelector('.history-edit-actions');
                    
                    let recentOriginalTitle = recentEntry.title || '';
                    let recentOriginalMemo = recentEntry.memo || '';
                    let recentOriginalTime = recentEntry.time;
                    
                    recentEditBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        recentHistoryItem.classList.add('history-edit-mode');
                        recentEditActions.style.display = 'block';
                        recentTimeEditInput.value = formatTimeToHHMMSS(recentEntry.time);
                        if (recentMemoEditInput) {
                            recentMemoEditInput.value = recentOriginalMemo;
                        }
                        recentEditInput.focus();
                    });
                    
                    recentSaveBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const newTitle = recentEditInput.value.trim();
                        const newMemo = recentMemoEditInput ? recentMemoEditInput.value : '';
                        const newTime = recentTimeEditInput.value.trim();
                        const timePattern = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/;
                        if (newTime && !timePattern.test(newTime)) {
                            alert('시간 형식이 올바르지 않습니다.\n예: 01:23:45 또는 01:23');
                            return;
                        }
                        updateHistoryItem(recentTimestamp, newTitle, newTime || recentOriginalTime, newMemo);
                    });
                    
                    recentCancelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        recentEditInput.value = recentOriginalTitle;
                        if (recentMemoEditInput) {
                            recentMemoEditInput.value = recentOriginalMemo;
                        }
                        recentTimeEditInput.value = formatTimeToHHMMSS(recentOriginalTime);
                        recentHistoryItem.classList.remove('history-edit-mode');
                        recentEditActions.style.display = 'none';
                    });
                    
                    historyList.appendChild(recentHistoryItem);
                }
                
                // 4. 완료된 항목들 렌더링
                completedEntries.forEach(function(completedEntry) {
                    const completedEntryTimestamp = completedEntry.endTime || completedEntry.timestamp;
                    const completedTitle = completedEntry.title || '(title 없음)';
                    const completedIsCompleted = completedEntry.completed || false;
                    const completedMemo = completedEntry.memo || '';
                    
                    const completedHistoryItem = document.createElement('div');
                    completedHistoryItem.className = 'history-item';
                    
                    if (completedIsCompleted) {
                        completedHistoryItem.classList.add('completed');
                    }
                    
                    completedHistoryItem.innerHTML = `
                        <div class="history-drag-handle" draggable="false" data-timestamp="${completedEntryTimestamp}"></div>
                        <div class="history-buttons">
                            <button class="history-play-btn" data-timestamp="${completedEntryTimestamp}" data-time="${completedEntry.time}">
                                <img class="history-play-icon" src="images/icons8-play-20.png" alt="play">
                            </button>
                            <button class="history-edit-btn" data-timestamp="${completedEntryTimestamp}">✎</button>
                            <button class="history-delete-btn" data-timestamp="${completedEntryTimestamp}">×</button>
                        </div>
                        <div class="history-title-wrapper">
                            <input type="checkbox" class="history-complete-checkbox" data-timestamp="${completedEntryTimestamp}" ${completedIsCompleted ? 'checked' : ''}>
                            <span class="history-title-text">${completedTitle}</span>
                            <input type="text" class="history-edit-input" value="${completedEntry.title || ''}" placeholder="title를 입력하세요">
                            <textarea class="history-memo-edit-input" placeholder="메모를 입력하세요">${completedMemo}</textarea>
                            <input type="text" class="history-time-edit-input" value="" placeholder="시간 (예: 01:23:45)">
                        </div>
                        <div class="history-memo">${completedMemo}</div>
                        <div class="history-title-time">${formatTimeDisplay(completedEntry.time, isMinuteDisplay)}</div>
                        <div class="history-edit-actions" style="display: none;">
                            <button class="history-save-btn" data-timestamp="${completedEntryTimestamp}">저장</button>
                            <button class="history-cancel-btn" data-timestamp="${completedEntryTimestamp}">취소</button>
                        </div>
                    `;
                    
                    // 완료된 항목에 이벤트 리스너 추가
                    const completedCompleteCheckbox = completedHistoryItem.querySelector('.history-complete-checkbox');
                    completedCompleteCheckbox.addEventListener('change', function(e) {
                        e.stopPropagation();
                        const isChecked = completedCompleteCheckbox.checked;
                        updateHistoryItemCompleted(completedEntryTimestamp, isChecked, completedEntryTimestamp);
                    });
                    
                    const completedPlayBtn = completedHistoryItem.querySelector('.history-play-btn');
                    completedPlayBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        chrome.runtime.sendMessage({ action: 'getTimerState' }, function(response) {
                            if (response && response.success && response.state.isRunning) {
                                const currentTime = timerDisplay.textContent;
                                const title = titleInput.value.trim();
                                loadResumeInfoAndProcess(currentTime, title, response, function() {
                                    playHistoryEntry(completedEntry, completedHistoryItem);
                                });
                            return;
                        }
                            playHistoryEntry(completedEntry, completedHistoryItem);
                        });
                    });
                    
                    const completedDeleteBtn = completedHistoryItem.querySelector('.history-delete-btn');
                    completedDeleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        deleteHistoryItem(completedEntryTimestamp);
                    });
                    
                    const completedEditBtn = completedHistoryItem.querySelector('.history-edit-btn');
                    const completedSaveBtn = completedHistoryItem.querySelector('.history-save-btn');
                    const completedCancelBtn = completedHistoryItem.querySelector('.history-cancel-btn');
                    const completedEditInput = completedHistoryItem.querySelector('.history-edit-input');
                    const completedMemoEditInput = completedHistoryItem.querySelector('.history-memo-edit-input');
                    const completedTimeEditInput = completedHistoryItem.querySelector('.history-time-edit-input');
                    const completedEditActions = completedHistoryItem.querySelector('.history-edit-actions');
                    
                    let completedOriginalTitle = completedEntry.title || '';
                    let completedOriginalMemo = completedEntry.memo || '';
                    let completedOriginalTime = completedEntry.time;
                    
                    completedEditBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        completedHistoryItem.classList.add('history-edit-mode');
                        completedEditActions.style.display = 'block';
                        completedTimeEditInput.value = formatTimeToHHMMSS(completedEntry.time);
                        if (completedMemoEditInput) {
                            completedMemoEditInput.value = completedOriginalMemo;
                        }
                        completedEditInput.focus();
                    });
                    
                    completedSaveBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const newTitle = completedEditInput.value.trim();
                        const newMemo = completedMemoEditInput ? completedMemoEditInput.value : '';
                        const newTime = completedTimeEditInput.value.trim();
                        const timePattern = /^(\d{1,2}):(\d{2})(:(\d{2}))?$/;
                        if (newTime && !timePattern.test(newTime)) {
                            alert('시간 형식이 올바르지 않습니다.\n예: 01:23:45 또는 01:23');
                            return;
                        }
                        updateHistoryItem(completedEntryTimestamp, newTitle, newTime || completedOriginalTime, newMemo);
                    });
                        
                    completedCancelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        completedEditInput.value = completedOriginalTitle;
                        if (completedMemoEditInput) {
                            completedMemoEditInput.value = completedOriginalMemo;
                        }
                        completedTimeEditInput.value = formatTimeToHHMMSS(completedOriginalTime);
                        completedHistoryItem.classList.remove('history-edit-mode');
                        completedEditActions.style.display = 'none';
                    });
                    
                    historyList.appendChild(completedHistoryItem);
                });
                
                // 스크롤 위치 복원 (restoreTimestamp가 있으면) - 모든 항목 렌더링 완료 후 실행
                if (restoreTimestamp) {
                    setTimeout(function() {
                        const targetCheckbox = historyList.querySelector('.history-complete-checkbox[data-timestamp="' + restoreTimestamp + '"]');
                        if (targetCheckbox) {
                            const targetItem = targetCheckbox.closest('.history-item');
                            if (targetItem) {
                                targetItem.scrollIntoView({ behavior: 'instant', block: 'center' });
                            }
                        }
                    }, 0);
                }
                
                // 순서 변경 후 포커스 유지 (focusTimestamp가 있으면) - 모든 항목 렌더링 완료 후 실행
                if (focusTimestamp) {
                    setTimeout(function() {
                        const targetDragHandle = historyList.querySelector('.history-drag-handle[data-timestamp="' + focusTimestamp + '"]');
                        if (targetDragHandle) {
                            const targetItem = targetDragHandle.closest('.history-item');
                            if (targetItem) {
                                targetItem.scrollIntoView({ behavior: 'instant', block: 'center' });
                            }
                        }
                    }, 0);
                }
            }); // loadMinuteDisplayState 콜백 닫힘
        }); // chrome.storage.local.get 콜백 닫힘
    }
    
    // 개별 내역 삭제 함수
    function deleteHistoryItem(timestamp) {
        if (!confirm('이 내역을 삭제하시겠습니까?')) {
            return;
        }
        
        if (!isStorageAvailable()) {
            alert('삭제 기능을 사용할 수 없습니다.\n확장 프로그램을 다시 로드해주세요.');
            return;
        }
        
        getHistory(function(history) {
            // 해당 timestamp를 가진 항목 제거
            history = history.filter(function(entry) {
                return (entry.endTime || entry.timestamp) !== timestamp;
            });
            
            // 스토리지에 저장
            saveHistory(history, function(success) {
                if (!success) {
                    alert('데이터 삭제에 실패했습니다.');
                    return;
                }
                
                // 저장 내역 새로고침
                loadHistory();
            });
        });
    }
    
    // 개별 내역 수정 함수
    function updateHistoryItem(timestamp, newTitle, newTime, newMemo) {
        if (!isStorageAvailable()) {
            alert('수정 기능을 사용할 수 없습니다.\n확장 프로그램을 다시 로드해주세요.');
            return;
        }
        
        getHistory(function(history) {
            // 해당 timestamp를 가진 항목 찾아서 수정
            let found = false;
            history = history.map(function(entry) {
                if ((entry.endTime || entry.timestamp) === timestamp) {
                    found = true;
                    return {
                        ...entry,
                        title: newTitle,
                        memo: newMemo !== undefined ? newMemo : (entry.memo || ''),
                        time: newTime,
                        lastModified: Date.now()
                    };
                }
                return entry;
            });
            
            if (!found) {
                alert('수정할 내역을 찾을 수 없습니다.');
                return;
            }
            
            // 스토리지에 저장
            saveHistory(history, function(success) {
                if (!success) {
                    alert('데이터 수정에 실패했습니다.');
                    return;
                }
                
                // 저장 내역 새로고침 (스크롤 위치 복원을 위해 timestamp 전달)
                loadHistory(timestamp);
            });
        });
    }
    
    // 히스토리 항목 순서 변경 함수
    function reorderHistoryItems(draggedTimestamp, targetTimestamp, insertBefore, focusTimestamp) {
        if (!isStorageAvailable()) {
            return;
        }
        
        getHistory(function(history) {
            // 화면에 표시된 순서대로 timestamp 배열 생성
            const historyList = document.getElementById('historyList');
            const displayedItems = Array.from(historyList.querySelectorAll('.history-item'));
            
            // active 항목 찾기
            const activeItem = displayedItems.find(function(item) {
                return item.classList.contains('active');
            });
            const activeTimestamp = activeItem ? parseInt(activeItem.querySelector('.history-drag-handle').getAttribute('data-timestamp')) : null;
            
            // active 항목을 제외한 timestamp 배열 생성
            const displayedTimestamps = displayedItems
                .filter(function(item) {
                    return !item.classList.contains('active');
                })
                .map(function(item) {
                    const dragHandle = item.querySelector('.history-drag-handle');
                    return dragHandle ? parseInt(dragHandle.getAttribute('data-timestamp')) : null;
                })
                .filter(function(ts) { return ts !== null; });
            
            // 드래그된 항목과 타겟 항목의 화면상 인덱스 찾기 (active 제외)
            const draggedDisplayIndex = displayedTimestamps.indexOf(draggedTimestamp);
            let targetDisplayIndex = displayedTimestamps.indexOf(targetTimestamp);
            
            if (draggedDisplayIndex === -1 || targetDisplayIndex === -1 || draggedDisplayIndex === targetDisplayIndex) {
                return;
            }
            
            // 화면 순서대로 history 배열 재정렬
            const timestampToEntry = {};
            history.forEach(function(entry) {
                const timestamp = entry.endTime || entry.timestamp;
                timestampToEntry[timestamp] = entry;
            });
            
            // active 항목을 맨 위에, 나머지는 화면 순서대로 새 배열 생성
            const newHistory = [];
            
            // active 항목을 맨 위에 추가
            if (activeTimestamp && timestampToEntry[activeTimestamp]) {
                newHistory.push(timestampToEntry[activeTimestamp]);
            }
            
            // 나머지 항목들을 화면 순서대로 추가
            displayedTimestamps.forEach(function(ts) {
                if (timestampToEntry[ts] && ts !== activeTimestamp) {
                    newHistory.push(timestampToEntry[ts]);
                }
            });
            
            // 드래그된 항목 제거
            const draggedItem = newHistory.splice(draggedDisplayIndex + (activeTimestamp ? 1 : 0), 1)[0];
            
            // insertBefore에 따라 삽입 위치 결정
            // 드래그된 항목이 제거되었으므로 인덱스 조정 필요
            let insertIndex;
            const adjustedTargetIndex = targetDisplayIndex + (activeTimestamp ? 1 : 0);
            const adjustedDraggedIndex = draggedDisplayIndex + (activeTimestamp ? 1 : 0);
            
            if (adjustedDraggedIndex < adjustedTargetIndex) {
                // 드래그된 항목이 타겟보다 앞에 있는 경우
                insertIndex = insertBefore ? adjustedTargetIndex - 1 : adjustedTargetIndex;
            } else {
                // 드래그된 항목이 타겟보다 뒤에 있는 경우
                insertIndex = insertBefore ? adjustedTargetIndex : adjustedTargetIndex + 1;
            }
            
            newHistory.splice(insertIndex, 0, draggedItem);
            
            // 화면에 표시되지 않은 항목들도 추가 (혹시 모를 경우를 대비)
            history.forEach(function(entry) {
                const timestamp = entry.endTime || entry.timestamp;
                if (!displayedTimestamps.includes(timestamp) && timestamp !== activeTimestamp) {
                    newHistory.push(entry);
                }
            });
            
            // 스토리지에 저장
            saveHistory(newHistory, function(success) {
                if (success) {
                    // 저장 내역 새로고침 (포커스 유지를 위해 focusTimestamp 전달)
                    loadHistory(null, focusTimestamp);
                }
            });
        });
    }
    
    // 개별 내역 완료 상태 업데이트 함수
    function updateHistoryItemCompleted(timestamp, isCompleted, restoreTimestamp) {
        if (!isStorageAvailable()) {
            return;
        }
        
        getHistory(function(history) {
            // 해당 timestamp를 가진 항목 찾아서 완료 상태 업데이트
            history = history.map(function(entry) {
                if ((entry.endTime || entry.timestamp) === timestamp) {
                    return {
                        ...entry,
                        completed: isCompleted,
                        lastModified: Date.now()
                    };
                }
                return entry;
            });
            
            // 스토리지에 저장
            saveHistory(history, function(success) {
                if (success) {
                    // 저장 내역 새로고침 (스크롤 위치 복원을 위해 restoreTimestamp 전달)
                    loadHistory(restoreTimestamp);
                }
            });
        });
    }
    
    // 페이지 로드 시 저장 내역 불러오기
    loadHistory();
    
    // 전체삭제 버튼 클릭 이벤트
    const clearAllBtn = document.getElementById('clearAllBtn');
    clearAllBtn.addEventListener('click', function() {
        if (confirm('모든 저장 내역을 삭제하시겠습니까?')) {
        if (!isStorageAvailable()) {
            alert('삭제 기능을 사용할 수 없습니다.\n확장 프로그램을 다시 로드해주세요.');
            return;
        }
        
        chrome.storage.local.remove(['timerHistory'], function() {
                if (chrome.runtime.lastError) {
                    alert('데이터 삭제에 실패했습니다.');
                    return;
                }
                
                // 저장 내역 새로고침
                loadHistory();
            });
        }
    });
}

