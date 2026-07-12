// Happy Farm의 Firebase web(AppsInToss) 프로젝트 공개 설정값.
//
// 이 값들은 모두 공개값이다(브라우저 앱이라면 번들에 그대로 노출되는 성격). apiKey는
// Firebase 접근 제어용 비밀이 아니라 프로젝트 식별자이며, Analytics measurementId·web
// appId도 공개값이다. 진짜 비밀인 GA4 MP api_secret만 mpSecret.generated로 분리해 빌드
// 시 주입한다.
//
// AIT 빌드는 Granite RN 런타임이라 브라우저 전용 Firebase JS SDK를 쓰지 못한다. 그래서
// Analytics는 GA4 Measurement Protocol, Remote Config는 REST fetch로 직접 호출하며, 두
// 경로 모두 이 상수만 필요하다(FirebaseApp 인스턴스 불필요). firebase/app을 import하지
// 않도록 별도 상수 모듈로 둔다.
export const FIREBASE_WEB_API_KEY = 'AIzaSyA6qzbbudhf8sRB5ri1Lme6CV66xG_Pfvw';
export const FIREBASE_WEB_APP_ID = '1:1874344437:web:a34abb444eae2baa6c48bc';
// 프로젝트 번호(=messagingSenderId). Remote Config REST 경로 파라미터에 쓰인다.
export const FIREBASE_PROJECT_NUMBER = '1874344437';
// GA4 web 데이터 스트림 measurementId(gtag measurement id와 동일 성격의 공개값).
export const APPS_IN_TOSS_GA4_MEASUREMENT_ID = 'G-LQQQQZHG1V';
