const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const assetsDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'adi-registration.properties'), 'DO7JFNQGXSTYSAAAAAAAAAAAAA');
      return config;
    },
  ]);
}

// Strip over-broad permissions auto-injected by transitive libraries.
// `tools:node="remove"` instructs the Android manifest merger to drop the
// permission even when a library re-declares it.
const PERMISSIONS_TO_REMOVE = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

function withStrippedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const existing = manifest['uses-permission'] ?? [];
    const kept = existing.filter(
      (p) => !PERMISSIONS_TO_REMOVE.includes(p.$['android:name'])
    );
    for (const name of PERMISSIONS_TO_REMOVE) {
      kept.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    manifest['uses-permission'] = kept;
    return cfg;
  });
}

module.exports = {
  expo: {
    name: "Dukanoh",
    slug: "Dukanoh",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "dukanoh",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.m41dul.dukanoh",
      // Universal Links: pairs with /.well-known/apple-app-site-association
      // served from dukanoh.com. Apple verifies the AASA on install; after
      // that, tapping https://dukanoh.com/listing/* opens the app instead of
      // Safari (falls back to Safari + the Phase A landing page if the app
      // isn't installed).
      associatedDomains: ["applinks:dukanoh.com"],
      entitlements: {
        "com.apple.developer.in-app-payments": ["merchant.com.m41dul.dukanoh"],
      },
      infoPlist: {
        LSApplicationQueriesSchemes: ["whatsapp"],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.m41dul.dukanoh",
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      permissions: ["android.permission.VIBRATE"],
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      // App Links: pairs with /.well-known/assetlinks.json on dukanoh.com.
      // autoVerify makes Android verify domain ownership at install; once
      // verified, tapping https://dukanoh.com/listing/* opens the app
      // directly. Falls back to Chrome + the Phase A page otherwise.
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "dukanoh.com", pathPrefix: "/listing/" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      withAdiRegistration,
      withStrippedPermissions,
      "expo-router",
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow Dukanoh to access your photos to add listing images.",
          "cameraPermission": "Allow Dukanoh to use your camera to take listing photos.",
          // We never use video / audio in the listing flow — only stills. Setting
          // this to false drops NSMicrophoneUsageDescription from iOS Info.plist
          // (so Apple review can't reject a placeholder string) and adds
          // RECORD_AUDIO to Android's blocked permissions list.
          "microphonePermission": false
        }
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#3735C5",
          dark: {
            backgroundColor: "#3735C5",
          },
        },
      ],
      "expo-notifications",
      "expo-apple-authentication",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: "com.googleusercontent.apps.1068510485053-3ndrqrn4rootrop6g2l06hd8hsu751eh",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "e5ad6f47-164f-4643-acf8-cbec6def7e8a",
      },
    },
    owner: "m41dul",
  },
};
