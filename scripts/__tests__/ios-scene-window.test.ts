/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

// iOS 27 UIScene 채택으로 window 소유권이 SceneDelegate 로 옮겨갔다. 그런데
// react-native-google-mobile-ads 는 root view controller 를
// UIApplication.shared.delegate.window 로 찾는다. AppDelegate 에 window 가
// 없으면 unrecognized selector 로 앱이 즉시 종료된다.
describe('UIScene 전환 뒤에도 AppDelegate.window 가 살아 있다', () => {
  const appDelegate = readSource('apps/mobile/ios/HappyFarmMobile/AppDelegate.swift');

  test('AppDelegate 가 window 프로퍼티를 노출한다', () => {
    const body = appDelegate.slice(
      appDelegate.indexOf('class AppDelegate'),
      appDelegate.indexOf('class SceneDelegate')
    );

    expect(body).toMatch(/var window: UIWindow\?/);
  });

  test('SceneDelegate 가 만든 window 를 AppDelegate 에 넘긴다', () => {
    const body = appDelegate.slice(appDelegate.indexOf('class SceneDelegate'));

    // 만들자마자 넘겨야 JS 가 첫 프레임에서 동의 폼을 띄워도 nil 이 아니다.
    expect(body).toMatch(/appDelegate\.window = window/);
    // scene 이 끊기면 죽은 window 를 들고 있지 않는다.
    expect(body).toMatch(/func sceneDidDisconnect/);
    expect(body).toMatch(/appDelegate\.window = nil/);
  });
});
