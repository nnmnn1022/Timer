
/* 52시간 기준 근무시간 현황 표 그리드 row data 구성 */
export const parseGridRowDataByWorkhours = (data) => {
    const commuting = get(data, "commutingList.commuting", []);
    const holiday = get(data, "commutingList.holiday", []);
    const is_console_error_log = sessionStorage.getItem("TestMode") === "true"; // 에러로그 표시
  
    if(commuting.length >= 5000) {
      throw new Error(
          "근무시간 계산에 사용되는 근무기록 조회 건수가 5000건 이상 입니다. 검색조건을 조정하여 건수를 낮춰주세요."
      );
    }
  
    // 출퇴근 시간 보정 및 계산을 위한 moment 객체 생성
    const commutingList = getParsedCommuting(commuting, holiday);
  
    // 조회 주간 기준으로 근무시간 합산
    const workingTimeList = getGroupAndSumWorkingSeconds(commutingList);
  
    // 오류 확인용 로그
    if(is_console_error_log) {
      console.log("%c원본 data : ", "color: yellow; background-color: green;");
      console.table(commuting);
      console.log("%c가공된 data : ", "color: yellow; background-color: blue;");
      console.table(commutingList);
      console.log("%c근무시간 합산 data : ", "color: yellow; background-color: red;");
      console.table(workingTimeList);
    }
  
    // 추가 정렬 - 근무가능시간 낮은 순
    return sortBy(workingTimeList, ['AVAILABLE_WORKING_TIME_S']);
  };
  
  export const parseGridRowDataByInactiveUsers = (data) => {
    const idleList = data?.manage?.idleList || [];
  
    const parsedData = idleList.map(({ userGroup, name }) => ({
      DEPT: userGroup?.deptName || "",
      TEAM_LABEL: userGroup?.siteName || "",
      PIC_LABEL: name || "",
    }));
  
    return sortBy(parsedData, ["PIC_LABEL"]);
  }
  
  /**
   * 자릿수에 맞지 않는 시간 문자열 보정. 년월일 구분은 '/' 날짜시간 구분은 공백을 기준으로 한다.
   * "24/11/18 8:08:07"
   * "2024/11/18  8:08:07"
   * " 2024/11/18 08:08:07 "
   * "2024/11/18 8:8:07 "
   * " 2024/11/18 8:8:7"
   * "24/1/8 8:8:7"
   */
  const normalizeDate = (data) => {
    // 1. 날짜와 시간 분리
    const [datePart, timePart] = trim(data).replace(/\s+/g, " ").trim().split(" ");
  
    // 2. 날짜 처리 (연도를 4자리로 보완)
    const [year, month, day] = datePart.split("/").map((val, idx) => {
      if (idx === 0 && val.length === 2) {
        return parseInt(val, 10) > 50 ? "19" + val : "20" + val; // 50 이상이면 1900년대, 아니면 2000년대
      }
      return val.padStart(2, "0");
    });
  
    // 3. 시간 처리 (각 부분을 2자리로 보완)
    let timePartPad = "";
    if(!isEmpty(timePart) && isString(timePart)) {
      const [hour = "00", minute = "00", second = "00"] = timePart.split(":").map((val) =>
          val.padStart(2, "0")
      );
      timePartPad = ` ${hour}:${minute}:${second}`;
    }
  
    // 4. 포맷팅
    return `${year}/${month}/${day}${timePartPad}`;
  }
  
  /**
   * 출퇴근 시간 보정 및 계산을 위한 moment 객체 생성
   * @param commuting
   * @param holiday
   * @returns {*[]}
   */
  const getParsedCommuting = (commuting, holiday) => {
    const result = [];
    const nowDate = moment();
    const holidayList = holiday.map(item => item.date);
  
    for (let i = 0; i < (commuting || []).length; i++) {
      const is_console_error_log = sessionStorage.getItem("TestMode") === "true"; // 에러로그 표시
      let data = commuting[i];
      let end_error = false; // 퇴근 시간이 찍히지 않은 경우(금일 제외)
      let working_second_error = false; // 근무시간 계산 오류
  
      let minus_lunch_time = false; // 점심시간 뺌
      let minus_dinner_time = false; // 저녁시간 뺌
      let minus_type = ""; // 식사시간 뺀 유형
      let fix_work_start = false; // 출근시간 보정
      let fix_work_end = false; // 퇴근시간 보정
  
      let work_start_mmt = moment(normalizeDate(data.work_start), "YYYY/MM/DD HH:mm:ss"); // 출근시간
  
      const am_9 = work_start_mmt.clone().set({ hour: 9, minute: 0, second: 0 }); // 같은 날 9시로 설정한 기준 시간
      const am_10 = work_start_mmt.clone().set({ hour: 10, minute: 0, second: 0 }); // 같은 날 10시로 설정한 기준 시간
      const pm_12 = work_start_mmt.clone().set({ hour: 12, minute: 0, second: 0 }); // 같은 날 12시로 설정한 기준 시간
      const pm_13 = work_start_mmt.clone().set({ hour: 13, minute: 0, second: 0 }); // 같은 날 13시로 설정한 기준 시간
      const pm_18 = work_start_mmt.clone().set({ hour: 18, minute: 0, second: 0 }); // 같은 날 18시로 설정한 기준 시간
      const pm_19 = work_start_mmt.clone().set({ hour: 19, minute: 0, second: 0 }); // 같은 날 19시로 설정한 기준 시간
  
      /* 출근시간 + 보정 */
      // 9시 이전 출근이면 9시로 출근 시작
      if(work_start_mmt.isBefore(am_9)) {
        work_start_mmt = am_9;
        fix_work_start = true;
      }
      // 12시 ~ 13시 사이 출근이면 13시로 출근 시작
      else if(work_start_mmt.isSameOrAfter(pm_12) && work_start_mmt.isSameOrBefore(pm_13)) {
        work_start_mmt = pm_13;
        fix_work_start = true;
      }
  
      /* 출근날 특이사항 */
      const is_today_work_start = work_start_mmt.isSame(nowDate, 'day'); // 출근일이 오늘날짜인지 확인
      const is_holiday_work_start = holidayList.includes(work_start_mmt.format("YYYY-MM-DD")); // 출근일이 휴일인지 확인
  
      /* 퇴근시간 + 보정 */
      let work_end_mmt;
      // 퇴근시간이 없다면
      if(!data.work_end) {
        // 금일이 아닌데 퇴근시간이 없다면 퇴근시간 자동 보정했다는 의미로 플래그값 설정
        if(!is_today_work_start) end_error = true;
        fix_work_end = true;
  
        // 금일인 경우 현재 시간을 기준으로 퇴근시간을 계산해서 근무시간 계산되도록 한다.
        if(is_today_work_start) {
          work_end_mmt = nowDate;
        }
        // 18시 이후 출근이면 24시로 퇴근으로 계산
        else if(work_start_mmt.isSameOrAfter(pm_18)) {
          work_end_mmt = work_start_mmt.clone().add(1, 'day').startOf('day');
        }
        // 보통은 18시 퇴근으로 계산
        else {
          work_end_mmt = pm_18;
        }
      } else {
        work_end_mmt = moment(normalizeDate(data.work_end), "YYYY/MM/DD HH:mm:ss"); // 퇴근시간
      }
      // 휴일이 아니면서 퇴근시간이 18-19시 사이면, 18시 퇴근으로 계산되도록
      if(!is_holiday_work_start && work_end_mmt.isSameOrAfter(pm_18) && work_end_mmt.isBefore(pm_19)) {
        work_end_mmt = pm_18;
        fix_work_end = true;
      }
  
      /* 업무시간 계산 */
      let working_second = work_end_mmt.diff(work_start_mmt, "second");
  
      // 휴일이면서 10시 이전 출근이 아닌 경우 점심시간/저녁시간 빼지않고 계산
      if(is_holiday_work_start && !work_start_mmt.isSameOrBefore(am_10)) {
        minus_lunch_time = false;
        minus_dinner_time = false;
        minus_type = "휴일+10시이전출근아님";
      }
      // 12:00~13:00 사이 출근이면 13:00으로 계산해서 19시 이전 퇴근이면 그대로 계산
      else if(work_start_mmt.isSame(pm_13, 'minute') && work_end_mmt.isBefore(pm_19)) {
        minus_lunch_time = false;
        minus_dinner_time = false;
        minus_type = "12~13출근+19시이전퇴근";
      }
      // 12:00~13:00 사이 출근이면 13:00으로 계산해서 19시 이후 퇴근이면 1시간제외
      else if(work_start_mmt.isSame(pm_13, 'minute') && work_end_mmt.isSameOrAfter(pm_19)) {
        minus_lunch_time = false;
        minus_dinner_time = true;
        minus_type = "12~13출근+19시이후퇴근";
      }
      // 13시 이전 퇴근이면 그대로 계산
      else if(work_end_mmt.isBefore(pm_13)) {
        minus_lunch_time = false;
        minus_dinner_time = false;
        minus_type = "13시이전퇴근";
      }
      // 출근시간이 13시 이전이면서 19시 이전 퇴근 시 점심시간 1시간 제외하고 계산 (오후반차 써도 점심시간 포함이니까)
      else if(work_start_mmt.isBefore(pm_13) && work_end_mmt.isBefore(pm_19)) {
        // 단, 금일이면서 퇴근기록이 없고, 보정된 퇴근시간이 13시 이전이면 빼지 않는다.
        if (is_today_work_start && !data.work_end && work_end_mmt.isBefore(pm_13)) {
          minus_lunch_time = false;
          minus_dinner_time = false;
          minus_type = "금일+최근기록없음+현재13시이전";
        } else {
          minus_lunch_time = true;
          minus_dinner_time = false;
          minus_type = "13시이전출근+19시이전퇴근";
        }
      }
      // 출근시간이 13시 이전이면서 19시 이후 퇴근 시 점심시간 1시간 + 저녁시간 1시간 제외하고 계산
      else if(work_start_mmt.isBefore(pm_13) && work_end_mmt.isSameOrAfter(pm_19)) {
        minus_lunch_time = true;
        minus_dinner_time = true;
        minus_type = "13시이전출근+19시이후퇴근";
      }
  
      if(minus_lunch_time || minus_dinner_time) {
        working_second = working_second - (minus_lunch_time ? 3600 : 0) - (minus_dinner_time ? 3600 : 0);
      }
  
      // 업무시간 계산 오류
      if(working_second < 0) {
        working_second = 0;
        working_second_error = true;
      }
  
      const weekly = getWeekStartEnd(work_start_mmt.format("YYYY/MM/DD"), { inputFormat: "YYYY/MM/DD", outputFormat: "YYYY/MM/DD" });
      const commutingData = {
        team: data.team,
        user_id: data.user_id,
        work_start: work_start_mmt.format("YYYY-MM-DD HH:mm"),
        work_end: work_end_mmt.format("YYYY-MM-DD HH:mm"),
        weekly: weekly.start + " ~ " + weekly.end,
        working_second,
        working_min: convertSecondToHHMM(working_second),
        holiday: is_holiday_work_start,
        fix_work_start,
        fix_work_end,
        lunch: minus_lunch_time,
        dinner: minus_dinner_time,
        type: minus_type
      };
      result.push(commutingData);
  
      if(is_console_error_log && (end_error || working_second_error)) {
        console.error("퇴근시간누락: [%o], 근무시간계산오류: [%o] >>> ", end_error, working_second_error, commutingData);
      }
    }
  
    return sortBy(result, ['team', 'user_id', 'work_start']);
  };
  
  /**
   * 입력된 날짜 기준으로 해당 주의 월요일, 일요일을 가져온다.
   * getWeekStartEnd("24/11/13  13:38:24", { inputFormat: "YY/MM/DD  HH:mm:ss", outputFormat: "YYYY-MM-DD" });
   * getWeekStartEnd(null, { outputFormat: "YYYY-MM-DD" });
   * @param value
   * @param options
   * @returns {{start: string, end: string}}
   */
  export const getWeekStartEnd = (value, options) => {
    const inputFormat = options?.inputFormat || "YYYY/MM/DD HH:mm:ss";
    const outputFormat = options?.outputFormat || "YYYY-MM-DD";
    const date = isEmpty(value) ? moment(new Date()) : moment(value, inputFormat);
    const is_console_error_log = sessionStorage.getItem("TestMode") === "true"; // 에러로그 표시
  
    // 주간 월요일과 일요일 계산
    const monday = date.clone().startOf('isoWeek');  // ISO 기준으로 주의 시작일을 월요일로 설정
    const sunday = date.clone().endOf('isoWeek');    // 주의 마지막 날을 일요일로 설정
  
    if(is_console_error_log) {
      console.log("[%o] 날짜의 주 월요일[%o], 일요일[%o]", date.format(outputFormat), monday.format(outputFormat), sunday.format(outputFormat));
    }
  
    return {
      start: monday.format(outputFormat),
      end: sunday.format(outputFormat)
    };
  };
  
  /**
   * 조회 주간 기준으로 근무시간 합산
   * @param data
   * @returns {*[]}
   */
  const getGroupAndSumWorkingSeconds = (data) => {
    const result = [];
    const map = new Map();
  
    data.forEach((entry) => {
      const { team, user_id, weekly, working_second } = entry;
      const key = `${team}_${user_id}_${weekly}`;
  
      if (map.has(key)) {
        // 이미 존재하는 경우, working_second 값을 합산
        const existing = map.get(key);
        existing.WORKED_TIME_S += working_second;
        existing.AVAILABLE_WORKING_TIME_S -= working_second;
        // if(existing.AVAILABLE_WORKING_TIME_S < 0) existing.AVAILABLE_WORKING_TIME_S = 0;
      } else {
        // 존재하지 않으면 새 객체 생성 및 삽입
        const newEntry = {
          TEAM_LABEL: team,
          PIC_LABEL: user_id,
          DATE_PERIOD: weekly,
          WORKED_TIME_S: working_second,
          AVAILABLE_WORKING_TIME_S: 187200 - working_second,
        };
        map.set(key, newEntry);
        result.push(newEntry);
      }
    });
  
    // 계산된 근무시간(초) 기준으로 분단위 표시값을 생성 한다 (그리드 표시할 때 안하고 여기서 하는 이유는 엑셀에도 분단위로 표시되게 하기 위해)
    result.forEach((entry) => {
      const { WORKED_TIME_S, AVAILABLE_WORKING_TIME_S } = entry;
      entry["WORKED_TIME"] = convertSecondToHHMM(WORKED_TIME_S);
      entry["AVAILABLE_WORKING_TIME"] = convertSecondToHHMM(AVAILABLE_WORKING_TIME_S);
    });
  
    return result;
  }