// GA4 web(AppsInToss) 데이터 스트림의 measurementId. 공개값이며(브라우저 gtag의
// measurement id와 동일 성격), 비밀이 아니다. firebase/app 모듈을 끌어오지 않도록
// app.ts의 Firebase 설정과 분리된 상수로 둔다(analytics는 MP 전송이라 FirebaseApp 불필요).
export const APPS_IN_TOSS_GA4_MEASUREMENT_ID = 'G-LQQQQZHG1V';
