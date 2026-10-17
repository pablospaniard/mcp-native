import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "io.github.pablospaniard.mcpnative.compose.consumer"
  compileSdk = 36

  defaultConfig {
    applicationId = "io.github.pablospaniard.mcpnative.compose.consumer"
    minSdk = 33
    targetSdk = 36
    versionCode = 1
    versionName = "1"
  }
  buildFeatures { compose = true }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
  implementation("io.github.pablospaniard:mcp-native-compose:0.0.0-local")
}
