import UIKit
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// iOS 27 SDK 로 링크한 앱은 UIScene 라이프사이클을 채택해야 한다. 채택하지 않으면
// UIKit 이 실행 즉시 트랩을 걸어(___UIApplicationEvaluateRuntimeIssueForNoScene
// LifecycleAdoption, EXC_BREAKPOINT) 앱이 뜨지 않는다. iOS 26 까지는 경고였고
// 27 부터 치명적이라, 심사(iOS 27.0 / iPhone 17 Pro Max)에서만 드러났다.
//
// Info.plist 에 UIApplicationSceneManifest 만 넣으면 크래시가 검은 화면으로
// 바뀔 뿐이다. AppDelegate 가 만든 UIWindow 는 UIWindowScene 에 붙지 않기
// 때문에, window 생성과 React Native 시작을 SceneDelegate 로 옮겨야 한다.
//
// React Native 0.84 에는 아직 공식 대응이 없어(RN #54763, RFC #967) 직접 채택한다.

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  // UIScene 으로 옮기면서 window 소유권은 SceneDelegate 로 갔지만, 이 프로퍼티를
  // 없앨 수는 없다. react-native-google-mobile-ads 의 동의 폼·배너·Ad Inspector 가
  // root view controller 를 UIApplication.shared.delegate.window 로 찾는다. 없으면
  // unrecognized selector 로 앱이 즉시 종료된다(전면·보상 광고는 keyWindow 를 써서
  // 영향이 없어 동의 흐름을 붙이기 전까지 드러나지 않았다).
  // UIApplicationSupportsMultipleScenes 가 false 라 window 는 항상 하나다.
  var window: UIWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  // SceneDelegate 가 startReactNative 에 그대로 넘겨야 해서 보관한다.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if FirebaseApp.app() == nil,
       let firebaseConfigPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
       let firebaseOptions = FirebaseOptions(contentsOfFile: firebaseConfigPath) {
      FirebaseApp.configure(options: firebaseOptions)
    }

    self.launchOptions = launchOptions

    // 팩토리만 만들어 두고 실제 화면 구성은 scene 연결 시점으로 미룬다.
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    // 이름은 Info.plist 의 UISceneConfigurationName 과 같아야 한다.
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    // UIScreen.main 이 아니라 연결된 scene 에서 window 를 만들어야 화면에 붙는다.
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "HappyFarmMobile",
      in: window,
      launchOptions: appDelegate.launchOptions
    )
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
       appDelegate.window === window {
      appDelegate.window = nil
    }
  }

  // 방치형 게임이라 포그라운드에서는 화면이 꺼지지 않게 둔다. OS 권한은 필요 없고,
  // 비활성 시점에 사용자의 원래 설정으로 되돌린다. scene 라이프사이클로 옮기면서
  // application 단위 콜백에서 scene 단위 콜백으로 바뀌었다.
  func sceneDidBecomeActive(_ scene: UIScene) {
    UIApplication.shared.isIdleTimerDisabled = true
  }

  func sceneWillResignActive(_ scene: UIScene) {
    UIApplication.shared.isIdleTimerDisabled = false
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
