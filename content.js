// 타이머 데이터 저장 함수
async function saveTimerData(title, time) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['timerHistory'], function(result) {
      let history = [];
      if (result.timerHistory) {
        try {
          history = JSON.parse(result.timerHistory);
        } catch (e) {
          history = [];
        }
      }
      
      const newEntry = { 
        title: title || '', 
        time: time || '00:00:00',
        timestamp: Date.now()
      };
      history.push(newEntry);
      
      chrome.storage.local.set({ timerHistory: JSON.stringify(history) }, function() {
        resolve({ success: true, entry: newEntry });
      });
    });
  });
}

// 타이머 데이터 불러오기 함수
async function getTimerHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['timerHistory'], function(result) {
      let history = [];
      if (result.timerHistory) {
        try {
          history = JSON.parse(result.timerHistory);
        } catch (e) {
          history = [];
        }
      }
      resolve(history);
    });
  });
}

// 메시지 리스너 추가
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "saveTimerData":
      saveTimerData(request.title, request.time).then(result => {
        sendResponse(result);
      });
      break;
      
    case "getTimerHistory":
      getTimerHistory().then(history => {
        sendResponse({ success: true, history });
      });
      break;
  }
  return true; // 비동기 응답을 위해 true 반환
});
  