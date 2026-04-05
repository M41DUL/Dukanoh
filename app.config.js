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
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow Dukanoh to access your photos to add listing images.",
          "cameraPermission": "Allow Dukanoh to use your camera to take listing photos."
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
