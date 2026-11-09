const { TwaManifest, TwaGenerator, ConsoleLog } = require('@bubblewrap/core');
(async () => {
  const out = process.argv[2], ks = process.argv[3];
  const m = new TwaManifest({
    packageId: 'io.github.chiniak.podroznik', host: 'chiniak.github.io', name: 'Podróżnik', launcherName: 'Podróżnik',
    display: 'standalone', orientation: 'portrait', themeColor: '#0f6e6e', themeColorDark: '#0e1416', navigationColor: '#0e1416',
    navigationColorDark: '#0e1416', backgroundColor: '#0e1416', enableNotifications: true,
    startUrl: '/podroznik/index.html#/podroze', fullScopeUrl: 'https://chiniak.github.io/podroznik/',
    iconUrl: 'http://localhost:8765/podroznik/icon-512.png', maskableIconUrl: 'http://localhost:8765/podroznik/icon-512.png',
    splashScreenFadeOutDuration: 300, signingKey: { path: ks, alias: 'podroznik' }, appVersionCode: 1, appVersion: '1.0.0',
    webManifestUrl: 'http://localhost:8765/podroznik/manifest.webmanifest', fallbackType: 'customtabs', minSdkVersion: 21,
    shareTarget: { action: '/podroznik/index.html', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
    generatorApp: 'bubblewrap-core', shortcuts: [],
  });
  await new TwaGenerator().createTwaProject(out, m, new ConsoleLog('twa'));
  await m.saveToFile(out + '/twa-manifest.json');
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
